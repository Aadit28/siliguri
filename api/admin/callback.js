const { authenticate, readBody, requireCityStaff, send, withCors } = require('../_lib/auth');

// Callback requests are city-level operational work. City staff can list them
// and move them through the queue: new -> contacted -> closed.
const STATUSES = new Set(['new', 'contacted', 'closed']);

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
    const action = body.action ? String(body.action) : 'list';

    if (action === 'status') {
      const id = String(body.id || '');
      const status = String(body.status || '');
      if (!id) return send(res, 400, { error: 'Request id is required.' });
      if (!STATUSES.has(status)) return send(res, 400, { error: 'Choose a valid status.' });
      const patch = { status };
      if (status === 'closed') patch.resolved_at = new Date().toISOString();
      const { error } = await auth.supabase
        .from('callback_requests')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    const { data: requests, error } = await auth.supabase
      .from('callback_requests')
      .select('id,name,phone,issue,source,status,service_id,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return send(res, 200, { requests: requests || [] });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not load callback requests.' });
  }
};
