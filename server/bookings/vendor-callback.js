const crypto = require('crypto');
const { adminClient, normalizePhone, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const { loadVendor, notifyFamilyOfBooking, writeBookingAudit } = require('../_lib/vendor-notify');
const { releaseSlot } = require('./_shared');

// Inbound webhook for the vendor's Accept / Reject tap on the
// booking_vendor_confirm template.
//
// Caller is the BSP, not a signed-in user, so authenticate() does not apply:
// the gate is a shared secret (BOOKING_WEBHOOK_SECRET) configured on the BSP's
// webhook. Anything without it is a 401.
//
// Status mapping. The allowed set is held, pending_guardian, pending_vendor,
// confirmed, completed, cancelled_user, cancelled_vendor_timeout, expired.
// There is no separate "vendor declined" status, so an explicit reject and a
// silent timeout share the cancelled_vendor_timeout bucket; which of the two it
// was is recorded in the audit args (reason: 'vendor_reject' | 'timeout') so
// vendor reliability can still be measured later.

const ACCEPTED_STATUS = 'confirmed';
const DECLINED_STATUS = 'cancelled_vendor_timeout';
// Only a booking still waiting on the vendor can be moved by this webhook.
// Anything else is a duplicate delivery or a race with the sweep cron.
//
// 'held' is deliberately NOT in here. A vendor is only ever messaged once
// booking_confirm has routed the booking to them, so no real tap can concern a
// held booking — but accepting one would move it straight to 'confirmed',
// skipping the confirm phase entirely: no hold-expiry check, no amount check,
// and no pending_guardian fork, which is the spend cap the whole family model
// rests on. Anyone holding the shared secret would have been able to commit an
// above-threshold booking with no family involvement at all.
const ACTIONABLE = new Set(['pending_vendor']);
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function secretMatches(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function presentedSecret(req) {
  const header = req.headers['x-webhook-secret']
    || req.headers['x-saathi-webhook-secret']
    || req.headers['x-hub-signature-secret'];
  if (header) return String(header).trim();
  const auth = String(req.headers.authorization || '');
  return auth.replace(/^Bearer\s+/i, '').trim();
}

// BSP payload shapes differ and change. Handle Gupshup's
// { payload: { type, payload: { id, title }, sender } } and Meta Cloud's
// entry[].changes[].value.messages[].button, and fall back to a flat body so a
// manual replay (curl with { bookingId, decision }) still works.
function extractReply(body) {
  const out = { payload: '', title: '', from: '', messageId: '' };
  if (!body || typeof body !== 'object') return out;

  const gupshup = body.payload;
  if (gupshup && typeof gupshup === 'object') {
    const inner = gupshup.payload;
    if (inner && typeof inner === 'object') {
      out.payload = String(inner.id || inner.payload || '');
      out.title = String(inner.title || inner.text || '');
    } else if (typeof inner === 'string') {
      out.title = inner;
    }
    out.from = String(gupshup.source || gupshup.sender?.phone || '');
    out.messageId = String(gupshup.id || '');
  }

  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (message && typeof message === 'object') {
    const quickReply = message.button || message.interactive?.button_reply || {};
    out.payload = out.payload || String(quickReply.payload || quickReply.id || '');
    out.title = out.title || String(quickReply.text || quickReply.title || '');
    out.from = out.from || String(message.from || '');
    out.messageId = out.messageId || String(message.id || '');
  }

  // Flat fallback (manual replay / a BSP that posts the button verbatim).
  out.payload = out.payload || String(body.buttonPayload || body.payload_id || body.decision || '');
  out.title = out.title || String(body.buttonText || body.title || '');
  out.from = out.from || String(body.from || body.phone || '');
  out.messageId = out.messageId || String(body.messageId || '');
  if (body.bookingId && !UUID_RE.test(out.payload)) {
    out.payload = `${out.payload || ''}:${body.bookingId}`;
  }
  return out;
}

function decisionFrom({ payload, title }) {
  const text = `${payload} ${title}`.toLowerCase();
  if (/\b(accept|confirm|yes|haan)\b/.test(text)) return 'accept';
  if (/\b(reject|decline|refuse|cancel|no|nahi)\b/.test(text)) return 'reject';
  return null;
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const secret = process.env.BOOKING_WEBHOOK_SECRET;
  if (!secret) {
    // Nothing can be authenticated, so nothing is accepted. 503, not 401, so
    // the missing configuration is distinguishable from a wrong secret.
    console.error('Vendor callback rejected: BOOKING_WEBHOOK_SECRET is not set.');
    return send(res, 503, { error: 'Webhook is not configured.' });
  }
  if (!secretMatches(presentedSecret(req), secret)) {
    return send(res, 401, { error: 'Not allowed.' });
  }

  try {
    const body = await readBody(req);
    const reply = extractReply(body);
    const decision = decisionFrom(reply);
    const idMatch = String(reply.payload || '').match(UUID_RE)
      || String(body.bookingId || '').match(UUID_RE);
    const id = idMatch ? idMatch[0] : null;

    // A BSP retries anything that is not 2xx. Deliveries we cannot act on
    // (a plain text reply, a status receipt) are acknowledged, not retried.
    if (!id || !decision) {
      return send(res, 200, { ok: true, ignored: true, reason: !id ? 'no_booking_id' : 'no_decision' });
    }

    const client = adminClient();
    const { data: booking, error: bookingError } = await client
      .from('bookings')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return send(res, 200, { ok: true, ignored: true, reason: 'booking_not_found' });

    // The shared secret proves the caller is the BSP, not that this vendor sent
    // the tap. Two levels, because the two decisions carry different risk:
    //
    //   - a resolved mismatch is somebody else's number answering for this
    //     vendor, and is refused whichever way it votes;
    //   - an UNRESOLVABLE sender — a payload shape with no `from`, the flat
    //     curl-replay format, a service with no number on file — cannot be
    //     attributed to anybody. It may not confirm, because confirming commits
    //     the family's money on the strength of one static string. Reject stays
    //     allowed: it only hands the seat back, which the 15-minute sweep would
    //     do anyway, so failing closed there would strand bookings for nothing.
    //
    // Refusals answer 200 rather than 403 so a legitimate BSP payload variant
    // cannot start a retry storm, and land in the ledger so "the vendor's tap
    // was ignored" is findable rather than invisible.
    const vendor = await loadVendor(client, booking);
    const replyPhone = normalizePhone(reply.from);
    const attributable = Boolean(vendor?.phone) && Boolean(replyPhone);
    const senderIsVendor = attributable && vendor.phone === replyPhone;
    if (attributable ? !senderIsVendor : decision === 'accept') {
      const reason = attributable ? 'sender_mismatch' : 'sender_unverified';
      console.warn(
        `Vendor callback identity unverified on booking ${id} (${reason}: `
        + `vendor_phone=${vendor?.phone ? 'set' : 'missing'}, sender=${replyPhone ? 'set' : 'missing'}).`,
      );
      await writeBookingAudit(client, {
        actor: vendor?.id ? `service:${vendor.id}` : 'vendor',
        action: 'booking.vendor_callback_unverified',
        args: {
          booking_id: id,
          decision,
          reason,
          message_id: reply.messageId || null,
        },
        result: { rejected: true },
        idempotencyKey: booking.idempotency_key || null,
        familyId: booking.family_id || null,
      });
      return send(res, 200, { ok: true, ignored: true, reason });
    }

    if (!ACTIONABLE.has(booking.status)) {
      // Duplicate delivery, or the sweep already expired it. Report the settled
      // status rather than moving it again.
      return send(res, 200, { ok: true, status: booking.status, idempotent: true });
    }

    const status = decision === 'accept' ? ACCEPTED_STATUS : DECLINED_STATUS;
    const { data: moved, error: updateError } = await client
      .from('bookings')
      .update({ status, updated_at: new Date().toISOString() })
      // Only move a booking still in the state we read: a concurrent sweep or a
      // second tap loses the race instead of overwriting a settled booking.
      .eq('id', id)
      .eq('status', booking.status)
      // The guard is worthless unless the result is read. Without this, a
      // booking the sweep cancelled between the read above and this write
      // matched zero rows and the handler carried on regardless: it decremented
      // a seat the sweep had already given back, and told the family "Booking
      // confirmed" about a booking that was actually cancelled.
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (!moved) {
      const { data: current } = await client
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      // Somebody else settled it. The seat and the family's notification belong
      // to whoever won; report where the booking actually landed.
      return send(res, 200, {
        ok: true,
        status: current?.status || booking.status,
        idempotent: true,
      });
    }

    // Hand the seat back through the shared compare-and-set. The old inline
    // read-modify-write had no guard on `booked`, so a hold taken between its
    // read and its write was silently overwritten and the slot advertised a seat
    // that was already sold.
    const slotReleased = decision === 'reject' && booking.slot_id
      ? await releaseSlot(client, booking.slot_id)
      : null;

    const vendorName = vendor?.name || 'The provider';
    await notifyFamilyOfBooking(client, booking, {
      title: decision === 'accept' ? 'Booking confirmed' : 'Booking not available',
      body: decision === 'accept'
        ? `${vendorName} confirmed your booking.`
        : `${vendorName} could not take this booking. Please pick another time or provider.`,
    });

    await writeBookingAudit(client, {
      actor: vendor?.id ? `service:${vendor.id}` : 'vendor',
      action: decision === 'accept' ? 'booking.vendor_accept' : 'booking.vendor_decline',
      args: {
        booking_id: id,
        // The status cannot tell reject from timeout — they share a bucket — so
        // the distinction is only preserved here.
        reason: decision === 'accept' ? 'vendor_accept' : 'vendor_reject',
        from_status: booking.status,
        slot_id: booking.slot_id || null,
        message_id: reply.messageId || null,
      },
      result: { status, slotReleased },
      // audit_write's p_idempotency_key is typed uuid: a `booking:<id>:vendor:x`
      // string raises 22P02 and writeBookingAudit swallows it, so every vendor
      // decision was quietly missing from the ledger. The booking's own key is
      // the uuid that ties this row to the rest of its timeline; which event it
      // was is in `action` and `args`.
      idempotencyKey: booking.idempotency_key || null,
      familyId: booking.family_id || null,
    });

    return send(res, 200, { ok: true, status });
  } catch (error) {
    return sendServerError(res, error, 'Could not record the vendor response.');
  }
};
