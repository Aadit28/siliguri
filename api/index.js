// Single entry point for every /api/* call.
//
// The handlers live in server/ rather than api/ because Vercel turns each file
// under api/ into its own serverless function, and this app has more than the Hobby
// plan's limit of 12. Routing them through one function also means production
// and scripts/dev-api.js dispatch from the same table, so a route cannot work
// locally and 404 in production.
//
// vercel.json rewrites /api/:route* here with the path in ?route=. A bracket
// catch-all filename builds fine but never receives the request under this
// project's static build config, so the rewrite is explicit instead.
const { send, withCors } = require('../server/_lib/auth');

const ROUTES = {
  'auth/signup': () => require('../server/auth/signup'),
  'auth/signin': () => require('../server/auth/signin'),
  'auth/me': () => require('../server/auth/me'),
  'auth/signout': () => require('../server/auth/signout'),
  'auth/otp-request': () => require('../server/auth/otp-request'),
  'auth/otp-verify': () => require('../server/auth/otp-verify'),
  activities: () => require('../server/activities'),
  'activities/enroll': () => require('../server/activities/enroll'),
  'activities/leave': () => require('../server/activities/leave'),
  'activities/my': () => require('../server/activities/my'),
  'assistant/plan': () => require('../server/assistant/plan'),
  'bookings/search': () => require('../server/bookings/search'),
  'bookings/hold': () => require('../server/bookings/hold'),
  'bookings/confirm': () => require('../server/bookings/confirm'),
  'bookings/approve': () => require('../server/bookings/approve'),
  'bookings/cancel': () => require('../server/bookings/cancel'),
  'bookings/mine': () => require('../server/bookings/mine'),
  'callback/request': () => require('../server/callback/request'),
  'community/post': () => require('../server/community/post'),
  'community/reply': () => require('../server/community/reply'),
  'community/like': () => require('../server/community/like'),
  'billing/plans': () => require('../server/billing/plans'),
  'billing/subscribe': () => require('../server/billing/subscribe'),
  'billing/status': () => require('../server/billing/status'),
  // Razorpay posts here. Signature verification needs the raw request bytes,
  // which this dispatcher cannot hand it — see the header of the handler.
  'billing/webhook': () => require('../server/billing/webhook'),
  'admin/announcement': () => require('../server/admin/announcement'),
  'admin/service': () => require('../server/admin/service'),
  'admin/callback': () => require('../server/admin/callback'),
  'admin/helper': () => require('../server/admin/helper'),
  'notify/whatsapp': () => require('../server/notify/whatsapp'),
  'notify/register': () => require('../server/notify/register'),
  'notify/alerts': () => require('../server/notify/alerts'),
  'cron/daily-digest': () => require('../server/cron/daily-digest'),
  'cron/booking-sweep': () => require('../server/cron/booking-sweep'),
  'bookings/vendor-callback': () => require('../server/bookings/vendor-callback'),
  'family/link': () => require('../server/family/link'),
  'family/code': () => require('../server/family/code'),
  'family/sos': () => require('../server/family/sos'),
  'family/reminders': () => require('../server/family/reminders'),
  'family/care-team': () => require('../server/family/care-team'),
  'family/favorites': () => require('../server/family/favorites'),
  'family/analytics': () => require('../server/family/analytics'),
  'consent/get': () => require('../server/consent/get'),
  'consent/set': () => require('../server/consent/set'),
  // Mints a LiveKit join token. Answers 503 rather than throwing when the
  // LiveKit credentials are absent, so an unconfigured project still serves
  // every other route through this dispatcher.
  'voice/token': () => require('../server/voice/token'),
};

module.exports = async function handler(req, res) {
  // req.query.route is the catch-all segments; fall back to the URL for
  // runtimes that do not populate it.
  const segments = req.query?.route;
  const key = Array.isArray(segments)
    ? segments.join('/')
    : String(segments || new URL(req.url || '/', 'http://localhost').pathname.replace(/^\/api\//, ''))
        .replace(/^\/+|\/+$/g, '');

  const load = ROUTES[key];
  if (!load) {
    withCors(res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    return send(res, 404, { error: 'Not found' });
  }

  return load()(req, res);
};

module.exports.ROUTES = ROUTES;
