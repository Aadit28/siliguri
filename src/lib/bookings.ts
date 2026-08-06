import { backendRequest } from './backend';
import { IST_OFFSET_MS, istDateISO, pad, shiftISO, toISO } from './istDates';

// Typed wrappers over the /api/bookings/* endpoints. Same shape as
// src/lib/family.ts: every call throws with the server's { error } sentence and
// the HTTP status backendRequest attaches, and screens turn that into
// elder-readable copy through friendlyBookingError.

export type BookingStatus =
  | 'held'
  | 'pending_guardian'
  | 'pending_vendor'
  | 'confirmed'
  | 'completed'
  | 'cancelled_user'
  | 'cancelled_vendor_timeout'
  | 'expired';

// Mirrors CANCELLABLE_STATUSES in server/bookings/_shared.js. Everything else
// is terminal and the server answers 409 rather than handing a seat back twice.
export const CANCELLABLE_BOOKING_STATUSES: BookingStatus[] = [
  'held',
  'pending_guardian',
  'pending_vendor',
  'confirmed',
];

export function canCancelBooking(status: BookingStatus) {
  return CANCELLABLE_BOOKING_STATUSES.includes(status);
}

export type BookingVendor = {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  address: string | null;
};

export type BookingSlot = {
  id: string;
  vendorId: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  booked: number;
  spotsRemaining: number;
  vendor: BookingVendor | null;
};

