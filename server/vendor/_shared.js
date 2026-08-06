const { send, sendServerError } = require('../_lib/auth');
const { httpError, requireUuid } = require('../bookings/_shared');

// Everything the four /api/vendor/* handlers share: who the caller is allowed
// to act as, and the shapes their answers use.
//
// The elder-facing booking endpoints ask "is this person in that family". These
// ask a different question — "does this login own that listing" — and the
// answer is one column, services.owner_account_id, added by migration 21.

// The caller's own city bounds the ownership scan below. A directory city is
// hundreds of rows, not millions, and reading it once per vendor request is
// cheaper than the alternative described in resolveVendorContext.
const MAX_OWNED_SCAN = 500;

// A vendor laying out a week of appointments writes far more often than a
// family books one, so the booking limiter's 20/hour would lock them out
// halfway through a Monday morning. Same durable counter (migration 18), its
// own key and its own ceiling.
const VENDOR_RATE_LIMIT_MAX = 120;
const VENDOR_RATE_LIMIT_WINDOW = '1 hour';

// Answered when migration 21 has not reached this project. Distinct from the
// 403 below on purpose: "you do not manage any listing" is a fact about the
// caller and tells them to talk to Saathi, while this one is a fact about the
// server and must not be dressed up as the caller's problem.
const VENDOR_MGMT_UNAVAILABLE = {
  status: 503,
  code: 'vendor_mgmt_not_configured',
  message: 'Provider tools are not switched on for this server yet.',
};

const VENDOR_NOT_OWNER = 'You do not manage this listing.';

// PostgREST reports an unknown column two ways depending on where it appears:
// PGRST204 when it is a key in a write payload it cannot map, 42703 when
// Postgres itself rejects the statement. Migration 20 (prices) and migration 21
// (ownership) are both unapplied on at least one project, so a write naming
// either column has to be able to recognise its own failure and retry without
// it rather than 500 on a column that is simply not there yet.
function isMissingColumn(error, column) {
  const code = String(error?.code || '');
  if (code !== 'PGRST204' && code !== '42703') return false;
  if (!column) return true;
  return String(error?.message || '').includes(column);
}

// True when the services rows came back WITHOUT the ownership column, i.e.
// migration 21 has not run here. Reading the property off a row is the only
// available probe: naming owner_account_id in a select or a filter is exactly
// what would 500 the request on a project that is behind.
function ownershipColumnMissing(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return !Object.prototype.hasOwnProperty.call(rows[0], 'owner_account_id');
}

/**
 * Resolves which services row this request acts on.
 *
 * Returns { service, services } — the chosen listing and every listing the
 * caller owns, because the screens need the list to offer a switcher.
 *
 * Throws (never returns) for every refusal, so a handler that forgets to check
 * cannot accidentally act as an owner it never resolved.
 */
async function resolveVendorContext(auth, requestedVendorId) {
  // Scoped by the caller's city rather than by owner_account_id itself. The
  // filter we actually want cannot be written: naming a migration-21 column in
  // a PostgREST filter 500s the endpoint on a project where the migration has
  // not run, which is every project today. So the city narrows the read and the
  // ownership test happens in JS on the rows that come back.
  const cityId = auth.user.city_id || null;
  if (!cityId) {
    throw httpError(409, 'Choose your city before managing your appointment times.');
  }

  const { data, error } = await auth.supabase
    .from('services')
    .select('*')
    .eq('city_id', cityId)
    .limit(MAX_OWNED_SCAN);
  if (error) throw error;

  const rows = data || [];
  if (ownershipColumnMissing(rows)) throw vendorUnavailableError();

  const owned = rows.filter((row) => row.owner_account_id === auth.user.id);
  if (!owned.length) {
    throw httpError(403, 'You do not manage a listing on Saathi yet.');
  }

  const services = owned.map(toVendorService);

  const requested = String(requestedVendorId === undefined || requestedVendorId === null ? '' : requestedVendorId).trim();
  if (requested) {
    const vendorId = requireUuid(requested, 'vendorId');
    const match = owned.find((row) => row.id === vendorId);
    // Not 404. A listing that exists but belongs to somebody else and a listing
    // that does not exist must read the same from outside, or this endpoint
    // becomes a way to enumerate the directory's ownership.
    if (!match) throw httpError(403, VENDOR_NOT_OWNER);
    return { service: match, services };
  }

  if (owned.length > 1) {
    // Same rule as resolveFamilyContext: guessing which of a clinic's two
    // listings a slot belongs to would put an appointment on the wrong calendar.
    throw httpError(400, 'You manage more than one listing. Send vendorId to say which one.');
  }
  return { service: owned[0], services };
}

