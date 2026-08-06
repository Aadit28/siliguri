const { authenticate, readBody, send, withCors } = require('../_lib/auth');
const { httpError, releaseSlot, requireUuid, toBooking } = require('../bookings/_shared');
const { notifyFamilyOfBooking, writeBookingAudit } = require('../_lib/vendor-notify');
const { enforceVendorRateLimit, respondVendorError, resolveVendorContext } = require('./_shared');

// The in-app twin of server/bookings/vendor-callback.js: a vendor accepting or
// declining a booking from their own screen rather than from a WhatsApp button.
//
// Same transitions, same guards, same audit vocabulary — on purpose. Two ways
// for a vendor to answer must land a booking in the same place, or the family's
// timeline reads differently depending on which device the shop happened to
// reach for.
//
// What differs is only the proof of identity, and this side has the better one:
// the webhook can offer a shared secret and a phone number that a BSP payload
// may not even carry, while this caller holds a session token whose account
// owns the services row. There is no unverified-sender branch here because
// there is no unverified sender.

const ACCEPTED_STATUS = 'confirmed';
// There is no separate "declined" status. An explicit refusal and a silent
// 15-minute timeout share cancelled_vendor_timeout, and which one it was
// survives only in the audit args — see the header of vendor-callback.js.
const DECLINED_STATUS = 'cancelled_vendor_timeout';
const ACTIONABLE = new Set(['pending_vendor']);

const DECISIONS = { accept: ACCEPTED_STATUS, decline: DECLINED_STATUS };

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
    const bookingId = requireUuid(body.bookingId, 'bookingId');
    const decision = String(body.decision || '').trim().toLowerCase();
    if (!DECISIONS[decision]) {
      return send(res, 400, { error: 'Send decision as accept or decline.' });
    }

    const { data: booking, error: readError } = await auth.supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();
    if (readError) throw readError;
    if (!booking) return send(res, 404, { error: 'That booking was not found.' });
    if (booking.vendor_id !== service.id) {
      throw httpError(403, 'This booking is for another listing.');
    }

    if (!ACTIONABLE.has(booking.status)) {
      // The sweep cancelled it, or the vendor answered on WhatsApp a moment
      // ago. Report where it actually is rather than moving a settled booking.
      return send(res, 200, {
        ok: true,
        idempotent: true,
        booking: toBooking(booking),
      });
    }

    await enforceVendorRateLimit(auth.supabase, auth.user.id);

    const status = DECISIONS[decision];
    const { data: moved, error: updateError } = await auth.supabase
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      // Claim check: the row must still be in the state that was read. A
      // concurrent sweep or a WhatsApp tap arriving at the same moment wins or
      // loses cleanly instead of both writing.
      .eq('status', booking.status)
      // Reading the result is what makes the guard real — see the comment on
      // the same update in vendor-callback.js, where not reading it once told a
      // family their booking was confirmed after the sweep had cancelled it.
      .select('*')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!moved) {
      const { data: current } = await auth.supabase
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .maybeSingle();
      return send(res, 200, {
        ok: true,
        idempotent: true,
        booking: toBooking(current || booking),
      });
    }

    // Hand the seat back through the shared compare-and-set rather than an
    // inline decrement; releaseSlot logs a capacity leak it cannot repair, and
    // that log line is the only warning a slot has drifted.
    const slotReleased = decision === 'decline' && booking.slot_id
      ? await releaseSlot(auth.supabase, booking.slot_id)
      : null;

    const vendorLabel = service.name || 'The provider';
    await notifyFamilyOfBooking(auth.supabase, booking, {
      title: decision === 'accept' ? 'Booking confirmed' : 'Booking not available',
      body: decision === 'accept'
        ? `${vendorLabel} confirmed your booking.`
        : `${vendorLabel} could not take this booking. Please pick another time or provider.`,
    });

    await writeBookingAudit(auth.supabase, {
      // Same actor vocabulary as the webhook — the shop is the actor either
      // way — with the channel in args, so vendor reliability can be measured
      // across both without joining on anything.
      actor: `service:${service.id}`,
      action: decision === 'accept' ? 'booking.vendor_accept' : 'booking.vendor_decline',
      args: {
        booking_id: bookingId,
        reason: decision === 'accept' ? 'vendor_accept' : 'vendor_reject',
        channel: 'app',
        from_status: booking.status,
        slot_id: booking.slot_id || null,
        decided_by: auth.user.id,
      },
      result: { status, slotReleased },
      // audit_write's p_idempotency_key is typed uuid; the booking's own key is
      // the only uuid that ties this row to the rest of its timeline.
      idempotencyKey: booking.idempotency_key || null,
      familyId: booking.family_id || null,
    });

    return send(res, 200, { ok: true, booking: toBooking(moved), slotReleased });
  } catch (error) {
    return respondVendorError(res, error, 'Could not record your answer. Please try again.');
  }
};
