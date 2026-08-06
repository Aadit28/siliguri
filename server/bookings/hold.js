const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const {
  CREATED_BY,
  enforceRateLimit,
  firstRow,
  isSlotFull,
  requireUuid,
  resolveFamilyContext,
  toBooking,
  writeAudit,
} = require('./_shared');

// Step two of the two-phase booking: reserve the seat for a few minutes without
// committing to it, so an elder has time to say yes or ask a guardian. The
// capacity check and the increment happen inside booking_hold as one statement —
// doing them here would race and double-book. Expired holds go back to capacity
// via the sweeper, never by anything on this path.
module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const slotId = requireUuid(body.slotId, 'slotId');
    // The key is the client's, not ours: a retry after a dropped response has to
    // carry the same one or the elder ends up holding two seats.
    const idempotencyKey = requireUuid(body.idempotencyKey, 'idempotencyKey');
    const createdBy = CREATED_BY.includes(body.createdBy) ? body.createdBy : 'app';
    const { elderId, familyId } = await resolveFamilyContext(auth, body.elderId);

    await enforceRateLimit(auth.supabase, auth.user.id);

    const { data, error } = await auth.supabase.rpc('booking_hold', {
      p_slot_id: slotId,
      p_family_id: familyId,
      p_elder_id: elderId,
      p_idempotency_key: idempotencyKey,
      p_created_by: createdBy,
    });

    if (error) {
      if (!isSlotFull(error)) throw error;
      // Contention is worth recording: a slot that fills under callers all day
      // is the signal that a vendor's calendar is too thin, and the false-confirm
      // metric is read off these rows.
      await writeAudit(auth.supabase, {
        actor: auth.user.id,
        action: 'booking.hold',
        args: { slotId, elderId, createdBy },
        result: { error: 'slot_full' },
        idempotencyKey,
        familyId,
      });
      return send(res, 409, {
        error: 'That time was just taken. Please pick another time.',
        code: 'slot_full',
      });
    }

    const hold = toBooking(firstRow(data));
    if (!hold) throw new Error('booking_hold returned no row.');

    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'booking.hold',
      args: { slotId, elderId, createdBy },
      result: { bookingId: hold.id, status: hold.status, holdExpiresAt: hold.holdExpiresAt },
      idempotencyKey,
      familyId,
    });

    // hold.id is the holdId that /api/bookings/confirm takes.
    return send(res, 200, { hold });
  } catch (error) {
    return sendServerError(res, error, 'Could not hold this appointment. Please try again.');
  }
};
