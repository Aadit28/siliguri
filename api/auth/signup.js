const crypto = require('crypto');
const {
  adminClient,
  createSession,
  localPhoneUserId,
  normalizePhone,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  saveLocalPhoneAuth,
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
    let username = normalizeUsername(body.username);
    const fullName = String(body.fullName || '').trim();
    const password = String(body.password || '');
    const validationError =
      (!fullName ? 'Enter your full name.' : undefined) ||
      validateUsername(username) ||
      validatePhone(phone) ||
      validatePassword(password);
    if (validationError) return send(res, 400, { error: validationError });

    const supabase = adminClient();
    if (phone && localPhoneUserId(phone)) {
      return send(res, 409, { error: 'That phone number is already registered.' });
    }
    const salt = crypto.randomBytes(16).toString('base64');
    const insertRow = {
      username,
      full_name: fullName,
      password_salt: salt,
      password_hash: passwordHash(password, salt),
      phone_number: phone,
    };
    let { data: user, error } = await supabase
      .from('user_accounts')
      .insert(insertRow)
      .select('id,username,full_name,phone_number,created_at')
      .single();

    if (error) {
      if (phone && String(error.message || '').toLowerCase().includes('phone_number')) {
        const fallbackRow = { ...insertRow };
        delete fallbackRow.phone_number;
        const fallback = await supabase
          .from('user_accounts')
          .insert(fallbackRow)
          .select('id,username,full_name,created_at')
          .single();
        user = fallback.data ? { ...fallback.data, phone_number: null } : null;
        error = fallback.error;
        if (!error && user) {
          saveLocalPhoneAuth(phone, user.id);
          const session = await createSession(supabase, user.id);
          return send(res, 200, { session: { ...session, user: publicUser({ ...user, phone_number: phone }) } });
        }
      }
      const message = String(error.message || '').toLowerCase();
      if (message.includes('duplicate')) {
        // Postgres names the violated constraint (user_accounts_username_key /
        // user_accounts_phone_number_key) — blame the right field.
        return send(res, 409, {
          error: message.includes('phone')
            ? 'That phone number is already registered.'
            : 'That username is already taken.',
        });
      }
      throw error;
    }

    if (phone) saveLocalPhoneAuth(phone, user.id);
    const session = await createSession(supabase, user.id);
    return send(res, 200, { session: { ...session, user: publicUser(user) } });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not create account.' });
  }
};
