const { authenticate, readBody, send, withCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const postId = String(body.postId || '').trim();
    const liked = Boolean(body.liked);
    if (!postId) return send(res, 400, { error: 'Missing post.' });

    const query = auth.supabase.from('post_likes');
    const { error } = liked
      ? await query.delete().match({ post_id: postId, user_id: auth.user.id })
      : await query.insert({ post_id: postId, user_id: auth.user.id });
    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) throw error;
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not update like.' });
  }
};
