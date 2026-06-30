const crypto = require('crypto');
const {
  adminClient,
  createSession,
  normalizeUsername,
  passwordHash,
  publicUser,
  readBody,
  send,
  validatePassword,
  validateUsername,
  withCors,
} = require('../_lib/auth');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const username = normalizeUsername(body.username);
    const fullName = String(body.fullName || '').trim();
    const password = String(body.password || '');
    const validationError = validateUsername(username) || validatePassword(password);
    if (validationError) return send(res, 400, { error: validationError });

    const supabase = adminClient();
    const salt = crypto.randomBytes(16).toString('base64');
    const { data: user, error } = await supabase
      .from('user_accounts')
      .insert({
        username,
        full_name: fullName || username,
        password_salt: salt,
        password_hash: passwordHash(password, salt),
      })
      .select('id,username,full_name,created_at')
      .single();

    if (error) {
      if (String(error.message || '').toLowerCase().includes('duplicate')) {
        return send(res, 409, { error: 'That username is already taken.' });
      }
      throw error;
    }

    const session = await createSession(supabase, user.id);
    return send(res, 200, { session: { ...session, user: publicUser(user) } });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not create account.' });
  }
};
