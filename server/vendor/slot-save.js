const { badRequest, authenticate, readBody, send, withCors } = require('../_lib/auth');
const { httpError, requireUuid } = require('../bookings/_shared');
const {
  enforceVendorRateLimit,
  isMissingColumn,
  respondVendorError,
  resolveVendorContext,
  toVendorSlot,
} = require('./_shared');

// Create or change one appointment time.
//
// Two doors into the same row and both end up here:
//   * with a slotId — the vendor tapped an existing slot and changed its seats
//     or its price;
//   * without one — a new time, which upserts on (vendor_id, starts_at) so
//     re-adding a time that already exists edits it instead of failing on the
//     unique constraint from migration 17. A vendor adding "10:00" twice means
//     "make 10:00 look like this", not "error".
//
// What this file deliberately does NOT do is check capacity against seats
// already sold. vendor_slots carries `check (booked <= capacity)`, so Postgres
// refuses the shrink inside the same statement that would perform it. Doing it
// here as well would be a read-then-write with a hold able to land in the gap —
// the check would pass and the constraint would fire anyway, just with a worse
// error. The 23514 handler below turns that constraint into the sentence.

const MAX_DURATION_MIN = 480;
const MAX_CAPACITY = 100;
// A shop that charges more than this has mistyped rupees for paise.
const MAX_PRICE_PAISE = 10000000;

function requireInstant(value, label) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) throw badRequest(`${label} is required.`);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${label} is invalid.`);
  return parsed;
}

function boundedInt(value, { label, min, max, fallback }) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max) {
    throw badRequest(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return number;
}

// Undefined means "leave it alone", null means "clear it" — two different
// instructions from the same screen, and collapsing them would make a vendor
// unable to take a price back off a slot once set.
function optionalPrice(body) {
  if (!Object.prototype.hasOwnProperty.call(body, 'pricePaise')) return undefined;
  const raw = body.pricePaise;
  if (raw === null || raw === '') return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0 || number > MAX_PRICE_PAISE) {
    throw badRequest('Price must be a whole number of paise.');
  }
  return number;
}

function isCapacityViolation(error) {
  if (String(error?.code || '') !== '23514') return false;
  const detail = `${error?.message || ''} ${error?.details || ''}`;
  return detail.includes('capacity');
}

// Runs the write, and if the only thing wrong with it was a price column that
// this project has not migrated to yet, runs it again without the price rather
// than failing the whole edit. The vendor is told, in the response, that the
// price did not stick — silently dropping it would have them believe they had
// set a rate nobody will ever be charged.
async function writeWithPriceFallback(payload, run) {
  const hasPrice = Object.prototype.hasOwnProperty.call(payload, 'price_paise');
  const { data, error } = await run(payload);
  if (!error) return { data, priceIgnored: false };
  if (!hasPrice || !isMissingColumn(error, 'price_paise')) throw error;

  const withoutPrice = { ...payload };
  delete withoutPrice.price_paise;
  const retry = await run(withoutPrice);
  if (retry.error) throw retry.error;
  console.warn('vendor/slot-save: price_paise is not on this project yet (migration 20); slot saved without a price.');
  return { data: retry.data, priceIgnored: true };
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const { service } = await resolveVendorContext(auth, body.vendorId);

    const price = optionalPrice(body);
    const slotId = String(body.slotId || '').trim();

    // Validation before the limiter, same order as the booking endpoints: a
    // typo must not spend the vendor's budget for the hour.
    let payload;
    let run;
    let existing = null;

    if (slotId) {
      const id = requireUuid(slotId, 'slotId');
      const { data: row, error } = await auth.supabase
        .from('vendor_slots')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      // Same reasoning as resolveVendorContext: another vendor's slot reads as
      // "not yours", never as "here is what it is".
      if (!row || row.vendor_id !== service.id) {
        throw httpError(403, 'You do not manage this appointment time.');
      }
      existing = row;

      payload = {};
      if (body.startsAt !== undefined) {
        payload.starts_at = requireInstant(body.startsAt, 'startsAt').toISOString();
      }
      if (body.durationMin !== undefined) {
        payload.duration_min = boundedInt(body.durationMin, {
          label: 'durationMin', min: 1, max: MAX_DURATION_MIN, fallback: undefined,
        });
      }
      if (body.capacity !== undefined) {
        payload.capacity = boundedInt(body.capacity, {
          label: 'capacity', min: 1, max: MAX_CAPACITY, fallback: undefined,
        });
      }
      if (price !== undefined) payload.price_paise = price;
      if (!Object.keys(payload).length) return send(res, 400, { error: 'Nothing to change.' });

      await enforceVendorRateLimit(auth.supabase, auth.user.id);
      run = (fields) => auth.supabase
        .from('vendor_slots')
        .update(fields)
        .eq('id', id)
        .select('*')
        .maybeSingle();
    } else {
      const startsAt = requireInstant(body.startsAt, 'startsAt');
      // A time that has already passed cannot be booked by anybody, so
      // publishing one only puts a dead row on the vendor's own calendar.
      // Editing an existing past slot stays allowed above — a vendor correcting
      // this morning's seat count is doing bookkeeping, not selling.
      if (startsAt.getTime() <= Date.now()) {
        return send(res, 400, { error: 'Pick a time in the future.' });
      }

      payload = {
        vendor_id: service.id,
        starts_at: startsAt.toISOString(),
        duration_min: boundedInt(body.durationMin, {
          label: 'durationMin', min: 1, max: MAX_DURATION_MIN, fallback: 15,
        }),
        capacity: boundedInt(body.capacity, {
          label: 'capacity', min: 1, max: MAX_CAPACITY, fallback: 1,
        }),
        // vendor_slots.city_id is not null, and the slot belongs to whichever
        // city its listing is in — never to the caller's own city_id, which is
        // the same value today and would silently move a slot the day an owner
        // manages a listing in another town.
        city_id: service.city_id,
      };
      if (price !== undefined) payload.price_paise = price;

      await enforceVendorRateLimit(auth.supabase, auth.user.id);
      run = (fields) => auth.supabase
        .from('vendor_slots')
        .upsert(fields, { onConflict: 'vendor_id,starts_at' })
        .select('*')
        .maybeSingle();
    }

    const { data, priceIgnored } = await writeWithPriceFallback(payload, run);
    if (!data) throw new Error('Slot write returned no row.');

    return send(res, 200, {
      slot: toVendorSlot(data),
      // 'saved' and not 'created': the upsert branch cannot tell a brand new
      // time from a re-add of one that already existed without a second read
      // and a race, and the screen has no use for the difference.
      mode: existing ? 'updated' : 'saved',
      priceIgnored,
    });
  } catch (error) {
    if (isCapacityViolation(error)) {
      return send(res, 409, {
        error: 'That time already has more bookings than the number of seats you set.',
        code: 'capacity_below_booked',
      });
    }
    return respondVendorError(res, error, 'Could not save that appointment time. Please try again.');
  }
};
