const { authenticate, send, sendServerError, withCors } = require('../_lib/auth');
const { BOOKING_COLUMNS, requestParams, resolveFamilyContext, toBooking } = require('./_shared');

// The family's booking list, newest first — the same rows for the elder and for
// the guardian looking in from abroad, so neither is working from a different
// picture of what was arranged.
const MAX_BOOKINGS = 50;

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const params = await requestParams(req);
    const { familyId } = await resolveFamilyContext(auth, params.elderId);

    // No embedded vendor: bookings.vendor_id carries no foreign key, so
    // PostgREST cannot join it. The vendor's details come from the slot search
    // or the services endpoint.
    const { data, error } = await auth.supabase
      .from('bookings')
      .select(BOOKING_COLUMNS)
      .eq('family_id', familyId)
      .order('created_at', { ascending: false })
      .limit(MAX_BOOKINGS);
    if (error) throw error;

    return send(res, 200, { bookings: (data || []).map(toBooking) });
  } catch (error) {
    return sendServerError(res, error, 'Could not load your bookings. Please try again.');
  }
};
