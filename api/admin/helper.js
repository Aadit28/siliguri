const { authenticate, normalizeUsername, readBody, requireAdmin, send, withCors } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });
    const adminError = requireAdmin(auth);
    if (adminError) return send(res, 403, adminError);

    const body = await readBody(req);
    const action = ['list', 'add', 'remove'].includes(body.action) ? body.action : 'list';
    const isSuperAdmin = auth.user.role === 'super_admin';

    if (action === 'add') {
      const username = normalizeUsername(body.username);
      if (!username) return send(res, 400, { error: 'Username is required.' });

      const cityId = body.cityId && isSuperAdmin ? body.cityId : auth.user.city_id;
      if (!cityId) return send(res, 400, { error: 'Your admin account has no city assigned.' });

      const { data: account, error: fetchError } = await auth.supabase
        .from('user_accounts')
        .select('id,username,role,city_id')
        .eq('username', username)
        .maybeSingle();
      if (fetchError) throw fetchError;
      if (!account) return send(res, 404, { error: 'No account with that username.' });
      if (account.role === 'admin' || account.role === 'super_admin') {
        return send(res, 400, { error: 'That account is already an admin.' });
      }
      if (account.role === 'city_helper') {
        return send(res, 400, { error: 'That account is already a city helper.' });
      }

      const { error } = await auth.supabase
        .from('user_accounts')
        .update({ role: 'city_helper', city_id: cityId })
        .eq('id', account.id);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Helper id is required.' });

      let query = auth.supabase
        .from('user_accounts')
        .update({ role: 'user' })
        .eq('id', id)
        .eq('role', 'city_helper');
      if (!isSuperAdmin) query = query.eq('city_id', auth.user.city_id);
      const { error } = await query;
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    let query = auth.supabase
      .from('user_accounts')
      .select('id,username,full_name,created_at,city_id')
      .eq('role', 'city_helper')
      .order('created_at', { ascending: false });
    if (!isSuperAdmin) query = query.eq('city_id', auth.user.city_id);
    const { data: helpers, error } = await query;
    if (error) throw error;
    return send(res, 200, { helpers: helpers || [] });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not update city helpers.' });
  }
};
