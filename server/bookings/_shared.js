// Shared pieces for the /api/bookings/* handlers. The endpoints stay thin on
// purpose: the SQL functions (migration 17/18) own atomicity, this file owns
// who-may-do-what, and both the app and the voice agent go through the same
// door.

const { badRequest, readBody, requireFamilyLink } = require('../_lib/auth');
const { guardianIdsForParent, sendPushToUsers } = require('../_lib/push');
const {
  notifyVendorBooking,
  notifyVendorCancellation,
  writeBookingAudit,
} = require('../_lib/vendor-notify');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// vendor_slots.vendor_id points at services(id), so a slot search is scoped by
// the directory's own categories. An unknown one is a 400 rather than an empty
// list: "no doctors near you" and "you spelled doctor wrong" must not look the
// same to the caller.
const VENDOR_CATEGORIES = [
  'elder_home',
  'doctor',
  'hospital',
  'medical_shop',
  'travel_agent',
  'home_service',
  'daily_service',
];

// bookings.created_by is a provenance label, not a permission: it records which
// surface made the booking so the guardian timeline can say "booked by voice".
// The real actor is the authenticated user id on the audit row.
const CREATED_BY = ['app', 'voice_agent'];

const BOOKING_COLUMNS =
  'id,family_id,elder_id,vendor_id,slot_id,status,hold_expires_at,amount_paise,idempotency_key,created_by,city_id,created_at';

// A booking that has not been answered by the vendor yet, or that the family
// still wants to call off. Everything else (completed, expired, the cancelled
// states) is terminal and must not decrement a slot a second time.
const CANCELLABLE_STATUSES = ['held', 'pending_guardian', 'pending_vendor', 'confirmed'];

// The states in which the vendor has already had the booking pushed at them on
// WhatsApp — pending_vendor because the request went out, confirmed because they
// tapped Accept. Cancelling out of either leaves the vendor's last message
// saying an appointment is on, so these are the ones that owe them a follow-up.
const VENDOR_NOTIFIED_STATUSES = ['pending_vendor', 'confirmed'];

// Business outcomes the booking_* functions raise as P0001/P0002. They are the
// caller's cue to do something different, not server faults: left to
// sendServerError they become a 500 with "please try again", which for
// hold_expired is advice that can never work (the same holdId re-raises it for
// ever) and which buries real faults in noise from elders who simply paused.
// The `code` is the machine-readable half the app and the voice agent key on.
const RPC_BUSINESS_ERRORS = {
  hold_expired: {
    // 409 rather than 410: the mobile client keys the "pick the time again"
    // recovery off the 409 branch of friendlyBookingError, and the `code` below
    // is what actually distinguishes this from the other conflicts.
    status: 409,
    code: 'hold_expired',
    message: 'The five minute hold ran out. Please pick the time again.',
  },
  booking_not_confirmable: {
    status: 409,
    code: 'booking_not_confirmable',
    message: 'This booking can no longer be confirmed. Please pick the time again.',
  },
  booking_not_found: {
    status: 404,
    code: 'booking_not_found',
    message: 'That hold is gone. Please pick a time again.',
  },
  slot_not_found: {
    status: 404,
    code: 'slot_not_found',
    message: 'That time is no longer available. Please pick another.',
  },
  slot_full: {
    status: 409,
    code: 'slot_full',
    message: 'That time was just taken. Please pick another time.',
  },
  idempotency_key_reused: {
    status: 409,
    code: 'idempotency_key_reused',
    message: 'That request was already used for a different time. Please start again.',
  },
  idempotency_key_mismatch: {
    status: 409,
    code: 'idempotency_key_mismatch',
    message: 'This confirmation does not match the hold. Please start again.',
  },
  booking_hold_conflict: {
    status: 409,
    code: 'booking_hold_conflict',
    message: 'That time was being booked at the same moment. Please try again.',
  },
};

const DEFAULT_APPROVAL_THRESHOLD_PAISE = 50000;
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW = '1 hour';

// Siliguri time. Fixed offset, no DST — a guardian in London asking for "the
// 12th" has to get the elder's 12th, not UTC's.
const IST_OFFSET = '+05:30';

// Same shape as badRequest in _lib/auth: sendServerError passes the status and
// the public message straight through for anything in the 4xx range.
function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicError = message;
  return error;
}

function requireUuid(value, label) {
  const id = String(value === undefined || value === null ? '' : value).trim();
  if (!UUID_RE.test(id)) throw badRequest(`${label} is invalid.`);
  return id;
}

