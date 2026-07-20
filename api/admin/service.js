const { authenticate, readBody, requireCityStaff, send, withCors } = require('../_lib/auth');

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

    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const category = String(body.category || '');
    if (!CATEGORIES.has(category)) return send(res, 400, { error: 'Choose a valid category.' });
    if (!name) return send(res, 400, { error: 'Service name is required.' });

    const fields = {
      name,
      category,
      description: body.description ? String(body.description).trim() : null,
      phone: body.phone ? String(body.phone).trim() : null,
      address: body.address ? String(body.address).trim() : null,
      map_url: body.map_url ? String(body.map_url).trim() : null,
      hours: body.hours ? String(body.hours).trim() : null,
      upi_id: body.upi_id ? String(body.upi_id).trim() : null,
      verified: isHelper ? false : Boolean(body.verified),
    };

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
    return send(res, 500, { error: error.message || 'Could not save service.' });
  }
};
