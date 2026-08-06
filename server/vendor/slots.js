const { authenticate, send, withCors } = require('../_lib/auth');
const {
  rangeEnd,
  rangeStart,
  requestParams,
  toBooking,
} = require('../bookings/_shared');
const { respondVendorError, resolveVendorContext, toVendorSlot } = require('./_shared');

// The vendor's week: the slots they have published in a date range, plus the
// bookings that are waiting on them right now.
//
// Both in one answer, and one round trip, because they are one screen. A slot
// grid that needed a second request to learn which of those times somebody is
// waiting on would show a vendor an empty-looking Tuesday that actually has a
// family holding their phone.
//
// Read-only. Every write lives in slot-save, slot-delete and booking-decide.

const MAX_SLOTS = 300;
const MAX_PENDING = 50;
const DEFAULT_RANGE_DAYS = 7;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The vendor's calendar starts at midnight, not at "now" like the elder's
// search does: a vendor looking at today needs to see the 9am they already
// filled, which is the whole point of a calendar and useless to an elder who
// cannot book it.
function istDateString(offsetDays = 0) {
  const shifted = new Date(Date.now() + IST_OFFSET_MS + offsetDays * 24 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

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

    const params = await requestParams(req);
    const { service, services } = await resolveVendorContext(auth, params.vendorId);

    const from = rangeStart(params.dateFrom || istDateString(0));
    const to = rangeEnd(params.dateTo || istDateString(DEFAULT_RANGE_DAYS));
    if (to && to <= from) return send(res, 400, { error: 'dateTo must be after dateFrom.' });

    // '*' rather than a column list: vendor_slots.price_paise arrives in
    // migration 20 and naming it here 500s the request on a project that is
    // behind. toVendorSlot reads it off the row when it exists.
    let query = auth.supabase
      .from('vendor_slots')
      .select('*')
      .eq('vendor_id', service.id)
      .gte('starts_at', from)
      .order('starts_at', { ascending: true })
      .limit(MAX_SLOTS);
    if (to) query = query.lt('starts_at', to);

    const { data: slotRows, error: slotError } = await query;
    if (slotError) throw slotError;

    // Deliberately NOT bounded by the date range. A booking waiting on this
    // vendor is waiting whether or not the week they are looking at contains
    // it, and the 15-minute sweep cancels it either way — hiding it behind a
    // date filter would mean a vendor loses bookings by scrolling.
    const { data: pendingRows, error: pendingError } = await auth.supabase
      .from('bookings')
      .select('*')
      .eq('vendor_id', service.id)
      .eq('status', 'pending_vendor')
      .order('updated_at', { ascending: true })
      .limit(MAX_PENDING);
    if (pendingError) throw pendingError;

    const pending = pendingRows || [];
    const slots = slotRows || [];
    const slotById = new Map(slots.map((row) => [row.id, row]));

    // A pending booking can sit on a slot outside the range above; fetch the
    // stragglers so every waiting card can still say what time it is for.
    const missingSlotIds = [
      ...new Set(pending.map((row) => row.slot_id).filter((id) => id && !slotById.has(id))),
    ];
    if (missingSlotIds.length) {
      const { data: extra, error: extraError } = await auth.supabase
        .from('vendor_slots')
        .select('*')
        .in('id', missingSlotIds);
      if (extraError) throw extraError;
      for (const row of extra || []) slotById.set(row.id, row);
    }

    // Who the appointment is for. Read separately rather than through a
    // PostgREST embed: bookings has two foreign keys into user_accounts
    // (family_id and elder_id), so an embed has to be disambiguated by
    // constraint name, and that name is a thing a later migration can rename
    // out from under this file.
    const elderIds = [...new Set(pending.map((row) => row.elder_id).filter(Boolean))];
    const nameById = new Map();
    if (elderIds.length) {
      const { data: elders, error: elderError } = await auth.supabase
        .from('user_accounts')
        .select('id,full_name,username')
        .in('id', elderIds);
      if (elderError) throw elderError;
      for (const row of elders || []) nameById.set(row.id, row.full_name || row.username || null);
    }

    return send(res, 200, {
      vendor: services.find((row) => row.id === service.id) || null,
      // Every listing this login owns, so the screen can offer a switcher
      // without a second call.
      vendors: services,
      slots: slots.map(toVendorSlot),
      pending: pending.map((row) => {
        const slot = slotById.get(row.slot_id) || null;
        return {
          ...toBooking(row),
          startsAt: slot?.starts_at || null,
          durationMin: slot ? Number(slot.duration_min || 0) : null,
          // First name only would be friendlier but this is the person the
          // vendor is about to receive; they need what the family gave.
          elderName: nameById.get(row.elder_id) || null,
        };
      }),
    });
  } catch (error) {
    return respondVendorError(res, error, 'Could not load your appointment times. Please try again.');
  }
};
