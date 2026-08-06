// The plan ladder and the one place that answers "what has this family paid
// for" (BUILD_GUIDE B.2). Everything about pricing lives here: the /api/billing
// handlers render this catalog, and the booking and voice gates will read
// entitlementFor() rather than looking at subscription rows themselves.
//
// The tiers are cumulative by construction, not by hand: PLAN_FEATURES
// accumulates each tier's additions onto the one below, so nobody can ship a
// ₹3,999 plan that quietly lost a ₹499 feature.

// What a family gets before they pay anything. Real value, deliberately: an
// elder who cannot set a medicine reminder never gets far enough to subscribe.
const FREE_FEATURES = ['reminders', 'community', 'directory', 'sos'];

// Each tier's ADDITIONS over the tier below it, cheapest first. Order matters.
const TIERS = [
  {
    id: 'care',
    name: 'Care',
    price_paise: 49900,
    adds: ['bookings', 'guardian_portal', 'whatsapp_alerts', 'callback_requests'],
  },
  {
    id: 'care_plus',
    name: 'Care Plus',
    price_paise: 149900,
    adds: ['voice_agent', 'health_timeline', 'priority_callback', 'family_analytics'],
  },
  {
    id: 'care_total',
    name: 'Care Total',
    price_paise: 399900,
    adds: ['dedicated_helper', 'hospital_escort', 'unlimited_voice_minutes', 'vendor_concierge'],
  },
];

const FREE_PLAN = 'free';
const BILLING_PERIOD = 'monthly';
const CURRENCY = 'INR';

const PLAN_FEATURES = { [FREE_PLAN]: [...FREE_FEATURES] };
const PLANS = [];
for (const tier of TIERS) {
  const below = PLANS.length ? PLANS[PLANS.length - 1].features : FREE_FEATURES;
  const features = [...below, ...tier.adds];
  PLAN_FEATURES[tier.id] = features;
  PLANS.push({
    id: tier.id,
    name: tier.name,
    price_paise: tier.price_paise,
    currency: CURRENCY,
    period: BILLING_PERIOD,
    features,
  });
}

const PLAN_IDS = PLANS.map((plan) => plan.id);
// Rank, not price: what "higher plan" means must not change if a tier is ever
// discounted below the one under it.
const PLAN_RANK = { [FREE_PLAN]: 0 };
PLAN_IDS.forEach((id, index) => {
  PLAN_RANK[id] = index + 1;
});

function isPlanId(value) {
  return PLAN_IDS.includes(String(value || ''));
}

function planRank(plan) {
  return PLAN_RANK[String(plan || '')] ?? 0;
}

function featuresFor(plan) {
  return PLAN_FEATURES[String(plan || '')] || PLAN_FEATURES[FREE_PLAN];
}

// The gate the rest of the API will call: allowsFeature(await entitlementFor(
// client, userId), 'voice_agent'). Kept next to the ladder so adding a tier is
// one edit, not a search for every `plan === 'care_plus'` in the codebase.
function allowsFeature(plan, feature) {
  return featuresFor(plan).includes(String(feature || ''));
}

// Resolves through the entitlement_for rpc (migration 19) rather than reading
// subscriptions here, because the "a guardian's card covers the parent" walk is
// a family_links join that the API's service-role client would have to repeat
// on every gate.
//
// Throws on a database error instead of falling back to 'free'. Both directions
// are wrong when the database is unreachable — silently denying a paying family
// is a support call, silently granting is revenue — so the caller gets a 500
// and the family gets "please try again", which is at least honest.
async function entitlementFor(client, userId) {
  const id = String(userId || '').trim();
  if (!id) return FREE_PLAN;

  const { data, error } = await client.rpc('entitlement_for', { p_user_id: id });
  if (error) throw error;

  // A Postgres function may come back as a scalar or a one-row set.
  const plan = String((Array.isArray(data) ? data[0] : data) || '').trim();
  return plan === FREE_PLAN || isPlanId(plan) ? plan : FREE_PLAN;
}

// The wire shape of a subscription row, shared by /api/billing/subscribe and
// /api/billing/status so the app never sees two spellings of the same record.
function toSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    plan: row.plan,
    status: row.status,
    razorpaySubscriptionId: row.razorpay_subscription_id || null,
    currentPeriodEnd: row.current_period_end || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

module.exports = {
  BILLING_PERIOD,
  CURRENCY,
  FREE_PLAN,
  PLANS,
  PLAN_FEATURES,
  PLAN_IDS,
  allowsFeature,
  entitlementFor,
  featuresFor,
  isPlanId,
  planRank,
  toSubscription,
};
