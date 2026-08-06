const { authenticate, send, sendServerError, withCors } = require('../_lib/auth');

// Purposes a user can grant or withdraw. A purpose outside this list is not a
// bug in the caller's spelling worth guessing at, so both endpoints reject it
// the same way pickAction rejects an unknown action.
const PURPOSES = ['care_coordination', 'health_reminders', 'guardian_sharing', 'marketing'];

// consents is append-only (migration 18): one row per grant or withdrawal
// event, never an update, so the current state of a purpose is the highest id
// for that (user_id, purpose). granted_at set (with withdrawn_at null, per the
// table's own check constraint) means the purpose is currently granted.
function toConsent(purpose, row) {
  if (!row) return { purpose, granted: false, version: null, updatedAt: null };
  return {
    purpose,
    granted: Boolean(row.granted_at),
    version: row.version,
    updatedAt: row.granted_at || row.withdrawn_at || null,
  };
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    // Every event for this user, newest first, so the first row seen per
    // purpose below is that purpose's latest state.
    const { data, error } = await auth.supabase
      .from('consents')
      .select('purpose,version,granted_at,withdrawn_at')
      .eq('user_id', auth.user.id)
      .in('purpose', PURPOSES)
      .order('id', { ascending: false });
    if (error) throw error;

    const latestByPurpose = new Map();
    for (const row of data || []) {
      if (!latestByPurpose.has(row.purpose)) latestByPurpose.set(row.purpose, row);
    }

    const consents = PURPOSES.map((purpose) => toConsent(purpose, latestByPurpose.get(purpose)));
    return send(res, 200, { consents });
  } catch (error) {
    return sendServerError(res, error, 'Could not load consent settings.');
  }
};

module.exports.PURPOSES = PURPOSES;
