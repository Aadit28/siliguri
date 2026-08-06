const { adminClient, send, withCors } = require('../_lib/auth');
const { notifyFamilyOfBooking, writeBookingAudit } = require('../_lib/vendor-notify');

// Every five minutes: hand expired holds and unanswered vendor requests back to
// the database's booking_release_expired(), then tell the family what happened.
//
// Same gate as the digest cron: Vercel calls this with
// `Authorization: Bearer ${CRON_SECRET}`, and the same secret allows a manual
// run. The state change itself is the rpc's job — this endpoint only reports
// it, so a failed push never leaves a booking half-released.

// Statuses booking_release_expired() can leave behind, and what the family is
// told about each.
const MESSAGES = {
  cancelled_vendor_timeout: {
    title: 'Booking not confirmed',
    body: 'The provider did not respond in time. Please pick another time or provider.',
  },
  expired: {
    title: 'Booking expired',
    body: 'Your held slot expired before it was confirmed. Please book again.',
  },
};

// booking_release_expired() answers with a jsonb ARRAY of the booking rows it
// released — { id, slot_id, status, elder_id, family_id, service_id } each, and
// [] when nothing was due.
//
// The `row.id` filter is what keeps a non-booking object out of the loop. An
// earlier build of the function returned a single {expired, vendor_timeout,
// slots_freed} counts object, which this wrapped as a one-element array: the
// loop then read a counts object as a booking, so no family was ever told their
// hold had expired, the endpoint reported released:1 on every tick, and
// audit_log collected one all-null junk row every five minutes for ever.
function rowsFrom(data) {
  const rows = Array.isArray(data) ? data : [data];
  return rows.filter((row) => row && typeof row === 'object' && row.id);
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.CRON_SECRET;
  const header = String(req.headers.authorization || '');
  if (!secret || header !== `Bearer ${secret}`) {
    return send(res, 401, { error: 'Not allowed.' });
  }

  try {
    const client = adminClient();

    const { data, error } = await client.rpc('booking_release_expired');
    if (error) throw error;

    const released = rowsFrom(data);
    if (!released.length) {
      return send(res, 200, { ok: true, released: 0, notified: 0 });
    }

    let notified = 0;
    for (const booking of released) {
      const message = MESSAGES[booking.status] || MESSAGES.expired;
      const result = await notifyFamilyOfBooking(client, booking, message);
      notified += result.sent;

      await writeBookingAudit(client, {
        actor: 'system:booking-sweep',
        action: 'booking.release_expired',
        args: {
          booking_id: booking.id,
          // Shares cancelled_vendor_timeout with an explicit vendor reject; the
          // reason is the only thing that separates them.
          reason: 'timeout',
          slot_id: booking.slot_id || null,
        },
        result: { status: booking.status || null, pushed: result.sent },
        // audit_write's p_idempotency_key is typed uuid, so the old
        // `booking:<id>:sweep` string raised 22P02 and writeBookingAudit
        // swallowed it — the expiry never reached the ledger at all. The booking
        // id is the uuid, and it is released exactly once.
        idempotencyKey: booking.id,
        familyId: booking.family_id || null,
      });
    }

    return send(res, 200, { ok: true, released: released.length, notified });
  } catch (error) {
    console.error('Booking sweep cron failed:', error?.message || error);
    return send(res, 500, { error: 'Booking sweep failed.' });
  }
};
