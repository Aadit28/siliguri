const { authenticate, publicUser, send, withCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });
    return send(res, 200, { user: publicUser(auth.user) });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not load account.' });
  }
};
