const { authenticate, readBody, send, withCors } = require('../_lib/auth');

const CATEGORIES = new Set(['general', 'health', 'travel', 'daily_life', 'best_practice']);

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const title = String(body.title || '').trim();
    const postBody = String(body.body || '').trim();
    const category = CATEGORIES.has(body.category) ? body.category : 'general';
    if (!title || !postBody) return send(res, 400, { error: 'Add a title and message.' });

    const insertPayload = {
      title,
      body: postBody,
      category,
      author_id: auth.user.id,
      author_name: auth.user.full_name || auth.user.username,
      status: 'pending',
    };
    let { error } = await auth.supabase.from('community_posts').insert(insertPayload);
    if (error && /status/i.test(error.message || '')) {
      const { status, ...legacyPayload } = insertPayload;
      ({ error } = await auth.supabase.from('community_posts').insert(legacyPayload));
    }
    if (error) throw error;
    return send(res, 200, { ok: true, status: 'pending' });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not post.' });
  }
};
