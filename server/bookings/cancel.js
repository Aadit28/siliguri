const {
  authenticate,
  readBody,
  requireFamilyLink,
  send,
  sendServerError,
  withCors,
} = require('../_lib/auth');
const {
  BOOKING_COLUMNS,
  CANCELLABLE_STATUSES,
  VENDOR_NOTIFIED_STATUSES,
  loadBooking,
  notifyVendorCancelled,
  releaseSlot,
  requireUuid,
  toBooking,
  writeAudit,
} = require('./_shared');

// Either the elder or one of their guardians may call off a booking. A booking
// already finished, expired or cancelled stays as it is — re-cancelling would
// hand back a seat that was handed back once already.
module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const bookingId = requireUuid(body.bookingId, 'bookingId');

    const booking = await loadBooking(auth.supabase, bookingId);
    const linkError = await requireFamilyLink(auth, booking.family_id);
    if (linkError) return send(res, 403, linkError);

    if (!CANCELLABLE_STATUSES.includes(booking.status)) {
      return send(res, 409, { error: 'This booking can no longer be cancelled.' });
    }

    const { data: updated, error } = await auth.supabase
      .from('bookings')
      .update({ status: 'cancelled_user' })
      .eq('id', bookingId)
      // The status guard is what makes the release below run exactly once, even
      // if the elder taps cancel twice on a slow connection.
      .in('status', CANCELLABLE_STATUSES)
      .select(BOOKING_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!updated) return send(res, 409, { error: 'This booking can no longer be cancelled.' });

    const slotReleased = await releaseSlot(auth.supabase, updated.slot_id);

    // The pre-cancel status is the one read before the update: pending_vendor and
    // confirmed are the states in which the vendor has already been WhatsApped
    // about this booking, so leaving now without a word has them holding a time
    // for a family that is not coming. Awaited before the response — Vercel
    // freezes the function the moment it ends — and the raw row, not toBooking's
    // camelCase, because the notifier reads snake_case columns off it.
    const vendorNotify = VENDOR_NOTIFIED_STATUSES.includes(booking.status)
      ? await notifyVendorCancelled(updated, auth.supabase)
      : null;

    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'booking.cancel',
      args: { bookingId, previousStatus: booking.status },
      // "Was the vendor actually told" is the half of a cancellation that goes
      // wrong silently, so it sits in the guardian's timeline next to the seat.
      result: { bookingId, status: 'cancelled_user', slotReleased, vendorNotify },
      idempotencyKey: updated.idempotency_key,
      familyId: updated.family_id,
    });

    return send(res, 200, { booking: toBooking(updated) });
  } catch (error) {
    return sendServerError(res, error, 'Could not cancel this booking. Please try again.');
  }
};
