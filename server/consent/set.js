const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const { PURPOSES } = require('./get');

// Wraps public.consent_set (migration 18): every call inserts a fresh event
// row rather than updating one, so withdrawing and re-granting the same
// purpose both leave a trace instead of overwriting the last answer.
module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const purpose = String(body.purpose || '').trim();
    const version = String(body.version || '').trim();
    const granted = body.granted;

    if (!PURPOSES.includes(purpose)) {
      return send(res, 400, { error: `Unknown purpose "${purpose}". Expected one of: ${PURPOSES.join(', ')}.` });
    }
    if (!version) return send(res, 400, { error: 'version is required.' });
    if (typeof granted !== 'boolean') return send(res, 400, { error: 'granted must be true or false.' });

    const { data, error } = await auth.supabase.rpc('consent_set', {
      p_user_id: auth.user.id,
      p_purpose: purpose,
      p_version: version,
      p_granted: granted,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    return send(res, 200, {
      consent: {
        purpose: row.purpose,
        granted: Boolean(row.granted_at),
        version: row.version,
        updatedAt: row.granted_at || row.withdrawn_at || null,
      },
    });
  } catch (error) {
    return sendServerError(res, error, 'Could not update consent.');
  }
};
