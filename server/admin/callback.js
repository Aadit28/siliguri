const { authenticate, readBody, requireCityStaff, send, sendServerError, withCors } = require('../_lib/auth');
const { sendPushToUsers } = require('../_lib/push');

// Callback requests are city-level operational work. City staff can list them
// and move them through the queue: new -> contacted -> closed (or spam).
const STATUSES = new Set(['new', 'queued', 'contacted', 'closed', 'spam']);

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

    // Citizen names/phones are PII. Super admins see every row. A city admin
    // sees their own city plus rows with no city, because an unauthenticated
    // help-desk request has no city to stamp and still has to reach someone.
    // City helpers are the untrusted tier (they cannot verify services or
    // manage staff either), so they see their own city only.
    const isSuperAdmin = auth.user.role === 'super_admin';
    const isHelper = auth.user.role === 'city_helper';
    const cityScoped = !isSuperAdmin && auth.user.city_id;
    const cityFilter = isHelper
      ? `city_id.eq.${auth.user.city_id}`
      : `city_id.eq.${auth.user.city_id},city_id.is.null`;

    if (action === 'status') {
      const id = String(body.id || '');
      const status = String(body.status || '');
      if (!id) return send(res, 400, { error: 'Request id is required.' });
      if (!STATUSES.has(status)) return send(res, 400, { error: 'Choose a valid status.' });
      const patch = { status };
      if (status === 'closed') patch.resolved_at = new Date().toISOString();
      let update = auth.supabase.from('callback_requests').update(patch).eq('id', id);
      if (cityScoped) update = update.or(cityFilter);
      const { data: updated, error } = await update.select('id,user_id');
      if (error) throw error;
      if (!updated || updated.length === 0) return send(res, 404, { error: 'Request not found.' });
      // Tell the requester their help request moved — only for the two states
      // that mean something to them. 'spam'/'queued' are internal.
      const requesterId = updated[0].user_id;
      if (requesterId && (status === 'contacted' || status === 'closed')) {
        await sendPushToUsers(auth.supabase, [requesterId], {
          title: 'Saathi help desk',
          body:
            status === 'contacted'
              ? 'We tried to reach you about your request. Please pick up or call back.'
              : 'Your help request has been resolved.',
          url: '/help',
        });
      }
      return send(res, 200, { ok: true });
    }

    let query = auth.supabase
      .from('callback_requests')
      .select('id,name,phone,issue,source,status,service_id,city_id,created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (cityScoped) query = query.or(cityFilter);
    const { data: requests, error } = await query;
    if (error) throw error;
    return send(res, 200, { requests: requests || [] });
  } catch (error) {
    return sendServerError(res, error, 'Could not load callback requests.');
  }
};
