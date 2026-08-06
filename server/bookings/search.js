const { authenticate, send, sendServerError, withCors } = require('../_lib/auth');
const {
  VENDOR_CATEGORIES,
  rangeEnd,
  rangeStart,
  requestParams,
  requireUuid,
  toSlot,
} = require('./_shared');

// Read-only slot lookup: the first of the three booking operations and the only
// one that changes nothing. Every id it returns is real, which is what lets the
// voice agent hold one without inventing an appointment.
//
// '*' on the slot itself, not a column list, and the same on the services reads
// below: vendor_slots.price_paise and services.base_price_paise arrive in
// migration 20, and naming a column PostgREST has not seen yet 500s the whole
// request on whichever project is behind. The embedded vendor list is still
// explicit because every column in it predates migration 17.
const SLOT_COLUMNS = '*,vendor:services(id,name,category,phone,address)';
const MAX_VENDORS = 200;
const MAX_SLOTS = 200;

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    // Citizen data is scoped by city on the server, and the caller's own city is
    // the only one they may search: a Siliguri elder must never be offered an
    // appointment they cannot physically reach.
    const cityId = auth.user.city_id || null;
    if (!cityId) {
      return send(res, 409, { error: 'Choose your city before looking for appointment times.' });
    }

    const params = await requestParams(req);
    const requestedVendor = String(params.vendorId || '').trim();
    const category = String(params.category || '').trim();
    if (!requestedVendor && !category) {
      return send(res, 400, { error: 'Send a vendorId or a category.' });
    }

    // Slots are scoped through their vendor rather than through the slot's own
    // city_id column: services.city_id is the city of record for the directory,
    // and a slot belongs to whichever city its vendor is in.
    // The vendors' standing rates, collected on the way past: a slot without a
    // price of its own is sold at its vendor's base_price_paise, and that lives
    // on services rather than on the slot row.
    let vendorIds;
    const basePriceByVendor = new Map();
    if (requestedVendor) {
      const vendorId = requireUuid(requestedVendor, 'vendorId');
      const { data, error } = await auth.supabase
        .from('services')
        .select('*')
        .eq('id', vendorId)
        .eq('city_id', cityId)
        .maybeSingle();
      if (error) throw error;
      // A vendor from another city is "not found" here rather than an empty
      // list, so a wrong id reads as the mistake it is.
      if (!data) return send(res, 404, { error: 'That service was not found in your city.' });
      vendorIds = [vendorId];
      basePriceByVendor.set(vendorId, data.base_price_paise);
    } else {
      if (!VENDOR_CATEGORIES.includes(category)) {
        return send(res, 400, { error: 'Pick a valid category.' });
      }
      const { data, error } = await auth.supabase
        .from('services')
        .select('*')
        .eq('city_id', cityId)
        .eq('category', category)
        .limit(MAX_VENDORS);
      if (error) throw error;
      vendorIds = (data || []).map((row) => row.id);
      for (const row of data || []) basePriceByVendor.set(row.id, row.base_price_paise);
    }
    if (!vendorIds.length) return send(res, 200, { slots: [] });

    const from = rangeStart(params.dateFrom);
    const to = rangeEnd(params.dateTo);
    if (to && to <= from) return send(res, 400, { error: 'dateTo must be after dateFrom.' });

    let query = auth.supabase
      .from('vendor_slots')
      .select(SLOT_COLUMNS)
      .in('vendor_id', vendorIds)
      .gte('starts_at', from)
      .order('starts_at', { ascending: true })
      .limit(MAX_SLOTS);
    if (to) query = query.lt('starts_at', to);

    const { data, error } = await query;
    if (error) throw error;
    return send(res, 200, {
      slots: (data || []).map((row) => toSlot(row, basePriceByVendor.get(row.vendor_id))),
    });
  } catch (error) {
    return sendServerError(res, error, 'Could not load appointment times. Please try again.');
  }
};