// search and mine are reachable by GET (the app links straight into a vendor's
// calendar) and search also by POST (the voice agent posts a tool payload), so
// the parameters are read from whichever side is carrying them.
async function requestParams(req) {
  if (req.method === 'POST') return readBody(req);
  const params = {};
  for (const [key, value] of new URL(req.url || '/', 'http://localhost').searchParams) {
    params[key] = value;
  }
  for (const [key, value] of Object.entries(req.query || {})) {
    // A repeated ?vendorId= arrives as an array and every field here is
    // single-valued; the last one is what the caller most recently asked for.
    params[key] = Array.isArray(value) ? value[value.length - 1] : value;
  }
  return params;
}

function instant(value, label, exclusiveEnd) {
  const raw = String(value === undefined || value === null ? '' : value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const base = new Date(`${raw}T00:00:00${IST_OFFSET}`);
    if (Number.isNaN(base.getTime())) throw badRequest(`${label} is invalid.`);
    // The upper bound is exclusive, so "up to the 12th" has to run to the start
    // of the 13th or the whole of the last day disappears from the results.
    if (exclusiveEnd) base.setUTCDate(base.getUTCDate() + 1);
    return base.toISOString();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) throw badRequest(`${label} is invalid.`);
  return parsed.toISOString();
}

// No dateFrom means "from now": an appointment in the past cannot be booked and
// listing it only wastes an elder's attention.
function rangeStart(value) {
  return instant(value, 'dateFrom', false) || new Date().toISOString();
}

function rangeEnd(value) {
  return instant(value, 'dateTo', true);
}

// A Postgres function may come back as a scalar, a row, or a one-row set
// depending on how it was declared; the handlers only ever want the row.
function firstRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function toBooking(row) {
  if (!row) return null;
  return {
    id: row.id,
    familyId: row.family_id || null,
    elderId: row.elder_id || null,
    vendorId: row.vendor_id || null,
    slotId: row.slot_id || null,
    status: row.status,
    holdExpiresAt: row.hold_expires_at || null,
    amountPaise: numberOrNull(row.amount_paise),
    idempotencyKey: row.idempotency_key || null,
    createdBy: row.created_by || null,
    cityId: row.city_id || null,
    createdAt: row.created_at || null,
  };
}

