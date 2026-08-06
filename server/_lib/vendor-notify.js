// Vendor-side booking notifications, plus the family-side follow-ups that both
// the vendor callback and the booking sweep cron need.
//
// Two things live here on purpose:
//   1. notifyVendorBooking — the outbound "a booking is waiting for you"
//      WhatsApp template with Accept / Reject quick-reply buttons.
//   2. notifyFamilyOfBooking / writeBookingAudit — shared by
//      server/bookings/vendor-callback.js and server/cron/booking-sweep.js so
//      an accepted booking and a swept-up expired one read the same way.
//
// Nothing here throws. A booking must still be created when WhatsApp is down or
// unconfigured (BSP credentials are still pending), so every failure is logged
// and reported through the return value instead.

const { adminClient, normalizePhone } = require('./auth');
const { whatsappConfigured } = require('./whatsapp');
const { sendPushToUsers, guardianIdsForParent } = require('./push');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
const BOOKING_TEMPLATE = process.env.WHATSAPP_BOOKING_TEMPLATE || 'booking_vendor_confirm';
const BOOKING_CANCEL_TEMPLATE = process.env.WHATSAPP_BOOKING_CANCEL_TEMPLATE || 'booking_vendor_cancelled';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// _lib/whatsapp.js already has sendTemplate(phone, name, lang, bodyParams), but
// its component list is body-only: an approved template's quick-reply buttons
// need their own `button` components at send time, one per index, carrying the
// payload the BSP echoes back to the callback. Same env-driven Graph call in
// the same style, with the button components added.
async function sendTemplateWithButtons(phone, templateName, bodyParams = [], buttons = []) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error('WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.');
  }

  const components = [];
  if (bodyParams.length) {
    components.push({
      type: 'body',
      parameters: bodyParams.map((text) => ({ type: 'text', text: String(text) })),
    });
  }
  // Quick-reply buttons are positional: index must match the order the buttons
  // were approved in on the template, not the order we happen to pass them.
  buttons.forEach((button, index) => {
    components.push({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload: String(button.payload) }],
    });
  });

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(phone).replace(/^\+/, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
        components,
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `WhatsApp send failed (${response.status}).`);
  }
  return data;
}

function safeAdminClient() {
  try {
    return adminClient();
  } catch (error) {
    console.warn('Vendor notify: no admin client:', error?.message || error);
    return null;
  }
}

function bookingId(booking) {
  return booking?.id || booking?.booking_id || null;
}

// The vendor is a row in public.services (there is no separate vendors table);
// its WhatsApp number is services.phone. Which column on the booking points at
// it is not settled yet, so try the plausible names rather than hard-failing.
function vendorIdOf(booking) {
  return booking?.service_id || booking?.vendor_id || booking?.provider_id || null;
}

// Every column on bookings/vendor_slots is new, and naming an unmigrated column
// in a PostgREST select 500s the whole request. select('*') and read in JS.
async function loadVendor(client, booking) {
  const id = vendorIdOf(booking);
  if (!id) return null;
  const { data, error } = await client.from('services').select('*').eq('id', id).maybeSingle();
  if (error) {
    console.warn('Vendor lookup failed:', error.message);
    return null;
  }
  if (!data) return null;
  return {
    id: data.id,
    name: data.name || 'Saathi partner',
    phone: normalizePhone(data.phone),
  };
}

function slotLabel(booking) {
  const raw = booking?.scheduled_for || booking?.slot_start || booking?.starts_at || booking?.date_iso;
  if (!raw) return 'the requested time';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return String(raw);
  // Siliguri time, not the server's UTC — a vendor reading "09:00" must read
  // their own morning.
  return parsed.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
}

// Booking-side push audience: whoever booked, the elder the booking is for, and
// that elder's active guardians. De-duplicated by sendPushToUsers.
async function familyRecipientsForBooking(client, booking) {
  // bookings rows carry elder_id and family_id (today both the elder's
  // user_accounts id — resolveFamilyContext anchors the family on the elder).
  // created_by is 'app' | 'voice_agent', never a recipient.
  const elderId = [booking?.elder_id, booking?.family_id].find(
    (value) => typeof value === 'string' && UUID_RE.test(value),
  ) || null;
  if (!elderId) return [];
  const guardians = await guardianIdsForParent(client, elderId);
  return [...new Set([elderId, ...guardians])];
}

// Family-facing push for a booking that changed state. Never throws — the push
// helper already swallows its own failures.
async function notifyFamilyOfBooking(client, booking, message) {
  const recipients = await familyRecipientsForBooking(client, booking);
  if (!recipients.length) return { sent: 0 };
  const vendorId = vendorIdOf(booking);
  return sendPushToUsers(client, recipients, {
    title: message.title,
    body: message.body,
    // /service/[id] exists today; a /bookings route does not, and a push that
    // opens a 404 is worse than one that opens the vendor's page.
    url: message.url || (vendorId ? `/service/${vendorId}` : '/'),
  });
}

