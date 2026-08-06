const { send, sendServerError, withCors } = require('../_lib/auth');
const { BILLING_PERIOD, CURRENCY, FREE_PLAN, PLANS, PLAN_FEATURES } = require('../_lib/entitlements');

// The price list. Unauthenticated on purpose: the pricing screen is the last
// thing a guardian reads before deciding to sign up, and making them create an
// account to see ₹499 loses the ones who were only comparing.
//
// No database read. The ladder is code (server/_lib/entitlements.js), so what
// this returns and what /api/billing/subscribe will actually charge for cannot
// drift apart between a deploy and a migration.
module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });

  try {
    return send(res, 200, {
      currency: CURRENCY,
      period: BILLING_PERIOD,
      // The free tier is listed as the baseline rather than as a purchasable
      // plan: it has no id to subscribe to, and leaving it out would make the
      // ₹499 features look like the whole of what the app does.
      free: { id: FREE_PLAN, name: 'Free', price_paise: 0, features: PLAN_FEATURES[FREE_PLAN] },
      plans: PLANS,
    });
  } catch (error) {
    return sendServerError(res, error, 'Could not load the plans. Please try again.');
  }
};