// Not httpError(). That helper marks an error with a status and a public
// message, and sendServerError only passes those through for 4xx — a 503 built
// that way arrives at the app as a bare 500 with no code on it, which is
// exactly the case the screen needs to tell apart from a fault. This carries
// the machine code as well, and respondVendorError below is what puts both on
// the wire.
function vendorUnavailableError() {
  const error = new Error(VENDOR_MGMT_UNAVAILABLE.message);
  error.status = VENDOR_MGMT_UNAVAILABLE.status;
  error.publicError = VENDOR_MGMT_UNAVAILABLE.message;
  error.code = VENDOR_MGMT_UNAVAILABLE.code;
  return error;
}

/**
 * The catch block every /api/vendor/* handler ends with. Answers the
 * "this server has no provider tools" case itself — status AND code, so the app
 * can offer an explanation instead of a Try again button — and hands everything
 * else to the shared sendServerError, which already maps 4xx and logs 5xx.
 */
function respondVendorError(res, error, fallbackMessage) {
  if (error?.code === VENDOR_MGMT_UNAVAILABLE.code) {
    return send(res, VENDOR_MGMT_UNAVAILABLE.status, {
      error: VENDOR_MGMT_UNAVAILABLE.message,
      code: VENDOR_MGMT_UNAVAILABLE.code,
    });
  }
  return sendServerError(res, error, fallbackMessage);
}

async function enforceVendorRateLimit(client, userId) {
  const { data, error } = await client.rpc('check_rate_limit', {
    p_key: `vendor:${userId}`,
    p_max: VENDOR_RATE_LIMIT_MAX,
    p_window: VENDOR_RATE_LIMIT_WINDOW,
  });
  if (error) throw error;
  const allowed = Array.isArray(data) ? data[0] : data;
  if (allowed !== true) {
    throw httpError(429, 'Too many changes just now. Please wait a few minutes.');
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toVendorService(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    phone: row.phone || null,
    address: row.address || null,
    cityId: row.city_id || null,
    // Absent until migration 20; numberOrNull absorbs the undefined instead of
    // reporting NaN as a standing rate.
    basePricePaise: numberOrNull(row.base_price_paise),
  };
}

// The vendor's own view of a slot, which is not the elder's view (toSlot in
// bookings/_shared.js). The vendor is shown the seat COUNTS they set — an elder
// is shown spotsRemaining and never needs to know the capacity — and `booked`
// is what decides whether the slot can still be edited or removed.
function toVendorSlot(row) {
  const capacity = Number(row.capacity || 0);
  const booked = Number(row.booked || 0);
  return {
    id: row.id,
    vendorId: row.vendor_id,
    startsAt: row.starts_at,
    durationMin: Number(row.duration_min || 0),
    capacity,
    booked,
    spotsRemaining: Math.max(0, capacity - booked),
    pricePaise: numberOrNull(row.price_paise),
    // A slot with a seat sold cannot be deleted, and the screen greys the
    // control rather than letting the vendor discover it through a 409.
    removable: booked === 0,
  };
}

module.exports = {
  MAX_OWNED_SCAN,
  VENDOR_MGMT_UNAVAILABLE,
  VENDOR_NOT_OWNER,
  enforceVendorRateLimit,
  isMissingColumn,
  numberOrNull,
  ownershipColumnMissing,
  respondVendorError,
  resolveVendorContext,
  vendorUnavailableError,
  toVendorService,
  toVendorSlot,
};
