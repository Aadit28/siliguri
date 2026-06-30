const { authenticate, send, tokenHash, withCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (!auth.error) {
      await auth.supabase
        .from('auth_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token_hash', tokenHash(auth.token));
    }
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not sign out.' });
  }
};