// audit_write is the shared ledger; a failed audit must not fail the caller's
// request, so it is logged and swallowed.
async function writeBookingAudit(client, { actor, action, args, result, idempotencyKey, familyId }) {
  try {
    const { error } = await client.rpc('audit_write', {
      p_actor: actor || 'system',
      p_action: action,
      p_args: args || {},
      p_result: result || {},
      p_idempotency_key: idempotencyKey || null,
      p_family_id: familyId || null,
    });
    if (error) throw error;
    return { written: true };
  } catch (error) {
    console.warn('audit_write failed:', error?.message || error);
    return { written: false };
  }
}

// Sends the vendor their booking request with Accept / Reject quick replies.
// The button payloads are what comes back to /api/bookings/vendor-callback, so
// they carry the booking id: the BSP callback has no other reliable correlator.
//
// Template `booking_vendor_confirm` body parameters, in order:
//   {{1}} vendor name  {{2}} customer name  {{3}} when  {{4}} where  {{5}} booking ref
//
// Returns { queued: true, messageId } on send, { queued: false, reason } when
// WhatsApp is unconfigured or the send failed. Never throws.
async function notifyVendorBooking(booking, client) {
  const id = bookingId(booking);
  if (!id) {
    console.warn('Vendor notify skipped: booking has no id.');
    return { queued: false, reason: 'no_booking_id' };
  }
  if (!whatsappConfigured()) {
    // BSP credentials are still pending. Log loudly enough to be greppable and
    // let the booking stand — the sweep cron will expire it if nobody acts.
    console.warn(`Vendor notify skipped (WhatsApp not configured) for booking ${id}.`);
    return { queued: false, reason: 'whatsapp_not_configured' };
  }

  const db = client || safeAdminClient();
  if (!db) return { queued: false, reason: 'no_db_client' };

  try {
    const vendor = await loadVendor(db, booking);
    if (!vendor) return { queued: false, reason: 'vendor_not_found' };
    if (!vendor.phone) {
      console.warn(`Vendor notify skipped: service ${vendor.id} has no phone number.`);
      return { queued: false, reason: 'vendor_has_no_phone' };
    }

    const customer = booking.customer_name || booking.contact_name || 'A Saathi family';
    const where = booking.address || booking.area || booking.location || 'Siliguri';
    const reference = String(id).slice(0, 8);

    const result = await sendTemplateWithButtons(
      vendor.phone,
      BOOKING_TEMPLATE,
      [vendor.name, customer, slotLabel(booking), where, reference],
      [
        { payload: `ACCEPT:${id}` },
        { payload: `REJECT:${id}` },
      ],
    );
    return { queued: true, messageId: result?.messages?.[0]?.id || null, phone: vendor.phone };
  } catch (error) {
    console.error(`Vendor notify failed for booking ${id}:`, error?.message || error);
    return { queued: false, reason: 'send_failed' };
  }
}

// The other half of notifyVendorBooking: the family called the booking off after
// the vendor had already been asked to hold the time (pending_vendor) or had
// tapped Accept (confirmed). Without this the vendor's last word on the matter
// is "a booking is waiting for you" and they keep the slot for a family that is
// not coming.
//
// Template `booking_vendor_cancelled` body parameters, in order:
//   {{1}} vendor name  {{2}} customer name  {{3}} when  {{4}} booking ref
// No buttons: there is nothing left for the vendor to answer.
//
// Same degradation as notifyVendorBooking — never throws, and an unconfigured
// BSP is reported through the return value rather than failing the cancel the
// family already asked for.
async function notifyVendorCancellation(booking, client) {
  const id = bookingId(booking);
  if (!id) {
    console.warn('Vendor cancel notify skipped: booking has no id.');
    return { queued: false, reason: 'no_booking_id' };
  }
  if (!whatsappConfigured()) {
    console.warn(`Vendor cancel notify skipped (WhatsApp not configured) for booking ${id}.`);
    return { queued: false, reason: 'whatsapp_not_configured' };
  }

  const db = client || safeAdminClient();
  if (!db) return { queued: false, reason: 'no_db_client' };

  try {
    const vendor = await loadVendor(db, booking);
    if (!vendor) return { queued: false, reason: 'vendor_not_found' };
    if (!vendor.phone) {
      console.warn(`Vendor cancel notify skipped: service ${vendor.id} has no phone number.`);
      return { queued: false, reason: 'vendor_has_no_phone' };
    }

    const customer = booking.customer_name || booking.contact_name || 'A Saathi family';
    const reference = String(id).slice(0, 8);

    const result = await sendTemplateWithButtons(
      vendor.phone,
      BOOKING_CANCEL_TEMPLATE,
      [vendor.name, customer, slotLabel(booking), reference],
      [],
    );
    return { queued: true, messageId: result?.messages?.[0]?.id || null, phone: vendor.phone };
  } catch (error) {
    console.error(`Vendor cancel notify failed for booking ${id}:`, error?.message || error);
    return { queued: false, reason: 'send_failed' };
  }
}

module.exports = {
  notifyVendorBooking,
  notifyVendorCancellation,
  notifyFamilyOfBooking,
  familyRecipientsForBooking,
  writeBookingAudit,
  sendTemplateWithButtons,
  loadVendor,
  BOOKING_TEMPLATE,
  BOOKING_CANCEL_TEMPLATE,
};
