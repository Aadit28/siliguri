const {
  authenticate,
  badRequest,
  readBody,
  requireFamilyLink,
  send,
  sendServerError,
  withCors,
} = require('../_lib/auth');
const {
  elderFamilyContext,
  isPlanId,
  planRank,
  toSubscription,
} = require('../_lib/entitlements');

// Starts a Razorpay subscription and hands back the hosted checkout link.
//
// No SDK: the razorpay npm package pulls a request stack this project does not
// otherwise carry, for what is three JSON calls behind Basic auth. Plain fetch,
// same shape as the Graph API calls in _lib/vendor-notify.js.
//
// Nothing about a card, a UPI handle or a mandate touches this server. The app
// opens short_url, Razorpay collects the instrument on their page, and the only
// thing that comes back to us is a webhook saying the subscription moved
// (BUILD_GUIDE B.2: "never store payment instrument data").

const RAZORPAY_API = 'https://api.razorpay.com/v1';
const RAZORPAY_TIMEOUT_MS = 15_000;

// Razorpay requires a cycle count up front; there is no "until cancelled".
// 120 monthly cycles is ten years, which outlives the decision either way.
const TOTAL_CYCLES = 120;

// A subscription already collecting money. A second one for the same family is
// a double charge, so these block a new checkout rather than stacking on it.
const LIVE_STATUSES = ['authenticated', 'active'];
// Created but never paid for: the family opened the checkout page and closed
// it. Reusing that subscription is what stops a hesitant guardian from leaving
// five abandoned subscriptions behind them.
const UNPAID_STATUS = 'created';
// Razorpay statuses that mean a mandate exists and money can move on it. Wider
// than LIVE_STATUSES, which mirrors only what our webhook has already recorded:
// this list has to hold for a row whose webhook has not landed yet, and by then
// 'pending' (their charge-retry state) and 'halted' are just as payable as
// 'active'.
const REMOTE_PAYING_STATUSES = ['authenticated', 'active', 'pending', 'paused', 'halted'];

// Named columns would 500 the whole endpoint on whichever Supabase project is a
// migration behind (PostgREST 42703), and family_id is exactly that kind of
// recent column. Everything the client sees is projected by hand below or by
// toSubscription, so the wider select leaks nothing.
const SUBSCRIPTION_COLUMNS = '*';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Who the plan is bought FOR. subscriptions.family_id is the beneficiary elder
// and a database trigger defaults it to the payer, so a row written before that
// column existed reads as covering the payer alone — the same fail-closed
// answer the trigger gives.
function beneficiaryOf(row) {
  return row.family_id || row.user_id;
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = '1 hour';

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicError = message;
  return error;
}

function credentials() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || '').trim(),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || '').trim(),
  };
}

// One env var per tier, named after the plan id: RAZORPAY_PLAN_CARE,
// RAZORPAY_PLAN_CARE_PLUS, RAZORPAY_PLAN_CARE_TOTAL. The amount lives in the
// Razorpay plan, not here — our price_paise is what we show, theirs is what
// they charge, and only theirs can move money.
function razorpayPlanId(plan) {
  return String(process.env[`RAZORPAY_PLAN_${plan.toUpperCase()}`] || '').trim();
}

