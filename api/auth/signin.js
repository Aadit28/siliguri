const {
  adminClient,
  createSession,
  localPhoneUserId,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  send,
  validatePassword,
  validatePhone,
  validateUsername,
  withCors,
} = require('../_lib/auth');

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

    const supabase = adminClient();
    let { data: user, error } = await (phone
      ? supabase
          .from('user_accounts')
          .select('id,username,full_name,phone_number,password_hash,password_salt,created_at')
          .eq('phone_number', phone)
          .maybeSingle()
      : supabase
          .from('user_accounts')
          .select('id,username,full_name,password_hash,password_salt,created_at')
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
          .select('id,username,full_name,password_hash,password_salt,created_at')
          .eq('id', userId)
          .maybeSingle();
        user = fallback.data ? { ...fallback.data, phone_number: phone } : null;
        error = fallback.error;
      }
      if (error) throw error;
    }
    if (!user || passwordHash(password, user.password_salt) !== user.password_hash) {
      return send(res, 401, {
        error: phone ? 'Invalid phone number or password.' : 'Invalid username or password.',
      });
    }

    const session = await createSession(supabase, user.id);
    return send(res, 200, { session: { ...session, user: publicUser(user) } });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not sign in.' });
  }
};
