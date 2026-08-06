const crypto = require('crypto');
const { adminClient, send, sendServerError, withCors } = require('../_lib/auth');
const { elderFamilyContext } = require('../_lib/entitlements');

// Razorpay's subscription webhook: the only thing in this codebase allowed to
// say a subscription is paid for.
//
// THE RAW BODY PROBLEM (read before changing anything here)
// ---------------------------------------------------------
// Razorpay signs the exact bytes it sent: X-Razorpay-Signature is
// hex(HMAC-SHA256(raw_body, RAZORPAY_WEBHOOK_SECRET)). Verifying against a
// re-serialised object is therefore only as good as the two serialisers
// agreeing byte for byte.
//
// On Vercel this route cannot see those bytes. Every /api/* request is
// rewritten into the single api/index.js function (vercel.json), and the
// @vercel/node helper drains the request stream and buffers it BEFORE the
// handler runs — that is why readBody() in _lib/auth.js finds req.body already
// populated in production and has to stream only in local dev. The buffer stays
// inside the helper's closure; for `application/json`, which is what Razorpay
// sends, only the parsed object is exposed. There is no req.rawBody on Vercel.
//
// So this file takes the bytes when it can and reconstructs them when it
// cannot:
//
//   1. req.rawBody, if some host or proxy set it.               (exact)
//   2. The request stream, if nothing has read it yet. This is
//      scripts/dev-api.js locally and any plain Node host.      (exact)
//   3. JSON.stringify of the already-parsed body, tried against
//      a handful of serialiser dialects.                        (reconstructed)
//
// Tier 3 is the production path today and it is a real risk: it fails if
// Razorpay's serialiser escapes anything V8's does not (a `\/` solidus, a
// `\uXXXX` for a Devanagari name), so those two dialects are tried as well.
// Trying several candidates costs nothing in security — each one still has to
// produce the signature Razorpay computed, which needs the secret — but it is
// not a proof. A mismatch on this path is logged distinctly from a mismatch on
// an exact body, so "our reconstruction drifted" is never mistaken for "someone
// is forging webhooks".
//
// THE BYTE-EXACT FIX, when this route earns its own deploy slot: give the
// webhook its own file at api/billing/webhook.js. Vercel checks the filesystem
// before it applies vercel.json rewrites, so that file would receive the
// request instead of the dispatcher, and it can opt out of body parsing
// (module.exports.config = { api: { bodyParser: false } }) without breaking
// req.query for every other route — which is why the opt-out cannot simply be
// added to api/index.js: the dispatcher reads req.query.route. It costs one of
// the Hobby plan's 12 functions.

const MAX_BODY_BYTES = 256 * 1024;

// Razorpay event -> our subscriptions.status.
//
// subscription.pending is deliberately absent: Razorpay uses it while retrying
// a failed charge, our status column has no such value, and within a day it
// resolves into halted or active, both of which are handled. The event is still
// audited so a family's failed-payment history is not invisible.
// subscription.resumed is handled although it was not in the brief — without it
// a paused subscription that the family restarted would stay locked out.
const EVENT_STATUS = {
  'subscription.authenticated': 'authenticated',
  'subscription.activated': 'active',
  'subscription.charged': 'active',
  'subscription.resumed': 'active',
  'subscription.paused': 'paused',
  'subscription.halted': 'halted',
  'subscription.cancelled': 'cancelled',
  'subscription.completed': 'completed',
};

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function tooLarge() {
  const error = new Error('Request too large.');
  error.status = 413;
  error.publicError = 'Request too large.';
  return error;
}

// Non-ASCII as \uXXXX, the way a serialiser configured for ASCII-safe output
// would emit it.
const NON_ASCII_RE = new RegExp('[^\\x00-\\x7f]', 'g');

