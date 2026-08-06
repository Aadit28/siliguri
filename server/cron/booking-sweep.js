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

// The rpc may return rows, a single row, or a count depending on how it is
// declared; only rows carry enough to notify anyone.
function rowsFrom(data) {
  if (Array.isArray(data)) return data.filter((row) => row && typeof row === 'object');
  if (data && typeof data === 'object') return [data];
  return [];
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
          booking_id: booking.id || null,
          // Shares cancelled_vendor_timeout with an explicit vendor reject; the
          // reason is the only thing that separates them.
          reason: 'timeout',
          slot_id: booking.slot_id || null,
        },
        result: { status: booking.status || null, pushed: result.sent },
        idempotencyKey: booking.id ? `booking:${booking.id}:sweep` : null,
        familyId: booking.family_id || null,
      });
    }

    return send(res, 200, { ok: true, released: released.length, notified });
  } catch (error) {
    console.error('Booking sweep cron failed:', error?.message || error);
    return send(res, 500, { error: 'Booking sweep failed.' });
  }
};
