const {
  authenticate,
  badRequest,
  readBody,
  send,
  sendServerError,
  withCors,
} = require('../_lib/auth');
const { isPlanId, planRank, toSubscription } = require('../_lib/entitlements');

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

const SUBSCRIPTION_COLUMNS =
  'id,user_id,plan,status,razorpay_subscription_id,razorpay_customer_id,current_period_end,created_at,updated_at';

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
    throw httpError(502, 'Could not reach the payment provider. Please try again.');
  }
  return data;
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

    const { data: existingRows, error: existingError } = await auth.supabase
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (existingError) throw existingError;
    const existing = existingRows || [];

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

    // The same customer across every subscription this account ever holds, so
    // Razorpay's dashboard shows one family rather than one row per attempt.
    let customerId = existing.find((row) => row.razorpay_customer_id)?.razorpay_customer_id || null;

    // An abandoned checkout is resumable: hand back the same short_url instead
    // of minting a second subscription the family will never see.
    const unpaid = existing.find((row) => row.status === UNPAID_STATUS && row.plan === plan);
    if (unpaid) {
      try {
        const remote = await fetchSubscription(unpaid.razorpay_subscription_id);
        if (remote?.status === UNPAID_STATUS && remote?.short_url) {
          return send(res, 200, {
            subscriptionId: unpaid.id,
            razorpaySubscriptionId: unpaid.razorpay_subscription_id,
            shortUrl: remote.short_url,
            resumed: true,
          });
        }
      } catch (error) {
        // Only a convenience. If Razorpay cannot tell us about the old attempt,
        // making a new one is still the right answer for the family.
        console.warn('Could not resume subscription', unpaid.razorpay_subscription_id, error?.message || error);
      }
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
        // is without a database round trip.
        notes: { saathi_user_id: auth.user.id, saathi_plan: plan },
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
      })
      .select(SUBSCRIPTION_COLUMNS)
      .maybeSingle();

    if (insertError || !inserted) {
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

    await writeAudit(auth.supabase, {
      actor: auth.user.id,
      action: 'billing.subscribe',
      args: { plan, razorpay_plan_id: externalPlanId, razorpay_customer_id: customerId },
      result: {
        subscription_id: inserted.id,
        razorpay_subscription_id: created.id,
        status: inserted.status,
        plan_rank: planRank(plan),
      },
      familyId: auth.user.id,
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
