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
    return send(res, 500, { error: error.message || 'Could not save callback request.' });
  }
};
