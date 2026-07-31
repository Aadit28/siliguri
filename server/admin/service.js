const { authenticate, readBody, requireCityStaff, send, sendServerError, withCors } = require('../_lib/auth');

const CATEGORIES = new Set(['doctor', 'hospital', 'medical_shop', 'travel_agent', 'elder_home', 'home_service', 'daily_service']);

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });
    const staffError = requireCityStaff(auth);
    if (staffError) return send(res, 403, staffError);
    const isHelper = auth.user.role === 'city_helper';
    const isSuperAdmin = auth.user.role === 'super_admin';

    const body = await readBody(req);
    const action = body.action ? String(body.action) : 'save';

    // List services for this city so admins/helpers can edit or delete them.
    if (action === 'list') {
      let query = auth.supabase
        .from('services')
        .select('id,name,category,phone,address,map_url,hours,description,upi_id,verified,city_id,town')
        .order('name', { ascending: true });
      if (!isSuperAdmin) {
        // A staff account without a city would render "city_id.eq.null" (a
        // PostgREST 500) — same null-branch as announcement.js.
        query = auth.user.city_id
          ? query.or(`city_id.eq.${auth.user.city_id},city_id.is.null`)
          : query.is('city_id', null);
      }
      const { data: services, error } = await query;
      if (error) throw error;
      return send(res, 200, { services: services || [] });
    }

    // Delete a service (with the same ownership rules as an edit).
    if (action === 'delete') {
      const delId = String(body.id || '');
      if (!delId) return send(res, 400, { error: 'Service id is required.' });
      const { data: existing, error: fetchError } = await auth.supabase
        .from('services')
        .select('id,city_id')
        .eq('id', delId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!existing) return send(res, 404, { error: 'Service not found.' });
      if (!isSuperAdmin && existing.city_id && existing.city_id !== auth.user.city_id) {
        return send(res, 403, { error: 'Admin access required.' });
      }
      if (isHelper && !existing.city_id) {
        return send(res, 403, { error: 'Admin access required.' });
      }
      const { error } = await auth.supabase.from('services').delete().eq('id', delId);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    const name = String(body.name || '').trim();
    const category = String(body.category || '');
    if (!CATEGORIES.has(category)) return send(res, 400, { error: 'Choose a valid category.' });
    if (!name) return send(res, 400, { error: 'Service name is required.' });

    // Partial patch: only fields present in the request body are written, so a
    // client that omits a field (older form version) cannot silently null it.
    const fields = { name, category };
    for (const key of ['description', 'phone', 'address', 'map_url', 'hours', 'upi_id']) {
      if (body[key] !== undefined) {
        const value = String(body[key] || '').trim();
        fields[key] = value || null;
      }
    }
    if (body.verified !== undefined || !body.id) {
      fields.verified = isHelper ? false : Boolean(body.verified);
    }

    const id = body.id ? String(body.id) : null;

    if (id) {
      let query = auth.supabase.from('services').select('id,city_id').eq('id', id).maybeSingle();
      const { data: existing, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      if (!existing) return send(res, 404, { error: 'Service not found.' });

      if (auth.user.role !== 'super_admin' && existing.city_id && existing.city_id !== auth.user.city_id) {
        return send(res, 403, { error: 'Admin access required.' });
      }
      // Admins may claim legacy ownerless services; helpers may not.
      if (isHelper && !existing.city_id) {
        return send(res, 403, { error: 'Admin access required.' });
      }

      const updateFields = { ...fields };
      // Verification is an admin trust signal; helpers keep whatever it was.
      if (isHelper) delete updateFields.verified;
      if (!existing.city_id) updateFields.city_id = auth.user.city_id;

      const { data: service, error } = await auth.supabase
        .from('services')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return send(res, 200, { service });
    }

    let town = 'Siliguri';
    if (auth.user.city_id) {
      const { data: city } = await auth.supabase
        .from('cities')
        .select('name')
        .eq('id', auth.user.city_id)
        .maybeSingle();
      if (city && city.name) town = city.name;
    }

    const { data: service, error } = await auth.supabase
      .from('services')
      .insert({
        ...fields,
        city_id: auth.user.city_id,
        town,
      })
      .select()
      .single();
    if (error) throw error;

    return send(res, 200, { service });
  } catch (error) {
    return sendServerError(res, error, 'Could not save service.');
  }
};
