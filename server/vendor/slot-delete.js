const { authenticate, send, withCors } = require('../_lib/auth');
const { httpError, requestParams, requireUuid } = require('../bookings/_shared');
const { enforceVendorRateLimit, respondVendorError, resolveVendorContext } = require('./_shared');

// Take an appointment time off the calendar.
//
// Three answers, and the difference between the last two is the whole file:
//
//   200 — the row is gone (or was already gone: deleting twice is not an
//         error, it is the same outcome asked for twice).
//   409 slot_has_bookings — somebody is holding a seat right now. Removing it
//         would strand a family who has been told the time is theirs.
//   409 slot_has_history — no live seat, but a booking row somewhere still
//         points at this slot. bookings.slot_id references vendor_slots on
//         delete RESTRICT (migration 17), so the row cannot leave while its
//         past is still attached to it, and that restriction is deliberate:
//         a cancelled booking whose slot vanished is an audit trail that no
//         longer says what time it was for.
//
// The delete itself is one statement with `booked = 0` in its where clause, so
// a hold landing between the check and the removal loses the race and the seat
// is never sold out from under a family. Nothing here reads-then-writes.

function isForeignKeyViolation(error) {
  return String(error?.code || '') === '23503';
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const params = await requestParams(req);
    const { service } = await resolveVendorContext(auth, params.vendorId);
    const slotId = requireUuid(params.slotId, 'slotId');

    const { data: slot, error: readError } = await auth.supabase
      .from('vendor_slots')
      .select('*')
      .eq('id', slotId)
      .maybeSingle();
    if (readError) throw readError;
    // Already gone. Idempotent rather than 404: a vendor who tapped twice on a
    // slow connection asked for one thing and got it.
    if (!slot) return send(res, 200, { ok: true, removed: false, alreadyGone: true });
    if (slot.vendor_id !== service.id) {
      throw httpError(403, 'You do not manage this appointment time.');
    }

    await enforceVendorRateLimit(auth.supabase, auth.user.id);

    const { data: removed, error: deleteError } = await auth.supabase
      .from('vendor_slots')
      .delete()
      .eq('id', slotId)
      // The guard that makes this safe without a transaction.
      .eq('booked', 0)
      .select('id')
      .maybeSingle();

    if (deleteError) {
      if (isForeignKeyViolation(deleteError)) {
        return send(res, 409, {
          error: 'This time has bookings on its record, so it cannot be removed. You can change its seats or its price instead.',
          code: 'slot_has_history',
        });
      }
      throw deleteError;
    }

    if (!removed) {
      // The where clause did not match, which at this point means `booked` is
      // no longer 0: a hold landed while the request was in flight.
      return send(res, 409, {
        error: 'Somebody has just booked this time, so it cannot be removed.',
        code: 'slot_has_bookings',
      });
    }

    return send(res, 200, { ok: true, removed: true, slotId });
  } catch (error) {
    return respondVendorError(res, error, 'Could not remove that appointment time. Please try again.');
  }
};
