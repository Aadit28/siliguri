const crypto = require('crypto');
const { adminClient, normalizePhone, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const { loadVendor, notifyFamilyOfBooking, writeBookingAudit } = require('../_lib/vendor-notify');

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
const ACTIONABLE = new Set(['pending_vendor', 'held']);
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
    // the tap. Only trust the decision when the replying number is the number
    // the template went to; both sides must be resolvable for this to reject.
    const vendor = await loadVendor(client, booking);
    const replyPhone = normalizePhone(reply.from);
    if (vendor?.phone && replyPhone && vendor.phone !== replyPhone) {
      console.warn(`Vendor callback phone mismatch on booking ${id}.`);
      return send(res, 403, { error: 'Not allowed.' });
    }

    if (!ACTIONABLE.has(booking.status)) {
      // Duplicate delivery, or the sweep already expired it. Report the settled
      // status rather than moving it again.
      return send(res, 200, { ok: true, status: booking.status, idempotent: true });
    }

    const status = decision === 'accept' ? ACCEPTED_STATUS : DECLINED_STATUS;
    const { error: updateError } = await client
      .from('bookings')
      .update({ status })
      // Only move a booking still in the state we read: a concurrent sweep or a
      // second tap loses the race instead of overwriting a settled booking.
      .eq('id', id)
      .eq('status', booking.status);
    if (updateError) throw updateError;

    if (decision === 'reject' && booking.slot_id) {
      // Give the slot back. Read-modify-write because the column is new and the
      // decrement has no rpc yet; the sweep re-checks capacity anyway.
      const { data: slot, error: slotError } = await client
        .from('vendor_slots')
        .select('*')
        .eq('id', booking.slot_id)
        .maybeSingle();
      if (slotError) console.warn('Slot release read failed:', slotError.message);
      else if (slot) {
        const booked = Math.max(0, Number(slot.booked || 0) - 1);
        const { error: releaseError } = await client
          .from('vendor_slots')
          .update({ booked })
          .eq('id', booking.slot_id);
        if (releaseError) console.warn('Slot release failed:', releaseError.message);
      }
    }

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
      result: { status },
      idempotencyKey: `booking:${id}:vendor:${decision}`,
      familyId: booking.family_id || null,
    });

    return send(res, 200, { ok: true, status });
  } catch (error) {
    return sendServerError(res, error, 'Could not record the vendor response.');
  }
};
