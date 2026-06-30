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
    const password = String(body.password || '');
    const validationError = validateUsername(username) || validatePassword(password);
    if (validationError) return send(res, 400, { error: validationError });

    const supabase = adminClient();
    const { data: user, error } = await supabase
      .from('user_accounts')
      .select('id,username,full_name,password_hash,password_salt,created_at')
      .eq('username', username)
      .maybeSingle();

    if (error) throw error;
    if (!user || passwordHash(password, user.password_salt) !== user.password_hash) {
      return send(res, 401, { error: 'Invalid username or password.' });
    }

    const session = await createSession(supabase, user.id);
    return send(res, 200, { session: { ...session, user: publicUser(user) } });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not sign in.' });
  }
};
