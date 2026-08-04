const {
  adminClient,
  allowDurable,
  createSession,
  hashesMatch,
  recordDurable,
  localPhoneUserId,
  makeRateLimiter,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  requestIp,
  send,
  sendServerError,
  validatePassword,
  validatePhone,
  validateUsername,
  withCors,
} = require('../_lib/auth');

// Burst protection against credential stuffing (per-instance; see auth.js).
// Only FAILED attempts are charged. Indian mobile carriers put many subscribers
// behind one public address, so a shared IP reaching 20 sign-ins in a quarter of
// an hour is a normal morning for a hundred users, not an attack — charging
// successes would lock out the people who typed their password correctly.
const allowByIp = makeRateLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
const allowByIdentifier = makeRateLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const phone = normalizePhone(body.phone);
    const username = phone ? '' : normalizeUsername(body.username);
    const password = String(body.password || '');
    const validationError =
      (phone ? validatePhone(phone) : validateUsername(username)) || validatePassword(password);
    if (validationError) return send(res, 400, { error: validationError });

    const ip = requestIp(req);
    const identifier = phone || username;
    if (!allowByIp.check(ip) || !allowByIdentifier.check(identifier)) {
      return send(res, 429, { error: 'Too many sign-in attempts. Try again in a few minutes.' });
    }

    const supabase = adminClient();

    // Durable caps on FAILED attempts only (migration 12): the in-memory
    // limiter above resets on every cold start, so it is burst protection, not
    // an actual ceiling. Successful sign-ins are never counted — a family
    // sharing one tablet must not lock themselves out by using it.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const failBuckets = [`signin-fail:id:${identifier}`, `signin-fail:ip:${ip}`];
    // Every 401 below goes through here, so the burst window and the daily
    // ceiling always move together.
    const recordFailure = async () => {
      allowByIp.record(ip);
      allowByIdentifier.record(identifier);
      await recordDurable(supabase, failBuckets);
    };
    const [idAllowed, ipAllowed] = await Promise.all([
      allowDurable(supabase, failBuckets[0], { max: 15, windowMs: DAY_MS }),
      allowDurable(supabase, failBuckets[1], { max: 60, windowMs: DAY_MS }),
    ]);
    if (!idAllowed || !ipAllowed) {
      return send(res, 429, { error: 'Too many failed sign-in attempts. Try again tomorrow.' });
    }
    let { data: user, error } = await (phone
      ? supabase
          .from('user_accounts')
          .select('id,username,full_name,phone_number,password_hash,password_salt,role,city_id,created_at')
          .eq('phone_number', phone)
          .maybeSingle()
      : supabase
          .from('user_accounts')
          .select('id,username,full_name,password_hash,password_salt,role,city_id,created_at')
          .eq('username', username)
          .maybeSingle());

    if (error) {
      if (phone && String(error.message || '').toLowerCase().includes('phone_number')) {
        const userId = localPhoneUserId(phone);
        if (!userId) {
          await recordFailure();
          return send(res, 401, { error: 'Invalid phone number or password.' });
        }
        const fallback = await supabase
          .from('user_accounts')
          .select('id,username,full_name,password_hash,password_salt,role,city_id,created_at')
          .eq('id', userId)
          .maybeSingle();
        user = fallback.data ? { ...fallback.data, phone_number: phone } : null;
        error = fallback.error;
      }
      if (error) throw error;
    }
    if (!user || !hashesMatch(passwordHash(password, user.password_salt), user.password_hash)) {
      await recordFailure();
      return send(res, 401, {
        error: phone ? 'Invalid phone number or password.' : 'Invalid username or password.',
      });
    }

    const session = await createSession(supabase, user.id);
    return send(res, 200, { session: { ...session, user: publicUser(user) } });
  } catch (error) {
    return sendServerError(res, error, 'Could not sign in.');
  }
};