async function razorpayCall(path, { method = 'GET', body } = {}) {
  const { keyId, keySecret } = credentials();
  const response = await fetch(`${RAZORPAY_API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(RAZORPAY_TIMEOUT_MS),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Razorpay's descriptions name our own configuration ("plan_id is invalid")
    // and sometimes the customer's instrument. Neither belongs in a response
    // body, so the detail goes to the log and the caller gets one sentence.
    console.error(
      `Razorpay ${method} ${path} failed (${response.status}):`,
      data?.error?.description || data?.error?.code || 'no description',
    );
    const error = httpError(502, 'Could not reach the payment provider. Please try again.');
    // Callers deciding whether a second checkout link may be minted need to
    // tell "Razorpay answered and refused" (4xx: unknown id, not cancellable)
    // from "Razorpay did not answer" (5xx), which proves nothing at all.
    error.razorpayStatus = response.status;
    throw error;
  }
  return data;
}

// Razorpay saying "this id is not something I will act on": either they have
// never heard of it or it is already in a state they refuse to move. Both mean
// nothing behind that id can take money.
//
// Deliberately only 400 and 404. A 401/403 is our keys, a 429 is their rate
// limiter and a 5xx is their outage — none of those is an answer about the
// subscription, and treating them as "dead link" is how a second payable
// checkout gets minted on top of a live one.
function razorpayDisowned(error) {
  return error?.razorpayStatus === 400 || error?.razorpayStatus === 404;
}

// Razorpay needs a customer to attach the mandate to. fail_existing: 0 turns
// "this contact already exists" from an error into the existing customer, which
// is what we want on every retry and on every second plan a family buys.
//
// user_accounts has no email column and phone_number is optional (a
// username/password account may have neither), so both fields are sent only
// when we actually have them; Razorpay's hosted page collects what is missing.
async function ensureCustomer(account) {
  const payload = {
    name: String(account.full_name || account.username || 'Saathi member').slice(0, 50),
    fail_existing: 0,
  };
  if (account.phone_number) payload.contact = String(account.phone_number);
  const customer = await razorpayCall('/customers', { method: 'POST', body: payload });
  return customer?.id || null;
}

async function fetchSubscription(razorpaySubscriptionId) {
  return razorpayCall(`/subscriptions/${encodeURIComponent(razorpaySubscriptionId)}`);
}

// What Razorpay itself says about one of our unpaid rows. Our mirror is only as
// fresh as the last webhook, so a checkout the family completed a minute ago
// still reads 'created' here — and that is exactly the row a second checkout
// must not be stacked on top of.
//
// A disowned id is an answer, so the attempt counts as nothing payable and a
// stale or hand-made row cannot lock a family out of subscribing for ever.
// Anything else is not an answer and propagates: it may not be rounded down to
// "safe to mint another one".
async function probeCheckout(row) {
  try {
    return { row, remote: await fetchSubscription(row.razorpay_subscription_id) };
  } catch (error) {
    if (!razorpayDisowned(error)) throw error;
    console.warn('Razorpay does not recognise subscription', row.razorpay_subscription_id);
    return { row, remote: null };
  }
}

// Kills an abandoned checkout link so it can never be paid. Only ever called
// for a subscription Razorpay has just confirmed is still 'created': cancelling
// an authenticated or active one would tear down a mandate a family is paying
// on. Returns false when Razorpay did not answer, because the caller must not
// mint a second link while an old one may still be payable.
async function retireCheckout(client, row) {
  try {
    await razorpayCall(`/subscriptions/${encodeURIComponent(row.razorpay_subscription_id)}/cancel`, {
      method: 'POST',
      // Immediate, not at cycle end: a 'created' subscription has no cycle to
      // wait for and Razorpay rejects cancel_at_cycle_end on one.
      body: { cancel_at_cycle_end: 0 },
    });
  } catch (error) {
    if (!razorpayDisowned(error)) {
      console.warn(
        'Could not cancel abandoned checkout',
        row.razorpay_subscription_id,
        error?.message || error,
      );
      return false;
    }
    // Already cancelled, already expired, or an id they never had. The link is
    // dead, which is all this call wanted — and the local row still has to be
    // moved off 'created', or it stays a permanent phantom checkout that blocks
    // every future attempt once one-open-checkout-per-user is enforced.
    console.warn('Abandoned checkout was already gone at Razorpay:', row.razorpay_subscription_id);
  }

  // Mirrors the cancellation we just made Razorpay perform, so the wall above
  // sees it on the next attempt instead of re-cancelling until the webhook
  // arrives. subscription.cancelled remains the authority and writes the same
  // value; the status guard keeps a webhook that overtook us from being undone.
  const { error } = await client
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', UNPAID_STATUS);
  if (error) {
    console.warn('Cancelled at Razorpay but not locally:', row.id, error?.message || error);
  }
  return true;
}

async function writeAudit(client, args) {
  try {
    const { error } = await client.rpc('audit_write', {
      p_actor: args.actor,
      p_action: args.action,
      p_args: args.args || {},
      p_result: args.result || {},
      // audit_write types this column as uuid; the Razorpay id is not one, so it
      // travels in args instead of being coerced into a column that would throw.
      p_idempotency_key: null,
      p_family_id: args.familyId || null,
    });
    if (error) throw error;
  } catch (error) {
    // The subscription exists either way. Losing the audit line is worth a log,
    // never a failed checkout.
    console.warn('audit_write failed for billing.subscribe:', error?.message || error);
  }
}

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const plan = String(body.plan || '').trim();
    if (!isPlanId(plan)) throw badRequest('Choose one of the Saathi plans.');

    // Who the plan covers. A guardian abroad buying care for a parent in
    // Siliguri has to say which parent: entitlement_for now grants strictly on
    // subscriptions.family_id, so an unnamed beneficiary means the payer bought
    // it for themselves. Absent, not guessed — one card covering every
    // household a guardian is linked to is the leak this column closed.
    const requestedElderId = String(body.elderId === undefined || body.elderId === null ? '' : body.elderId).trim();
    if (requestedElderId && !UUID_RE.test(requestedElderId)) throw badRequest('elderId is invalid.');

    // Checked after the plan so a misconfigured deploy cannot be probed for
    // which tiers exist, and before anything is written so a half-configured
    // environment never leaves a row pointing at a subscription that does not
    // exist. 503 rather than 500: nothing is broken, something is unset.
    const { keyId, keySecret } = credentials();
    const externalPlanId = razorpayPlanId(plan);
    if (!keyId || !keySecret || !externalPlanId) {
      console.error(
        `Billing not configured: missing ${[
          !keyId && 'RAZORPAY_KEY_ID',
          !keySecret && 'RAZORPAY_KEY_SECRET',
          !externalPlanId && `RAZORPAY_PLAN_${plan.toUpperCase()}`,
        ].filter(Boolean).join(', ')}.`,
      );
      return send(res, 503, { error: 'billing_not_configured' });
    }

    // Charged after validation, like the booking limiter: a caller rejected for
    // a typo should not spend the budget that protects the Razorpay account.
    const { data: allowed, error: rateError } = await auth.supabase.rpc('check_rate_limit', {
      p_key: `billing:subscribe:${auth.user.id}`,
      p_max: RATE_LIMIT_MAX,
      p_window: RATE_LIMIT_WINDOW,
    });
    if (rateError) throw rateError;
    if ((Array.isArray(allowed) ? allowed[0] : allowed) !== true) {
      throw httpError(429, 'Too many attempts just now. Please wait a few minutes.');
    }

    // Guardianship is proved once, here, at purchase time: revoking a link
    // later must not strip a cycle the family already paid for, which is why
    // the beneficiary is stamped onto the row instead of re-derived on read.
    // requireFamilyLink also accepts the elder naming themselves.
    let beneficiaryId = auth.user.id;
    if (requestedElderId && requestedElderId !== auth.user.id) {
      const linkError = await requireFamilyLink(auth, requestedElderId);
      if (linkError) throw httpError(403, linkError.error || 'Not allowed.');
      beneficiaryId = requestedElderId;
    }

    // The payer's own rows, all households: the walls below need the ones for
    // THIS beneficiary, and razorpay_customer_id is reused across every one of
    // them. Filtering by family_id in JS rather than in the query keeps a
    // project that lags on the column from 500ing the endpoint.
    const { data: existingRows, error: existingError } = await auth.supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (existingError) throw existingError;
    const allRows = existingRows || [];
    // One plan per household, not per payer: a guardian may hold a plan for
    // each parent they look after, and those are separate subscriptions that
    // must not block one another.
    const existing = allRows.filter((row) => beneficiaryOf(row) === beneficiaryId);

    // Razorpay has a separate API for swapping the plan under a live
    // subscription; until that is built, an upgrade is cancel-then-subscribe
    // and this is the wall that keeps a family from paying for two tiers at
    // once by tapping the wrong card twice.
    const live = existing.find((row) => LIVE_STATUSES.includes(row.status));
    if (live) {
      return send(res, 409, {
        error: live.plan === plan
          ? 'This plan is already active on your account.'
          : 'You already have an active plan. Cancel it before switching.',
        code: 'already_subscribed',
        subscription: toSubscription(live),
      });
    }

    // The same customer across every subscription this account ever holds —
    // every household included, since the payer is one person to Razorpay — so
    // their dashboard shows one family rather than one row per attempt.
    let customerId = allRows.find((row) => row.razorpay_customer_id)?.razorpay_customer_id || null;

    // EVERY 'created' row matters here, not just the ones for the plan being
    // bought. A 'created' subscription still carries a live hosted-checkout
    // link, and the wall above cannot see it because nobody has authenticated a
    // mandate on it yet: leave one payable while minting a second link for
    // another plan and a family that completes both is debited twice a month,
    // for ever. So each unpaid attempt is checked against Razorpay before this
    // request may continue, and only one payable link survives the check.
    // Probed together: they are independent round trips, and an account from
    // before this rule can carry several.
    const probes = await Promise.all(
      existing
        .filter((row) => row.status === UNPAID_STATUS && row.razorpay_subscription_id)
        .map(probeCheckout),
    );

    // Razorpay's view outranks our mirror: a mandate authenticated a minute ago
    // is money in motion there while the row here still says 'created'.
    const payingNow = probes.find(
      (probe) => REMOTE_PAYING_STATUSES.includes(String(probe.remote?.status || '')),
    );
    if (payingNow) {
      return send(res, 409, {
        error: payingNow.row.plan === plan
          ? 'This plan is already active on your account.'
          : 'You already have an active plan. Cancel it before switching.',
        code: 'already_subscribed',
        // The stored status is stale by definition on this branch; showing the
        // one Razorpay just reported keeps the app from rendering "created" for
        // a subscription that is charging.
        subscription: toSubscription({ ...payingNow.row, status: payingNow.remote.status }),
      });
    }

    // An abandoned checkout for the plan actually being asked for is resumable:
    // hand back the same short_url instead of minting a second subscription the
    // family will never see.
    const resumable = probes.find((probe) => probe.row.plan === plan
      && probe.remote?.status === UNPAID_STATUS
      && probe.remote?.short_url) || null;

    // Every other still-payable attempt is retired first, so exactly one
    // checkout link is alive whichever branch this request takes.
    const retired = await Promise.all(
      probes
        .filter((probe) => probe !== resumable && probe.remote?.status === UNPAID_STATUS)
        .map((probe) => retireCheckout(auth.supabase, probe.row)),
    );
    if (retired.includes(false)) {
      // Razorpay never confirmed the cancellation, so an old link may still be
      // payable. Refusing costs the family a retry; continuing costs them a
      // second monthly debit.
      throw httpError(502, 'Could not reach the payment provider. Please try again.');
    }

    if (resumable) {
      return send(res, 200, {
        subscriptionId: resumable.row.id,
        razorpaySubscriptionId: resumable.row.razorpay_subscription_id,
        shortUrl: resumable.remote.short_url,
        resumed: true,
      });
    }

    if (!customerId) {
      // authenticate() does not select phone_number, and Razorpay wants a
      // contact to send the mandate notification to.
      const { data: account, error: accountError } = await auth.supabase
        .from('user_accounts')
        .select('id,full_name,username,phone_number')
        .eq('id', auth.user.id)
        .maybeSingle();
      if (accountError) throw accountError;
      customerId = await ensureCustomer(account || auth.user);
    }

    const created = await razorpayCall('/subscriptions', {
      method: 'POST',
      body: {
        plan_id: externalPlanId,
        customer_id: customerId || undefined,
        total_count: TOTAL_CYCLES,
        quantity: 1,
        // Razorpay sends the mandate and receipt messages; we do not duplicate
        // them over WhatsApp and make a family think they paid twice.
        customer_notify: 1,
        // Reconciliation handles: the webhook correlates on the subscription id,
        // but a human staring at the Razorpay dashboard needs to know whose it
        // is without a database round trip — payer and beneficiary both, since
        // they are usually two different people.
        notes: {
          saathi_user_id: auth.user.id,
          saathi_family_id: beneficiaryId,
          saathi_plan: plan,
        },
      },
    });

    if (!created?.id) throw new Error('Razorpay returned a subscription with no id.');

    const { data: inserted, error: insertError } = await auth.supabase
      .from('subscriptions')
      .insert({
        user_id: auth.user.id,
        plan,
        // Always 'created' here: an unauthenticated subscription cannot charge,
        // and only the webhook is allowed to say otherwise.
        status: UNPAID_STATUS,
        razorpay_subscription_id: created.id,
        razorpay_customer_id: customerId,
        // Named only when the payer is buying for someone else. A
        // self-subscription lets the column's default trigger fill in the
        // payer, so the ordinary path never mentions a column a project one
        // migration behind does not have yet.
        ...(beneficiaryId === auth.user.id ? {} : { family_id: beneficiaryId }),
      })
      .select(SUBSCRIPTION_COLUMNS)
      .maybeSingle();

    if (insertError || !inserted) {
      // 23505 is the one-open-checkout-per-user index doing its job: a
      // concurrent POST (a double tap, two devices) already owns this account's
      // only payable link. Two reads of "no live row" racing each other is the
      // hole the probe above cannot close on its own, so the loser hands back
      // the winner's link rather than a second one.
      if (insertError?.code === '23505') {
        console.error('Orphaned Razorpay subscription (lost a concurrent checkout race):', created.id);
        const { data: openRows } = await auth.supabase
          .from('subscriptions')
          .select(SUBSCRIPTION_COLUMNS)
          .eq('user_id', auth.user.id)
          .eq('status', UNPAID_STATUS)
          .order('created_at', { ascending: false })
          .limit(5);
        const winner = (openRows || []).find((row) => beneficiaryOf(row) === beneficiaryId) || null;
        if (winner?.plan === plan && winner.razorpay_subscription_id) {
          const { remote } = await probeCheckout(winner);
          if (remote?.status === UNPAID_STATUS && remote?.short_url) {
            return send(res, 200, {
              subscriptionId: winner.id,
              razorpaySubscriptionId: winner.razorpay_subscription_id,
              shortUrl: remote.short_url,
              resumed: true,
            });
          }
        }
        // The winner is for a different plan, or its link has already gone:
        // sending either would open a checkout the family did not ask for.
        return send(res, 409, {
          error: 'A checkout is already open on your account. Finish it, or try again in a minute.',
          code: 'checkout_in_progress',
        });
      }

      // The Razorpay subscription now exists and we have no row for it. It is
      // in 'created', so it cannot take money until someone completes the
      // hosted checkout — which they cannot reach, because we are about to
      // return an error instead of the link. Loud log with the id so it can be
      // reconciled or cancelled by hand; not auto-cancelled, because an API
      // call in an error path is one more thing that can fail here.
      console.error(
        'Orphaned Razorpay subscription (insert failed):',
        created.id,
        insertError?.message || 'no row returned',
      );
      throw insertError || new Error('Subscription insert returned no row.');
    }

    // audit_log.family_id is the ELDER's account id, not the payer's: a
    // guardian's card buys care for a parent and the timeline that shows it is
    // the parent's. The row's own beneficiary answers that exactly, so the
    // audit line and the entitlement can never disagree about which household
    // this payment belongs to. The walk below is only for a project that lags
    // on the family_id column, where several linked households cannot be told
    // apart and are recorded rather than guessed. The payer stays in actor and
    // args either way.
    const family = inserted.family_id
      ? { familyId: inserted.family_id, parentIds: [inserted.family_id], reason: null }
      : await elderFamilyContext(auth.supabase, auth.user.id);
    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'billing.subscribe',
      args: {
        plan,
        razorpay_plan_id: externalPlanId,
        razorpay_customer_id: customerId,
        payer_id: auth.user.id,
        beneficiary_id: beneficiaryId,
        ...(family.reason ? { family_resolution: family.reason, elder_ids: family.parentIds } : {}),
      },
      result: {
        subscription_id: inserted.id,
        razorpay_subscription_id: created.id,
        status: inserted.status,
        plan_rank: planRank(plan),
      },
      familyId: family.familyId,
    });

    // short_url is Razorpay's hosted checkout. The app opens it in a browser or
    // an in-app tab; there is no client-side key and no order to sign.
    return send(res, 200, {
      subscriptionId: inserted.id,
      razorpaySubscriptionId: created.id,
      shortUrl: created.short_url || null,
    });
  } catch (error) {
    return sendServerError(res, error, 'Could not start your subscription. Please try again.');
  }
};
