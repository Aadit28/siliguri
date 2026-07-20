const { authenticate, readBody, requireFamilyLink, send, withCors } = require('../_lib/auth');

const CATEGORIES = ['doctor', 'grocery', 'pharmacy', 'hospital', 'helper', 'other'];
const COLS = 'id,parent_id,category,service_id,name,phone,note,set_by,created_at';

function toMember(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    category: row.category,
    serviceId: row.service_id || null,
    name: row.name,
    phone: row.phone || null,
    note: row.note || null,
    setBy: row.set_by || null,
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

    const action = ['list', 'set', 'remove'].includes(body.action) ? body.action : 'list';

    if (action === 'set') {
      const category = CATEGORIES.includes(body.category) ? body.category : null;
      const name = String(body.name || '').trim();
      if (!category) return send(res, 400, { error: 'Pick a valid category.' });
      if (!name) return send(res, 400, { error: 'A name is required.' });

      const fields = {
        category,
        name,
        phone: body.phone ? String(body.phone).trim() : null,
        note: body.note ? String(body.note).trim() : null,
        service_id: body.serviceId ? String(body.serviceId) : null,
      };

      const id = String(body.id || '');
      if (id) {
        const { data, error } = await auth.supabase
          .from('care_team')
          .update(fields)
          .eq('id', id)
          .eq('parent_id', parentId)
          .select(COLS)
          .maybeSingle();
        if (error) throw error;
        if (!data) return send(res, 404, { error: 'Contact not found.' });
        return send(res, 200, { member: toMember(data) });
      }

      const { data, error } = await auth.supabase
        .from('care_team')
        .insert({ parent_id: parentId, set_by: auth.user.id, ...fields })
        .select(COLS)
        .single();
      if (error) throw error;
      return send(res, 200, { member: toMember(data) });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Contact id is required.' });
      const { error } = await auth.supabase
        .from('care_team')
        .delete()
        .eq('id', id)
        .eq('parent_id', parentId);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    // list
    const { data, error } = await auth.supabase
      .from('care_team')
      .select(COLS)
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return send(res, 200, { members: (data || []).map(toMember) });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not update the care team.' });
  }
};
