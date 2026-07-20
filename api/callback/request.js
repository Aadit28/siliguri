const { adminClient, authenticate, readBody, send, withCors } = require('../_lib/auth');

const SOURCES = new Set(['help', 'assistant', 'service']);

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readBody(req);
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const issue = String(body.issue || '').trim();
    const source = SOURCES.has(body.source) ? body.source : 'help';
    const serviceId = body.serviceId ? String(body.serviceId) : null;

    if (!name || !phone) return send(res, 400, { error: 'Add a name and phone number.' });
    if (phone.replace(/\D/g, '').length < 8) return send(res, 400, { error: 'Add a valid phone number.' });

    let userId = null;
    const hasToken = Boolean(String(req.headers.authorization || req.headers.Authorization || '').trim());
    let supabase = adminClient();
    if (hasToken) {
      const auth = await authenticate(req);
      if (!auth.error) {
        userId = auth.user.id;
        supabase = auth.supabase;
      }
    }

    // Best-effort dedupe: one request per phone per 10 minutes
    const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent, error: recentError } = await adminClient()
      .from('callback_requests')
      .select('id')
      .eq('phone', phone)
      .gte('created_at', cutoff)
      .limit(1);
    if (!recentError && recent && recent.length > 0) {
      return send(res, 429, {
        error: 'We already have your request. Our team will call you back soon.',
      });
    }

    const { error } = await supabase.from('callback_requests').insert({
      name,
      phone,
      issue,
      source,
      service_id: serviceId,
      user_id: userId,
      status: 'new',
    });

    if (error) throw error;
    return send(res, 200, { ok: true });
  } catch (error) {
    console.error('callback/request error:', error);
    return send(res, 500, { error: 'Could not save callback request. Please try again.' });
  }
};
