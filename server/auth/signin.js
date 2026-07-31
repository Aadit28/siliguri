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

    if (!allowByIp(requestIp(req)) || !allowByIdentifier(phone || username)) {
      return send(res, 429, { error: 'Too many sign-in attempts. Try again in a few minutes.' });
    }

    const supabase = adminClient();

    // Durable caps on FAILED attempts only (migration 12): the in-memory
    // limiter above resets on every cold start, so it is burst protection, not
    // an actual ceiling. Successful sign-ins are never counted — a family
    // sharing one tablet must not lock themselves out by using it.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const failBuckets = [
      `signin-fail:id:${phone || username}`,
      `signin-fail:ip:${requestIp(req)}`,
    ];
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
      await recordDurable(supabase, failBuckets);
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
