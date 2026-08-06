import { backendRequest } from './backend';

// Typed wrappers over the /api/billing/* endpoints. Same shape as
// src/lib/bookings.ts: every call throws with the server's { error } sentence
// and the HTTP status backendRequest attaches, and screens turn that into
// elder-readable copy through friendlyBillingError.
//
// Nothing about a card, a UPI handle or a mandate passes through here. The only
// thing the app ever holds is Razorpay's hosted checkout link.

export const FREE_PLAN = 'free';

// Mirrors the TIERS ladder in server/_lib/entitlements.js, cheapest first.
export const PLAN_IDS = ['care', 'care_plus', 'care_total'] as const;

export type PlanId = (typeof PLAN_IDS)[number];
/** What the caller is entitled to: a paid tier, or the free baseline. */
export type EntitlementId = PlanId | typeof FREE_PLAN;

export type Plan = {
  id: PlanId;
  name: string;
  price_paise: number;
  currency: string;
  period: string;
  // Cumulative: every tier repeats the one below it (see planAdditions).
  features: string[];
};

export type FreeTier = {
  id: string;
  name: string;
  price_paise: number;
  features: string[];
};

export type PlansCatalog = {
  currency: string;
  period: string;
  free: FreeTier;
  plans: Plan[];
};

// Razorpay's own vocabulary, passed through untouched by the webhook.
export type SubscriptionStatus =
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'cancelled'
  | 'completed'
  | 'expired';

