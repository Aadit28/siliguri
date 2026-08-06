import { backendRequest } from './backend';
import type { Booking } from './bookings';

// Typed wrappers over /api/vendor/*, the provider's own side of the booking
// core. Same contract as src/lib/bookings.ts: every call throws with the
// server's { error } sentence plus the status and code backendRequest attaches,
// and the screen turns that into copy through friendlyVendorError.
//
// The audience is different from every other client module in this app. A
// vendor is a working adult on their own phone between customers, not an elder
// being helped through a form, so the copy here is brisk rather than gentle —
// but it is still translated, because a Siliguri shopkeeper is at least as
// likely to be reading Hindi as English.

export type VendorService = {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  address: string | null;
  cityId: string | null;
  /** The listing's standing rate, used for any slot without a price of its own. */
  basePricePaise: number | null;
};

export type VendorSlot = {
  id: string;
  vendorId: string;
  startsAt: string;
  durationMin: number;
  capacity: number;
  booked: number;
  spotsRemaining: number;
  pricePaise: number | null;
  /** False once a seat is sold: the server refuses the delete and so does the UI. */
  removable: boolean;
};

/** A booking waiting on this vendor's answer, with the time and person attached. */
export type VendorPendingBooking = Booking & {
  startsAt: string | null;
  durationMin: number | null;
  elderName: string | null;
};

export type VendorWeek = {
  vendor: VendorService | null;
  vendors: VendorService[];
  slots: VendorSlot[];
  pending: VendorPendingBooking[];
};

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function fetchVendorWeek(
  token: string,
  input: { vendorId?: string; dateFrom?: string; dateTo?: string } = {},
): Promise<VendorWeek> {
  const response = await backendRequest<VendorWeek>(
    `/api/vendor/slots${queryString({
      vendorId: input.vendorId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    })}`,
    { token },
  );
  return {
    vendor: response.vendor ?? null,
    vendors: Array.isArray(response.vendors) ? response.vendors : [],
    slots: Array.isArray(response.slots) ? response.slots : [],
    pending: Array.isArray(response.pending) ? response.pending : [],
  };
}

export type SaveSlotInput = {
  vendorId?: string;
  /** Present when editing an existing time; absent creates or re-edits by time. */
  slotId?: string;
  startsAt?: string;
  durationMin?: number;
  capacity?: number;
  /**
   * Undefined leaves the price alone; null clears it back to the listing's
   * standing rate. The two are different instructions and the server keeps them
   * apart, so this type must not collapse them into one optional number.
   */
  pricePaise?: number | null;
};

export type SaveSlotResult = {
  slot: VendorSlot;
  mode: 'saved' | 'updated';
  /** True when the project has no price column yet (migration 20 pending). */
  priceIgnored: boolean;
};

export async function saveVendorSlot(token: string, input: SaveSlotInput): Promise<SaveSlotResult> {
  const body: Record<string, unknown> = {};
  if (input.vendorId) body.vendorId = input.vendorId;
  if (input.slotId) body.slotId = input.slotId;
  if (input.startsAt !== undefined) body.startsAt = input.startsAt;
  if (input.durationMin !== undefined) body.durationMin = input.durationMin;
  if (input.capacity !== undefined) body.capacity = input.capacity;
  // hasOwnProperty, not a truthiness test: null is the instruction to clear the
  // price and 0 is a legitimately free slot.
  if (Object.prototype.hasOwnProperty.call(input, 'pricePaise')) body.pricePaise = input.pricePaise;

  const response = await backendRequest<SaveSlotResult>('/api/vendor/slot-save', {
    method: 'POST',
    token,
    body,
  });
  if (!response.slot) throw new Error('The server did not return the saved time.');
  return response;
}

export async function deleteVendorSlot(
  token: string,
  input: { slotId: string; vendorId?: string },
): Promise<{ removed: boolean; alreadyGone?: boolean }> {
  return backendRequest<{ removed: boolean; alreadyGone?: boolean }>('/api/vendor/slot-delete', {
    method: 'POST',
    token,
    body: { slotId: input.slotId, ...(input.vendorId ? { vendorId: input.vendorId } : {}) },
  });
}

export async function decideVendorBooking(
  token: string,
  input: { bookingId: string; decision: 'accept' | 'decline'; vendorId?: string },
): Promise<{ booking: Booking | null; idempotent?: boolean }> {
  const response = await backendRequest<{ booking: Booking; idempotent?: boolean }>(
    '/api/vendor/booking-decide',
    {
      method: 'POST',
      token,
      body: {
        bookingId: input.bookingId,
        decision: input.decision,
        ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      },
    },
  );
  return { booking: response.booking ?? null, idempotent: response.idempotent };
}

// ----- Errors -----

type Translate = (key: string, options?: Record<string, unknown>) => string;

const VENDOR_ERROR_KEYS: Record<string, string> = {
  vendor_mgmt_not_configured: 'vendor.errorNotConfigured',
  slot_has_bookings: 'vendor.errorSlotBooked',
  slot_has_history: 'vendor.errorSlotHistory',
  capacity_below_booked: 'vendor.errorCapacityBelowBooked',
};

function errorCode(e: unknown) {
  const code = (e as { code?: string } | null)?.code;
  return typeof code === 'string' ? code : null;
}

/** True when this login manages no listing — the screen offers a way out, not a retry. */
export function isNotAVendorError(e: unknown) {
  return (e as { status?: number } | null)?.status === 403 && !errorCode(e);
}

/** True when migration 21 has not reached the server this build talks to. */
export function isVendorToolsUnavailable(e: unknown) {
  return errorCode(e) === 'vendor_mgmt_not_configured'
    || (e as { status?: number } | null)?.status === 503;
}

/**
 * Turns a rejected /api/vendor/* call into a sentence. Raw server text is
 * English-only, so a coded failure is always answered from the locale files and
 * the server's own sentence is only a last resort for the uncoded 4xx.
 */
export function friendlyVendorError(e: unknown, t: Translate): string {
  const status = (e as { status?: number } | null)?.status;
  const coded = VENDOR_ERROR_KEYS[errorCode(e) || ''];
  if (coded) return t(coded);

  if (status === 401) return t('vendor.errorSignIn');
  if (status === 403) return t('vendor.errorNotYours');
  if (status === 409) return t('vendor.errorCityFirst');
  if (status === 429) return t('vendor.errorTooMany');
  if (status === 503) return t('vendor.errorNotConfigured');

  const message = (e as { message?: string } | null)?.message;
  if (status && status >= 400 && status < 500 && message) return message;
  return t('vendor.errorGeneric');
}
