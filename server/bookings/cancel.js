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
  loadBooking,
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

    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'booking.cancel',
      args: { bookingId, previousStatus: booking.status },
      result: { bookingId, status: 'cancelled_user', slotReleased },
      idempotencyKey: updated.idempotency_key,
      familyId: updated.family_id,
    });

    return send(res, 200, { booking: toBooking(updated) });
  } catch (error) {
    return sendServerError(res, error, 'Could not cancel this booking. Please try again.');
  }
};