export type Subscription = {
  id: string;
  plan: PlanId;
  status: SubscriptionStatus;
  razorpaySubscriptionId: string | null;
  currentPeriodEnd: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BillingStatus = {
  entitlement: EntitlementId;
  features: string[];
  // Null when a guardian's card is what unlocked the entitlement above: the
  // features are on, but the subscription is not this account's to cancel.
  subscription: Subscription | null;
};

export type SubscribeResult = {
  subscriptionId: string;
  razorpaySubscriptionId: string;
  shortUrl: string | null;
  // True when the server handed back an abandoned checkout instead of minting
  // a second subscription.
  resumed?: boolean;
};

// Mirrors LIVE_STATUSES in server/billing/subscribe.js: money is either being
// collected or a mandate is in place, and a second checkout would double-charge.
const LIVE_STATUSES: SubscriptionStatus[] = ['authenticated', 'active'];

export function isLiveSubscription(subscription: Subscription | null | undefined) {
  return Boolean(subscription && LIVE_STATUSES.includes(subscription.status));
}

/** Created but never paid for — the family opened the checkout and closed it. */
export function isUnpaidSubscription(subscription: Subscription | null | undefined) {
  return subscription?.status === 'created';
}

export function isPlanId(value: string | null | undefined): value is PlanId {
  return PLAN_IDS.includes(value as PlanId);
}

// Rank, not price: "higher plan" must not change meaning if a tier is ever
// discounted below the one under it. Same ordering as the server's PLAN_RANK.
export function planRank(plan: string | null | undefined) {
  const index = PLAN_IDS.indexOf(String(plan ?? '') as PlanId);
  return index === -1 ? 0 : index + 1;
}

/**
 * What this tier adds over the one below it. The server sends cumulative
 * feature lists, so Care Total arrives with sixteen entries — printing all of
 * them turns three cards into a wall an elder scrolls past. The diff is what
 * the card shows, under an "everything in <lower tier>" line.
 */
export function planAdditions(plans: Plan[], index: number, free: FreeTier | null): string[] {
  const below = index > 0 ? plans[index - 1]?.features : free?.features;
  const seen = new Set(below ?? []);
  return (plans[index]?.features ?? []).filter((feature) => !seen.has(feature));
}

// ----- Money -----

// Indian digit grouping (1,499 / 3,999 / 1,00,000) written out rather than
// taken from Intl: Hermes ships without full ICU on some builds, and a price is
// the one string on this screen that must never render as "NaN" or "₹3999".
function groupIndianDigits(value: number) {
  const digits = String(Math.abs(Math.trunc(value)));
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** Whole rupees, grouped. Paise are never shown to this audience. */
export function rupeesFromPaise(paise: number | null | undefined) {
  if (paise === null || paise === undefined || !Number.isFinite(paise)) return null;
  return `₹${groupIndianDigits(Math.round(paise / 100))}`;
}

// ----- Endpoints -----

/**
 * The price list. Deliberately unauthenticated on the server too: a guardian
 * comparing options should not have to make an account to see ₹499.
 */
export async function fetchPlans(): Promise<PlansCatalog> {
  const response = await backendRequest<PlansCatalog>('/api/billing/plans');
  if (!Array.isArray(response?.plans)) throw new Error('The plans could not be read.');
  return response;
}

export async function fetchBillingStatus(token: string): Promise<BillingStatus> {
  const response = await backendRequest<BillingStatus>('/api/billing/status', { token });
  return {
    entitlement: isPlanId(response?.entitlement) ? response.entitlement : FREE_PLAN,
    features: Array.isArray(response?.features) ? response.features : [],
    subscription: response?.subscription ?? null,
  };
}

/**
 * Opens a checkout. `elderId` names who the plan covers: entitlement_for grants
 * strictly on subscriptions.family_id, so a guardian who does not name the
 * parent buys a plan that entitles only themselves. Omitted means "for me",
 * which is what the server assumes too.
 */
export async function subscribeToPlan(
  token: string,
  plan: PlanId,
  elderId?: string | null,
): Promise<SubscribeResult> {
  return backendRequest<SubscribeResult>('/api/billing/subscribe', {
    method: 'POST',
    token,
    body: { plan, ...(elderId ? { elderId } : {}) },
  });
}

// ----- Error copy -----

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The 503 the server sends when Razorpay credentials are not set. It is not a
 * failure the reader can retry out of, so the screen shows "coming soon"
 * instead of an error — the plans themselves are still worth reading.
 */
export function isBillingNotConfigured(e: unknown) {
  const error = e as Error & { status?: number };
  return error?.status === 503 && /billing_not_configured/i.test(error?.message ?? '');
}

/** 409 from subscribe: this account already has a plan collecting money. */
export function isAlreadySubscribed(e: unknown) {
  return (e as { status?: number } | null)?.status === 409;
}

export type BillingPhase = 'plans' | 'status' | 'subscribe';

export function friendlyBillingError(e: unknown, t: Translate, phase: BillingPhase): string {
  const error = e as Error & { status?: number; code?: string };
  const status = error?.status;
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = error?.message ?? '';

  if (status === undefined) return t('plans.errorNetwork');
  if (status === 401) return t('plans.errorSignIn');
  if (status === 403) return t('plans.errorNotAllowed');
  if (status === 429) return t('plans.errorTooMany');
  // A checkout link is already open. Not the same as owning a plan: nothing is
  // being charged yet and the next step is to finish or wait, not to cancel.
  if (code === 'checkout_in_progress') return t('plans.errorCheckoutOpen');
  if (status === 409) {
    // Two different 409s under one code, and they need different next steps:
    // the same plan means "you already have this", a different one means
    // "cancel first". The English sentence is matched, never shown.
    return /already active/i.test(message)
      ? t('plans.errorAlreadyThisPlan')
      : t('plans.errorAlreadySubscribed');
  }
  // 502 is Razorpay refusing us, not the family. Same sentence as a 500: try
  // again, and nothing was charged.
  if (status >= 500) {
    return phase === 'subscribe' ? t('plans.errorProvider') : t('plans.errorGeneric');
  }
  // Everything left is a badRequest sentence written in English ("elderId is
  // invalid."), and this screen is read in Hindi and Bengali too.
  return t('plans.errorGeneric');
}
