const {
  authenticate,
  readBody,
  requireFamilyLink,
  send,
  sendServerError,
  withCors,
} = require('../_lib/auth');
const {
  SUBSCRIPTION_REQUIRED,
  approvalThresholdPaise,
  bookingEntitlement,
  enforceRateLimit,
  firstRow,
  httpError,
  loadBooking,
  notifyGuardiansForApproval,
  notifyVendor,
  requireUuid,
  rpcBusinessError,
  toBooking,
  writeAudit,
} = require('./_shared');

// The irreversible half of the two-phase booking. booking_confirm decides the
// fork itself — over the family's threshold it parks the booking on the
// guardian, otherwise it goes straight to the vendor — and the same idempotency
// key returns the same result on a retry rather than booking twice.
module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const holdId = requireUuid(body.holdId, 'holdId');
    const idempotencyKey = requireUuid(body.idempotencyKey, 'idempotencyKey');

    // The SQL function is given only the hold id, so the "may this caller
    // confirm it" question is answered here: without this, knowing a hold's uuid
    // would be enough to commit another family's money.
    const held = await loadBooking(auth.supabase, holdId);
    const linkError = await requireFamilyLink(auth, held.family_id);
    if (linkError) return send(res, 403, linkError);

    // The gate that matters is at the hold; this is the cheap second look. A
    // hold can outlive the plan that allowed it — Razorpay can halt a mandate
    // between the two calls — and the alternative is committing a booking for a
    // household the paywall has already closed behind.
    //
    // family_id is the elder's account id, which is the key entitlement_for
    // takes. The hold itself is left where it is: it expires on its own minutes
    // from now and booking_release_expired() hands the seat back, whereas
    // cancelling it here would take the seat off a family who may well pay and
    // confirm inside the same five minutes.
    const entitlement = await bookingEntitlement(auth.supabase, held.family_id);
    if (!entitlement.allowed) {
      return send(res, SUBSCRIPTION_REQUIRED.status, {
        error: SUBSCRIPTION_REQUIRED.message,
        code: SUBSCRIPTION_REQUIRED.code,
      });
    }

    await enforceRateLimit(auth.supabase, auth.user.id);

    const { data, error } = await auth.supabase.rpc('booking_confirm', {
      p_hold_id: holdId,
      p_idempotency_key: idempotencyKey,
      p_approval_threshold_paise: approvalThresholdPaise(),
    });
    if (error) {
      // hold_expired is the routine one: an elder who paused to ask a family
      // member takes longer than five minutes, and as a 500 the answer was both
      // useless ("please try again" re-raises it for ever with the same holdId)
      // and noisy (every paused elder logged as a server fault). These are
      // outcomes, so they get a status and a code the app can act on.
      const known = rpcBusinessError(error);
      if (!known) throw error;
      await writeAudit(auth.supabase, {
        actor: auth.user.id,
        action: 'booking.confirm',
        args: { holdId, thresholdPaise: approvalThresholdPaise() },
        result: { bookingId: holdId, error: known.code },
        idempotencyKey,
        familyId: held.family_id,
      });
      return send(res, known.status, { error: known.message, code: known.code });
    }

    // Fall back to re-reading the row: the confirm function is the authority on
    // the new status, and answering with a stale one would tell an elder the
    // appointment is booked when it is still waiting on somebody.
    const returned = firstRow(data);
    const row = returned && returned.id ? returned : await loadBooking(auth.supabase, holdId);
    const booking = toBooking(row);
    if (!booking) throw httpError(404, 'That hold is gone. Please pick a time again.');

    // Both branches are awaited before the response — Vercel freezes the
    // function the moment it ends.
    let notified = null;
    if (booking.status === 'pending_guardian') {
      notified = { guardiansAlerted: await notifyGuardiansForApproval(auth.supabase, auth, row) };
    } else if (booking.status === 'pending_vendor') {
      // The raw row, not the mapped booking: the notifier reads snake_case
      // columns off it. Its { queued, reason } goes into the audit row, because
      // "the vendor was never told" is the failure worth being able to find.
      notified = { vendorNotify: await notifyVendor(row, auth.supabase) };
    }

    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'booking.confirm',
      args: { holdId, thresholdPaise: approvalThresholdPaise() },
      result: { bookingId: booking.id, status: booking.status, ...(notified || {}) },
      idempotencyKey,
      familyId: booking.familyId || held.family_id,
    });

    return send(res, 200, { booking });
  } catch (error) {
    return sendServerError(res, error, 'Could not confirm this appointment. Please try again.');
  }
};