function asciiEscaped(text) {
  return text.replace(NON_ASCII_RE, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

async function drainStream(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Returns { candidates: [{ label, text }], exact }. Ordered best-first; the
// signature is checked against each.
async function bodyCandidates(req) {
  if (req.rawBody) {
    const text = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : String(req.rawBody);
    return { candidates: [{ label: 'raw_body', text }], exact: true };
  }

  // readableEnded as well as readable: a stream that has already been consumed
  // yields an empty string rather than throwing, and an empty string hashes to
  // a stable digest that would never match — an unexplained 401 instead of a
  // fall through to reconstruction.
  if (req.readable === true && req.readableEnded !== true) {
    return { candidates: [{ label: 'stream', text: await drainStream(req) }], exact: true };
  }

  let parsed;
  try {
    parsed = req.body;
  } catch {
    // The platform's own parser rejected the payload; there is nothing left to
    // verify against.
    return { candidates: [], exact: false };
  }
  if (Buffer.isBuffer(parsed)) {
    return { candidates: [{ label: 'buffer_body', text: parsed.toString('utf8') }], exact: true };
  }
  if (typeof parsed === 'string') {
    return { candidates: [{ label: 'string_body', text: parsed }], exact: true };
  }
  if (!parsed || typeof parsed !== 'object') return { candidates: [], exact: false };

  const compact = JSON.stringify(parsed);
  return {
    exact: false,
    candidates: [
      { label: 'restringified', text: compact },
      { label: 'restringified_escaped_solidus', text: compact.replace(/\//g, '\\/') },
      { label: 'restringified_ascii', text: asciiEscaped(compact) },
    ],
  };
}

function digestMatches(digestHex, providedHex) {
  const a = Buffer.from(digestHex, 'utf8');
  const b = Buffer.from(String(providedHex || '').trim(), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verify(candidates, secret, provided) {
  for (const candidate of candidates) {
    const digest = crypto.createHmac('sha256', secret).update(candidate.text, 'utf8').digest('hex');
    if (digestMatches(digest, provided)) return candidate;
  }
  return null;
}

// Razorpay sends seconds since the epoch, and only on the events that renew a
// cycle. Anything unparseable is treated as absent so the rpc keeps the period
// the last good event recorded.
function toIso(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function writeAudit(client, args) {
  try {
    const { error } = await client.rpc('audit_write', {
      p_actor: 'razorpay',
      p_action: args.action,
      p_args: args.args || {},
      p_result: args.result || {},
      // Razorpay's X-Razorpay-Event-Id is not always a uuid and audit_write
      // types this column as one, so anything else travels in args instead of
      // failing the whole write.
      p_idempotency_key: UUID_RE.test(String(args.eventId || '')) ? args.eventId : null,
      p_family_id: args.familyId || null,
    });
    if (error) throw error;
  } catch (error) {
    console.warn('audit_write failed for', args.action, error?.message || error);
  }
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  const secret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    // Nothing can be verified, so nothing is accepted. 503 rather than 401 so
    // an unset secret is distinguishable from a wrong one in the logs.
    console.error('Razorpay webhook rejected: RAZORPAY_WEBHOOK_SECRET is not set.');
    return send(res, 503, { error: 'billing_not_configured' });
  }

  try {
    const provided = req.headers['x-razorpay-signature'];
    if (!provided) return send(res, 401, { error: 'Not allowed.' });

    const { candidates, exact } = await bodyCandidates(req);
    const matched = verify(candidates, secret, provided);
    if (!matched) {
      if (!exact) {
        // The distinction that matters at 3am: on this path a mismatch is at
        // least as likely to be our re-serialisation as an attacker, and the
        // fix is the dedicated function file described at the top.
        console.error(
          'Razorpay webhook signature mismatch on a RECONSTRUCTED body. If this is every delivery, '
          + 'the raw bytes are unavailable on this host - see the header comment in server/billing/webhook.js.',
        );
      } else {
        console.warn('Razorpay webhook signature mismatch on an exact body.');
      }
      return send(res, 401, { error: 'Not allowed.' });
    }
    if (!exact) {
      // Worth knowing which dialect Razorpay actually speaks, so this can be
      // pinned later instead of guessed every time.
      console.warn(`Razorpay webhook verified from a reconstructed body (${matched.label}).`);
    }

    let event;
    try {
      event = JSON.parse(matched.text);
    } catch {
      // The signature proves Razorpay sent it, so unparseable JSON is our
      // problem to look at, not something to make them retry for a day.
      console.error('Razorpay webhook body verified but did not parse as JSON.');
      return send(res, 200, { ok: true, ignored: true, reason: 'unparseable' });
    }

    const name = String(event?.event || '');
    const entity = event?.payload?.subscription?.entity || null;
    const razorpaySubscriptionId = String(entity?.id || '');
    const eventId = String(req.headers['x-razorpay-event-id'] || '');
    const client = adminClient();

    const status = EVENT_STATUS[name];
    if (!status || !razorpaySubscriptionId) {
      // Payment-side events, subscription.pending, anything Razorpay adds
      // later. Acknowledged, never retried — a 5xx here would have them
      // redelivering an event we will still not act on tomorrow.
      await writeAudit(client, {
        action: `billing.${name || 'unknown'}`,
        args: {
          event: name,
          razorpay_subscription_id: razorpaySubscriptionId || null,
          event_id: eventId || null,
        },
        result: { ignored: true, reason: status ? 'no_subscription_entity' : 'unhandled_event' },
        eventId,
      });
      return send(res, 200, { ok: true, ignored: true, event: name || null });
    }

    const { data, error } = await client.rpc('subscription_upsert_from_webhook', {
      p_razorpay_subscription_id: razorpaySubscriptionId,
      p_status: status,
      p_current_period_end: toIso(entity?.current_end),
    });
    if (error) throw error;

    const outcome = (Array.isArray(data) ? data[0] : data) || {};
    const row = outcome.subscription || null;

    // subscriptions.user_id is the payer. audit_log.family_id is the ELDER's
    // account id — what the guardian and elder timelines query by — and for the
    // ordinary case, a guardian abroad paying for a parent in Siliguri, those
    // are two different accounts.
    //
    // subscriptions.family_id already holds the beneficiary the purchase named,
    // validated at checkout, so it answers this directly. The walk is the
    // fallback for a row written before that column existed: one household
    // resolves, several cannot be attributed from a webhook at all and are
    // filed with a null family and the candidates in args rather than guessed
    // onto the wrong elder's timeline.
    let family = { familyId: null, parentIds: [], reason: 'unmatched_subscription' };
    if (row?.family_id) {
      family = { familyId: row.family_id, parentIds: [row.family_id], reason: null };
    } else if (row?.user_id) {
      family = await elderFamilyContext(client, row.user_id);
    }

    await writeAudit(client, {
      action: `billing.${name}`,
      args: {
        event: name,
        razorpay_subscription_id: razorpaySubscriptionId,
        razorpay_status: String(entity?.status || ''),
        mapped_status: status,
        current_end: entity?.current_end ?? null,
        event_id: eventId || null,
        payer_id: row?.user_id || null,
        ...(family.reason ? { family_resolution: family.reason, elder_ids: family.parentIds } : {}),
      },
      result: {
        matched: outcome.matched === true,
        ignored: outcome.ignored === true,
        reason: outcome.reason || null,
        status: row?.status || null,
        plan: row?.plan || null,
      },
      eventId,
      familyId: family.familyId,
    });

    if (outcome.matched !== true) {
      // A subscription we have no row for will never grow one: the insert side
      // is /api/billing/subscribe and it runs long before any webhook. Retrying
      // would not help, so this is acknowledged and left in the audit log.
      console.warn('Razorpay webhook for an unknown subscription:', razorpaySubscriptionId);
      return send(res, 200, { ok: true, ignored: true, reason: 'unknown_subscription' });
    }

    return send(res, 200, {
      ok: true,
      event: name,
      status: row?.status || status,
      ignored: outcome.ignored === true,
    });
  } catch (error) {
    // A 5xx is the only way to ask Razorpay to redeliver, and a database blip
    // during subscription.charged is exactly when that matters.
    return sendServerError(res, error, 'Could not record the subscription event.');
  }
};
