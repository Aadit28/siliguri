const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const {
  BOOKING_COLUMNS,
  loadBooking,
  notifyVendor,
  releaseSlot,
  requireGuardianOfFamily,
  requireUuid,
  toBooking,
  writeAudit,
} = require('./_shared');

// The guardian's answer to a booking that went over the family's threshold. Yes
// sends it on to the vendor; no cancels it and hands the seat back so the next
// caller can have it.
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
    // Strictly a boolean: the string "false" is truthy, and a client sending one
    // would book an appointment the guardian just declined.
    if (typeof body.approve !== 'boolean') {
      return send(res, 400, { error: 'approve must be true or false.' });
    }
    const approve = body.approve;

    const booking = await loadBooking(auth.supabase, bookingId);
    await requireGuardianOfFamily(auth, booking.family_id);

    if (booking.status !== 'pending_guardian') {
      return send(res, 409, { error: 'This booking is not waiting for approval.' });
    }

    const nextStatus = approve ? 'pending_vendor' : 'cancelled_user';
    const { data: updated, error } = await auth.supabase
      .from('bookings')
      .update({ status: nextStatus })
      .eq('id', bookingId)
      // Guards the race between two guardians answering at once, and makes the
      // decrement below impossible to run twice for one seat.
      .eq('status', 'pending_guardian')
      .select(BOOKING_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!updated) return send(res, 409, { error: 'Someone in the family just answered this one.' });

    // Awaited before the response: Vercel freezes the function once it ends.
    // notifyVendor takes the raw row — it reads snake_case columns off it.
    const result = approve
      ? { status: nextStatus, vendorNotify: await notifyVendor(updated, auth.supabase) }
      : { status: nextStatus, slotReleased: await releaseSlot(auth.supabase, updated.slot_id) };

    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'booking.approve',
      args: { bookingId, approve },
      result: { bookingId, ...result },
      idempotencyKey: updated.idempotency_key,
      familyId: updated.family_id,
    });

    return send(res, 200, { booking: toBooking(updated) });
  } catch (error) {
    return sendServerError(res, error, 'Could not answer this booking. Please try again.');
  }
};