export type Booking = {
  id: string;
  familyId: string | null;
  elderId: string | null;
  vendorId: string | null;
  slotId: string | null;
  status: BookingStatus;
  holdExpiresAt: string | null;
  amountPaise: number | null;
  idempotencyKey: string | null;
  createdBy: string | null;
  cityId: string | null;
  createdAt: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The directory still carries seeded rows with ids like "m-3". Those can never
// have slots, and sending one would come back as a 400 the user cannot act on.
export function isBookableVendorId(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

type MaybeCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

/**
 * One key per booking attempt, generated once and kept in component state.
 * A retry after a dropped response MUST carry the same key: booking_hold
 * returns the existing row for a repeated key instead of taking a second seat,
 * and booking_confirm rejects a key that does not match the hold it was made
 * with. Regenerating on retry is the bug this function exists to prevent.
 */
export function newIdempotencyKey(): string {
  const webCrypto = (globalThis as { crypto?: MaybeCrypto }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes);
  } else {
    // Hermes ships no WebCrypto. The key only has to be unique — it is never a
    // secret and authorises nothing on its own.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Version 4, variant 10xx: the server validates against a strict v4 pattern.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

// ----- Dates -----
//
// Every day boundary here is the elder's Kolkata day, not the reader's: a
// guardian in London must be offered the same seven days their parent sees.

export function istTodayISO() {
  return istDateISO(new Date().toISOString()) ?? toISO(1970, 0, 1);
}

/**
 * dateFrom/dateTo for the next `days` calendar days, ends included.
 *
 * dateFrom is the current instant, not midnight IST: the server trusts a
 * supplied dateFrom verbatim and only substitutes "now" when it is absent, so a
 * plain day stamp re-offers this morning's slots — which nothing downstream
 * refuses to hold, confirm, or send to the vendor. dateTo stays a calendar day
 * because the last day must run to its end.
 */
export function nextDaysRange(days: number) {
  return {
    dateFrom: new Date().toISOString(),
    dateTo: shiftISO(istTodayISO(), Math.max(0, days - 1)),
  };
}

/** "10:30 AM" in the elder's wall clock, from an absolute server timestamp. */
export function istTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const hours = shifted.getUTCHours();
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${pad(shifted.getUTCMinutes())} ${period}`;
}

/**
 * A Date positioned at noon UTC on the given calendar day. Noon keeps the day
 * intact for every reader's zone once toLocaleDateString reads it back, so a
 * heading cannot say Tuesday to the elder and Monday to their son abroad.
 */
export function dayISOToDate(dayISO: string) {
  const [year, month, day] = dayISO.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12));
}

export type BookingSlotDay = { dayISO: string; slots: BookingSlot[] };

// Search already returns slots in ascending time order, so appending preserves
// it inside each day and the day list comes out in order too.
export function groupSlotsByDay(slots: BookingSlot[]): BookingSlotDay[] {
  const days: BookingSlotDay[] = [];
  const byDay = new Map<string, BookingSlotDay>();
  for (const slot of slots) {
    const dayISO = istDateISO(slot.startsAt);
    if (!dayISO) continue;
    let group = byDay.get(dayISO);
    if (!group) {
      group = { dayISO, slots: [] };
      byDay.set(dayISO, group);
      days.push(group);
    }
    group.slots.push(slot);
  }
  return days;
}

/** Whole rupees. Paise are never shown to this audience. */
export function rupeesFromPaise(paise: number | null | undefined) {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return null;
  return `₹${Math.round(paise / 100)}`;
}

// ----- Endpoints -----

export async function searchBookingSlots(
  token: string,
  input: { vendorId?: string; category?: string; dateFrom?: string; dateTo?: string },
): Promise<BookingSlot[]> {
  const response = await backendRequest<{ slots: BookingSlot[] }>(
    `/api/bookings/search${queryString({
      vendorId: input.vendorId,
      category: input.category,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    })}`,
    { token },
  );
  return Array.isArray(response.slots) ? response.slots : [];
}

export async function holdBookingSlot(
  token: string,
  input: { slotId: string; idempotencyKey: string; elderId?: string | null },
): Promise<Booking> {
  const response = await backendRequest<{ hold: Booking }>('/api/bookings/hold', {
    method: 'POST',
    token,
    body: {
      slotId: input.slotId,
      idempotencyKey: input.idempotencyKey,
      createdBy: 'app',
      ...(input.elderId ? { elderId: input.elderId } : {}),
    },
  });
  if (!response.hold) throw new Error('The hold was not confirmed by the server.');
  return response.hold;
}

export async function confirmBooking(
  token: string,
  input: { holdId: string; idempotencyKey: string },
): Promise<Booking> {
  const response = await backendRequest<{ booking: Booking }>('/api/bookings/confirm', {
    method: 'POST',
    token,
    // The same key the hold was made with — booking_confirm treats a different
    // one as a crossed request, not a retry.
    body: { holdId: input.holdId, idempotencyKey: input.idempotencyKey },
  });
  if (!response.booking) throw new Error('The booking was not confirmed by the server.');
  return response.booking;
}

export async function cancelBooking(token: string, bookingId: string): Promise<Booking> {
  const response = await backendRequest<{ booking: Booking }>('/api/bookings/cancel', {
    method: 'POST',
    token,
    body: { bookingId },
  });
  if (!response.booking) throw new Error('The cancellation was not confirmed by the server.');
  return response.booking;
}

export async function answerBookingApproval(
  token: string,
  input: { bookingId: string; approve: boolean },
): Promise<Booking> {
  const response = await backendRequest<{ booking: Booking }>('/api/bookings/approve', {
    method: 'POST',
    token,
    // Strictly a boolean. The string "false" is truthy on the server and would
    // book the appointment the guardian just declined.
    body: { bookingId: input.bookingId, approve: input.approve === true },
  });
  if (!response.booking) throw new Error('The answer was not recorded by the server.');
  return response.booking;
}

export async function listMyBookings(token: string, elderId?: string | null): Promise<Booking[]> {
  const response = await backendRequest<{ bookings: Booking[] }>(
    `/api/bookings/mine${queryString({ elderId: elderId ?? undefined })}`,
    { token },
  );
  return Array.isArray(response.bookings) ? response.bookings : [];
}

// ----- Error copy -----

type Translate = (key: string, options?: Record<string, unknown>) => string;

export type BookingPhase = 'search' | 'hold' | 'confirm' | 'cancel' | 'approve' | 'list';

/**
 * The machine-readable codes the booking handlers answer business failures
 * with, mapped to copy every language carries. Mirrors RPC_BUSINESS_ERRORS in
 * server/bookings/_shared.js — a code missing here falls back to the generic
 * sentence rather than to the server's English one.
 */
const BOOKING_ERROR_KEYS: Record<string, string> = {
  hold_expired: 'booking.errorHoldExpired',
  booking_not_confirmable: 'booking.errorHoldExpired',
  booking_not_found: 'booking.errorGone',
  slot_not_found: 'booking.errorSlotTaken',
  slot_full: 'booking.errorSlotTaken',
  slot_in_past: 'booking.errorSlotTaken',
  idempotency_key_reused: 'booking.errorStartAgain',
  idempotency_key_mismatch: 'booking.errorStartAgain',
  booking_hold_conflict: 'booking.errorSlotTaken',
};

function bookingErrorCode(e: unknown) {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : '';
}

/**
 * True when the five minute hold ran out under the elder — the one confirm
 * failure that cannot be retried with the same attempt. The seat is already
 * back on the shelf, so the sheet has to send them to the slot list and the
 * next try has to carry a brand new idempotency key.
 */
export function isHoldExpiredError(e: unknown) {
  const code = bookingErrorCode(e);
  if (code === 'hold_expired' || code === 'booking_not_confirmable') return true;
  // Before the coded answers shipped, and for any handler still on the old
  // shape: 410 is only ever raised for a hold that has gone.
  return (e as { status?: number } | null)?.status === 410;
}

/**
 * Turns a rejected booking call into a sentence an elder can act on. Raw server
 * text is English-only and must never reach a Hindi screen. backendRequest
 * attaches the HTTP status; a failure with no status never reached the server.
 */
export function friendlyBookingError(e: unknown, t: Translate, phase: BookingPhase): string {
  const error = e as Error & { status?: number; code?: string };
  const status = error?.status;
  const message = error?.message ?? '';

  if (status === undefined) return t('booking.errorNetwork');

  // The code is the precise signal; the status branches below are the fallback
  // for handlers that answer without one.
  const coded = BOOKING_ERROR_KEYS[bookingErrorCode(error)];
  if (coded) return t(coded);

  if (status === 401) return t('booking.errorSignIn');
  if (status === 403) return t('booking.errorNotAllowed');
  if (status === 404) return t('booking.errorGone');
  if (status === 410) return t('booking.errorHoldExpired');
  if (status === 429) return t('booking.errorTooMany');
  if (status === 409) {
    // The city 409 only comes off search, and reads as a setup step rather
    // than a booking failure.
    if (/city/i.test(message)) return t('booking.errorNoCity');
    if (phase === 'hold') return t('booking.errorSlotTaken');
    if (phase === 'confirm') return t('booking.errorHoldExpired');
    if (phase === 'cancel') return t('booking.errorNotCancellable');
    if (phase === 'approve') return t('booking.errorAlreadyAnswered');
    return t('booking.errorGeneric');
  }
  if (status >= 500) return t('booking.errorGeneric');
  // Every remaining 4xx is a badRequest sentence written in English. The one
  // worth its own copy is the guardian who looks after more than one parent,
  // because it names something they can actually do about it.
  if (/more than one parent/i.test(message)) return t('booking.errorPickParent');
  return t('booking.errorGeneric');
}

/**
 * True when the request never reached the server. That is the one case where
 * retrying with the SAME idempotency key is both safe and required — the hold
 * may already exist on the other side of a dropped response.
 */
export function isRetryableBookingError(e: unknown) {
  return (e as { status?: number } | null)?.status === undefined;
}
