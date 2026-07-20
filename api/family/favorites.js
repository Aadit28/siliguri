const { authenticate, readBody, requireFamilyLink, send, withCors } = require('../_lib/auth');

const COLS = 'id,parent_id,service_id,note,added_by,created_at,services(name,phone,category)';

function toFavorite(row) {
  const service = row.services || null;
  return {
    id: row.id,
    parentId: row.parent_id,
    serviceId: row.service_id,
    name: service ? service.name : '',
    phone: service ? service.phone || null : null,
    category: service ? service.category || null : null,
    note: row.note || null,
    addedBy: row.added_by || null,
    createdAt: row.created_at,
  };
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const parentId = String(body.parentId || '');
    if (!parentId) return send(res, 400, { error: 'parentId is required.' });
    const linkError = await requireFamilyLink(auth, parentId);
    if (linkError) return send(res, 403, linkError);

    const action = ['list', 'add', 'remove'].includes(body.action) ? body.action : 'list';

    if (action === 'add') {
      const serviceId = String(body.serviceId || '');
      if (!serviceId) return send(res, 400, { error: 'A service is required.' });
      const { data, error } = await auth.supabase
        .from('family_favorites')
        .upsert(
          {
            parent_id: parentId,
            service_id: serviceId,
            added_by: auth.user.id,
            note: body.note ? String(body.note).trim() : null,
          },
          { onConflict: 'parent_id,service_id' },
        )
        .select(COLS)
        .single();
      if (error) throw error;
      return send(res, 200, { favorite: toFavorite(data) });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Favorite id is required.' });
      const { error } = await auth.supabase
        .from('family_favorites')
        .delete()
        .eq('id', id)
        .eq('parent_id', parentId);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    // list
    const { data, error } = await auth.supabase
      .from('family_favorites')
      .select(COLS)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return send(res, 200, { favorites: (data || []).map(toFavorite) });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not update favorites.' });
  }
};
