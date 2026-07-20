const { authenticate, readBody, requireCityStaff, send, withCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });
    const staffError = requireCityStaff(auth);
    if (staffError) return send(res, 403, staffError);

    const body = await readBody(req);
    const action = body.action === 'deactivate' ? 'deactivate' : 'create';

    if (action === 'deactivate') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Announcement id is required.' });

      let query = auth.supabase.from('announcements').update({ active: false }).eq('id', id);
      if (auth.user.role !== 'super_admin') query = query.eq('city_id', auth.user.city_id);
      const { error } = await query;
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    const title = String(body.title || '').trim();
    const postBody = String(body.body || '').trim();
    if (!title || !postBody) return send(res, 400, { error: 'Title and announcement text are required.' });

    const cityId =
      body.cityId && auth.user.role === 'super_admin' ? body.cityId : auth.user.city_id;

    const { data: announcement, error } = await auth.supabase
      .from('announcements')
      .insert({
        city_id: cityId,
        author_id: auth.user.id,
        author_name: auth.user.full_name || auth.user.username,
        title,
        body: postBody,
        title_hi: body.titleHi ? String(body.titleHi).trim() : null,
        body_hi: body.bodyHi ? String(body.bodyHi).trim() : null,
      })
      .select()
      .single();
    if (error) throw error;

    return send(res, 200, { announcement });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not save announcement.' });
  }
};
