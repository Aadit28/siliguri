const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const {
  CREATED_BY,
  SUBSCRIPTION_REQUIRED,
  bookingEntitlement,
  enforceRateLimit,
  firstRow,
  isSlotFull,
  requireUuid,
  resolveFamilyContext,
  rpcBusinessError,
  toBooking,
  writeAudit,
} = require('./_shared');

// The city the appointment has to be reachable from is the ELDER's, not the
// caller's: the guardian doing the booking is often in another country, and
// their own city_id is either somewhere else or not set at all.
async function elderCityId(auth, elderId) {
  if (auth.user && auth.user.id === elderId) return auth.user.city_id || null;
  const { data, error } = await auth.supabase
    .from('user_accounts')
    .select('city_id')
    .eq('id', elderId)
    .maybeSingle();
  if (error) throw error;
  return data?.city_id || null;
}

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

    // The paywall, and the first thing checked once we know whose booking this
    // is. Deliberately at the hold and not at the confirm: a family reads
    // "choose a plan" before they have picked a time and told an elder it is
    // sorted, and no seat is ever held for a booking that will be refused at
    // the last step. Ahead of the city lookup and the rate limiter too — a
    // household with no plan should not be told to set a city first, and should
    // not spend booking budget on a door that is shut.
    //
    // No exception for the voice agent: created_by is provenance, not
    // permission (see CREATED_BY), so a voice booking meets this same gate.
    const entitlement = await bookingEntitlement(auth.supabase, elderId);
    if (!entitlement.allowed) {
      return send(res, SUBSCRIPTION_REQUIRED.status, {
        error: SUBSCRIPTION_REQUIRED.message,
        code: SUBSCRIPTION_REQUIRED.code,
      });
    }

    // search.js scopes what an elder is OFFERED to their own city, but a slotId
    // can reach this endpoint without passing through search at all — the voice
    // agent posts the same door, and a mis-heard or shared uuid would otherwise
    // hold a real seat in a city the elder cannot travel to, notify that vendor
    // and consume their capacity. Prompts and UI are not security; this is.
    // Checked before the rate limiter, which only charges attempts that survive
    // validation.
    const cityId = await elderCityId(auth, elderId);
    if (!cityId) {
      return send(res, 409, {
        error: 'Choose the city for this booking before holding a time.',
        code: 'city_not_set',
      });
    }
    // select('*'): every column on vendor_slots arrived in migration 17, and
    // naming one PostgREST has not seen yet 500s the whole request.
    const { data: slot, error: slotError } = await auth.supabase
      .from('vendor_slots')
      .select('*')
      .eq('id', slotId)
      .maybeSingle();
    if (slotError) throw slotError;
    // Same stance as search.js: a slot in another city is "not found" rather
    // than "not allowed", because to this elder it does not exist.
    if (!slot || (slot.city_id || null) !== cityId) {
      return send(res, 404, {
        error: 'That time is no longer available. Please pick another.',
        code: 'slot_not_found',
      });
    }

    await enforceRateLimit(auth.supabase, auth.user.id);

    const { data, error } = await auth.supabase.rpc('booking_hold', {
      p_slot_id: slotId,
      p_family_id: familyId,
      p_elder_id: elderId,
      p_idempotency_key: idempotencyKey,
      p_created_by: createdBy,
    });

    if (error) {
      if (isSlotFull(error)) {
        // Contention is worth recording: a slot that fills under callers all day
        // is the signal that a vendor's calendar is too thin, and the
        // false-confirm metric is read off these rows.
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
      // The rest of booking_hold's raised outcomes — a key already spent on
      // another slot, a slot that vanished, the two-retries-at-once conflict —
      // are the caller's cue to start again. As 500s they told the elder to
      // "try again" on something retrying can never fix, and paged on it.
      const known = rpcBusinessError(error);
      if (known) return send(res, known.status, { error: known.message, code: known.code });
      throw error;
    }

    const hold = toBooking(firstRow(data));
    if (!hold) throw new Error('booking_hold returned no row.');

    // booking_hold's replay path matches on the idempotency key and the slot
    // alone — it never compares the family on the existing row — so a key
    // already spent by someone else comes back as THEIR booking: id, elder,
    // status, hold_expires_at and all. Confirm re-checks the family later, but
    // this response would already have handed the row over, and a voice agent
    // reusing one key across two elders would silently read back the first
    // elder's appointment as the second one's.
    if (hold.familyId !== familyId || hold.elderId !== elderId) {
      console.warn(`Hold replay for idempotency key ${idempotencyKey} belongs to another family.`);
      return send(res, 403, {
        error: 'That request was already used for someone else. Please start again.',
        code: 'idempotency_key_reused',
      });
    }

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
