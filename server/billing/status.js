const { authenticate, send, sendServerError, withCors } = require('../_lib/auth');
const { entitlementFor, featuresFor, toSubscription } = require('../_lib/entitlements');

// What the caller is entitled to, and the subscription they personally hold.
//
// These are two different questions and the app needs both. An elder in
// Siliguri whose daughter in London pays gets entitlement 'care_plus' and
// subscription null: the features must unlock, and the billing screen must not
// offer her a "cancel" button for a subscription that is not hers. The daughter
// gets the same entitlement with the row attached.

const SUBSCRIPTION_COLUMNS =
  'id,plan,status,razorpay_subscription_id,current_period_end,created_at,updated_at';

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    // The entitlement walks family_links inside the rpc; the row read below
    // never does. Run them together — neither depends on the other, and the
    // billing screen shows both at once.
    const [entitlement, own] = await Promise.all([
      entitlementFor(auth.supabase, auth.user.id),
      auth.supabase
        .from('subscriptions')
        .select(SUBSCRIPTION_COLUMNS)
        .eq('user_id', auth.user.id)
        // Newest first: an upgrade leaves the superseded row behind and the
        // screen should describe the one the family just bought.
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (own.error) throw own.error;

    return send(res, 200, {
      entitlement,
      features: featuresFor(entitlement),
      // Null while a guardian's card is what unlocked the entitlement above.
      // No derived "someone else pays for you" flag: deciding it here would
      // mean restating entitlement_for's grace rules in JavaScript, and the
      // point of the rpc is that they exist in exactly one place. The screen
      // has everything it needs — a cancel button belongs to a subscription
      // whose status is active or authenticated, and nothing else.
      subscription: toSubscription(own.data),
    });
  } catch (error) {
    return sendServerError(res, error, 'Could not load your plan. Please try again.');
  }
};
