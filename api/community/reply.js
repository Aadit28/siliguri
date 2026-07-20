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

    let { data: post, error: postError } = await auth.supabase
      .from('community_posts')
      .select('id, status')
      .eq('id', postId)
      .maybeSingle();
    if (postError && /status/i.test(postError.message || '')) {
      ({ data: post, error: postError } = await auth.supabase
        .from('community_posts')
        .select('id')
        .eq('id', postId)
        .maybeSingle());
    }
    if (postError) throw postError;
    if (!post || (post.status && post.status !== 'approved')) {
      return send(res, 404, { error: 'This post is not open for replies.' });
    }

    const { error } = await auth.supabase.from('community_replies').insert({
      post_id: postId,
      body: replyBody,
      author_id: auth.user.id,
      author_name: auth.user.full_name || auth.user.username,
    });
    if (error) throw error;
    return send(res, 200, { ok: true });
  } catch (error) {
    console.error('community/reply error:', error);
    return send(res, 500, { error: 'Could not send reply. Please try again.' });
  }
};