function toSlot(row) {
  const capacity = Number(row.capacity || 0);
  const booked = Number(row.booked || 0);
  const vendor = row.vendor || null;
  return {
    id: row.id,
    vendorId: row.vendor_id,
    startsAt: row.starts_at,
    durationMin: Number(row.duration_min || 0),
    capacity,
    booked,
    spotsRemaining: Math.max(0, capacity - booked),
    vendor: vendor
      ? {
          id: vendor.id,
          name: vendor.name,
          category: vendor.category,
          phone: vendor.phone || null,
          address: vendor.address || null,
        }
      : null,
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rupees(paise) {
  const amount = numberOrNull(paise);
  if (amount === null) return null;
  return `₹${Math.round(amount / 100)}`;
}

// Above this the family wants a second pair of eyes before money is committed.
// A blank env var means "not configured" and must fall back to the default: read
// as a number it would be 0, and every booking would suddenly need approval.
function approvalThresholdPaise() {
  const raw = process.env.BOOKING_APPROVAL_THRESHOLD_PAISE;
  if (raw === undefined || String(raw).trim() === '') return DEFAULT_APPROVAL_THRESHOLD_PAISE;
  const paise = Number(raw);
  if (!Number.isFinite(paise) || paise < 0) return DEFAULT_APPROVAL_THRESHOLD_PAISE;
  return Math.floor(paise);
}

// There is no families table yet: a family is the set of accounts joined to ONE
// elder through family_links (guardian_id -> parent_id), so the elder's account
// id IS the family key. bookings keeps family_id and elder_id apart for the day
// a family holds two elders; until that table exists both carry the same id.
// Every membership check in this directory comes through here, so that day is a
// one-function change.
async function resolveFamilyContext(auth, requestedElderId) {
  const requested = String(requestedElderId === undefined || requestedElderId === null ? '' : requestedElderId).trim();
  if (requested) {
    const elderId = requireUuid(requested, 'elderId');
    const linkError = await requireFamilyLink(auth, elderId);
    if (linkError) throw httpError(403, linkError.error || 'Not allowed.');
    return { elderId, familyId: elderId };
  }

  // No elder named: a guardian is booking for the parent they look after, and
  // anyone with no guardian links is the elder booking for themselves.
  const { data, error } = await auth.supabase
    .from('family_links')
    .select('parent_id')
    .eq('guardian_id', auth.user.id)
    .eq('status', 'active');
  if (error) throw error;

  const parentIds = [...new Set((data || []).map((row) => row.parent_id).filter(Boolean))];
  if (parentIds.length === 1) return { elderId: parentIds[0], familyId: parentIds[0] };
  if (parentIds.length > 1) {
    // Guessing which parent would book a stranger's appointment. Ask.
    throw httpError(400, 'You look after more than one parent. Send elderId to say which one.');
  }
  return { elderId: auth.user.id, familyId: auth.user.id };
}

// Approval is the guardian's job specifically, so unlike requireFamilyLink this
// check does not accept the elder themselves — otherwise the spend cap would be
// something the person spending can wave through.
async function requireGuardianOfFamily(auth, familyId) {
  const { data, error } = await auth.supabase
    .from('family_links')
    .select('id')
    .eq('guardian_id', auth.user.id)
    .eq('parent_id', familyId)
    .eq('status', 'active')
    .limit(1);
  if (error) throw error;
  if (!data || data.length === 0) {
    throw httpError(403, 'Only a family guardian can answer this booking.');
  }
}

async function loadBooking(client, bookingId) {
  const { data, error } = await client
    .from('bookings')
    .select(BOOKING_COLUMNS)
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(404, 'Booking not found.');
  return data;
}

// 20 booking actions an hour is far above a real family's rhythm and far below
// what a stuck client or a looping voice agent can do to a vendor's calendar.
// The function counts and records in the same round trip, so this is called
// after validation: a caller rejected for a malformed id does not spend budget.
async function enforceRateLimit(client, userId) {
  const { data, error } = await client.rpc('check_rate_limit', {
    p_key: `booking:${userId}`,
    p_max: RATE_LIMIT_MAX,
    p_window: RATE_LIMIT_WINDOW,
  });
  if (error) throw error;
  // true only when the attempt was recorded. false and null (nothing inserted
  // because the window is full) both mean stop. Deliberately not fail-open like
  // allowDurable: this limiter guards writes to a real vendor's calendar.
  const allowed = Array.isArray(data) ? data[0] : data;
  if (allowed !== true) {
    throw httpError(429, 'Too many booking attempts just now. Please wait a few minutes.');
  }
}

// Takes the RAW bookings row, never the camelCase toBooking() shape:
// notifyVendorBooking reads snake_case columns (vendor_id, starts_at,
// customer_name) and a mapped object would leave it unable to find the vendor —
// it would answer vendor_not_found and nobody would be waiting for the elder.
async function notifyVendor(row, client) {
  try {
    return await notifyVendorBooking(row, client);
  } catch (error) {
    // notifyVendorBooking is documented never to throw, so reaching this is
    // itself the news. Never silent: an unreached vendor is a booking nobody is
    // preparing for, and only the timeout sweep (BUILD_GUIDE C.4) catches it.
    console.error('Vendor notify threw for booking', row?.id, error?.message || error);
    return { queued: false, reason: 'notify_threw' };
  }
}

// Same contract as notifyVendor, for the booking the family called off after the
// vendor had already been told about it. Also takes the RAW bookings row.
async function notifyVendorCancelled(row, client) {
  try {
    return await notifyVendorCancellation(row, client);
  } catch (error) {
    console.error('Vendor cancel notify threw for booking', row?.id, error?.message || error);
    return { queued: false, reason: 'notify_threw' };
  }
}

async function vendorName(client, vendorId) {
  if (!vendorId) return 'a booking';
  const { data, error } = await client
    .from('services')
    .select('name')
    .eq('id', vendorId)
    .maybeSingle();
  // A missing name must not hold up the alert — the guardian can open the
  // booking to see who it is with, but only if the alert reaches them.
  if (error) console.warn('Vendor name lookup failed:', error.message);
  return data?.name || 'a booking';
}

async function elderName(client, auth, elderId) {
  if (auth.user && auth.user.id === elderId) {
    return auth.user.full_name || auth.user.username || 'Your parent';
  }
  const { data, error } = await client
    .from('user_accounts')
    .select('full_name,username')
    .eq('id', elderId)
    .maybeSingle();
  if (error) console.warn('Elder name lookup failed:', error.message);
  return data?.full_name || data?.username || 'Your parent';
}

// Awaited by the caller before the response: Vercel freezes the function the
// moment the response ends, so a dangling push promise dies unsent.
async function notifyGuardiansForApproval(client, auth, booking) {
  const guardianIds = await guardianIdsForParent(client, booking.family_id);
  if (!guardianIds.length) return 0;

  const [name, who] = await Promise.all([
    vendorName(client, booking.vendor_id),
    elderName(client, auth, booking.elder_id),
  ]);
  const amount = rupees(booking.amount_paise);
  const result = await sendPushToUsers(client, guardianIds, {
    title: 'A booking needs your approval',
    body: `${who}: ${name}${amount ? ` — ${amount}` : ''}. Tap to approve or decline.`,
    url: '/guardian',
  });
  return result.sent;
}

// PostgREST has no atomic decrement, so this is a compare-and-set against the
// count we just read; a competing hold moves `booked` under us and the retry
// picks up the new number. Only ever called once the booking row has already
// moved to a cancelled state, so it cannot run twice for one seat.
//
// Returning false means the seat was NOT handed back, and nothing in the system
// will hand it back later: by the time this runs the booking is already in a
// terminal state, and booking_release_expired() only revisits 'held' and
// 'pending_vendor' rows. The slot then advertises one opening fewer than it has
// until a person repairs it, so every caller records the result in its audit row
// and the log line below is the thing to grep when capacity drifts down.
// (The real fix is a SQL function that flips the status and decrements the seat
// in one transaction — the repo's own invariant that the SQL owns atomicity.)
const RELEASE_SLOT_ATTEMPTS = 5;

async function releaseSlot(client, slotId) {
  if (!slotId) return false;
  let lastError = null;
  for (let attempt = 0; attempt < RELEASE_SLOT_ATTEMPTS; attempt += 1) {
    const { data: slot, error: readError } = await client
      .from('vendor_slots')
      .select('id,booked')
      .eq('id', slotId)
      .maybeSingle();
    // A transient read failure is worth another go — giving up on the first one
    // spends a seat on a blip. A missing slot is not: there is nothing to
    // decrement and retrying cannot conjure the row.
    if (readError) {
      lastError = readError;
      continue;
    }
    if (!slot) {
      console.error('Could not release slot capacity: slot', slotId, 'no longer exists.');
      return false;
    }

    const booked = Number(slot.booked || 0);
    if (booked <= 0) return true;

    const { data: updated, error: writeError } = await client
      .from('vendor_slots')
      .update({ booked: booked - 1 })
      .eq('id', slotId)
      .eq('booked', booked)
      .select('id')
      .maybeSingle();
    if (writeError) {
      lastError = writeError;
      continue;
    }
    // No row back means the CAS lost to a concurrent hold or release; the next
    // pass reads the number they left behind.
    if (updated) return true;
  }
  console.error(
    `Slot capacity leak: could not release a seat on slot ${slotId} after ${RELEASE_SLOT_ATTEMPTS}`
    + ' attempts. The slot now shows one opening fewer than it has and no sweep will recover it;'
    + ' vendor_slots.booked needs a manual correction.'
    + (lastError ? ` Last error: ${lastError.message}` : ''),
  );
  return false;
}

// The hold function raises slot_full when the seat went while the elder was
// deciding. It is the caller's cue to re-search, not a server fault.
function isSlotFull(error) {
  return String(error?.message || '').toLowerCase().includes('slot_full');
}

// Maps a raised booking_* error onto its 4xx answer, or null when it is a
// genuine fault that should still become a 500. The raised message is the whole
// identifier — `raise exception using message = 'hold_expired'` arrives on
// error.message verbatim — so an exact match is tried first and a contains-scan
// only covers a driver that decorates it.
function rpcBusinessError(error) {
  const message = String(error?.message || '').trim();
  if (!message) return null;
  if (RPC_BUSINESS_ERRORS[message]) return RPC_BUSINESS_ERRORS[message];
  const name = Object.keys(RPC_BUSINESS_ERRORS).find((key) => message.includes(key));
  return name ? RPC_BUSINESS_ERRORS[name] : null;
}

module.exports = {
  BOOKING_COLUMNS,
  CANCELLABLE_STATUSES,
  CREATED_BY,
  VENDOR_CATEGORIES,
  VENDOR_NOTIFIED_STATUSES,
  approvalThresholdPaise,
  enforceRateLimit,
  firstRow,
  httpError,
  isSlotFull,
  loadBooking,
  notifyGuardiansForApproval,
  notifyVendor,
  notifyVendorCancelled,
  rangeEnd,
  rangeStart,
  releaseSlot,
  rpcBusinessError,
  requestParams,
  requireGuardianOfFamily,
  requireUuid,
  resolveFamilyContext,
  toBooking,
  toSlot,
  // The append-only flight recorder from BUILD_GUIDE B.4 and the source of the
  // guardian's "what happened" timeline. Deliberately the same function the
  // vendor callback and the sweep cron write through, so a booking reads the
  // same in the timeline whichever side moved it. Never throws: the booking has
  // already happened by then, and refusing to answer because the recorder is
  // down would leave the caller unsure whether it went through.
  writeAudit: writeBookingAudit,
};
