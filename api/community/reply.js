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
    const replyBody = String(body.body || '').trim();
    if (!postId || !replyBody) return send(res, 400, { error: 'Write a reply first.' });

    const { error } = await auth.supabase.from('community_replies').insert({
      post_id: postId,
      body: replyBody,
      author_id: auth.user.id,
      author_name: auth.user.full_name || auth.user.username,
    });
    if (error) throw error;
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not send reply.' });
  }
};
