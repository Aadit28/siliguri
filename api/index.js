// Single entry point for every /api/* call.
//
// The handlers live in server/ rather than api/ because Vercel turns each file
// under api/ into its own serverless function, and 21 of them exceeds the Hobby
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
  'assistant/plan': () => require('../server/assistant/plan'),
  'callback/request': () => require('../server/callback/request'),
  'community/post': () => require('../server/community/post'),
  'community/reply': () => require('../server/community/reply'),
  'community/like': () => require('../server/community/like'),
  'admin/announcement': () => require('../server/admin/announcement'),
  'admin/service': () => require('../server/admin/service'),
  'admin/callback': () => require('../server/admin/callback'),
  'admin/helper': () => require('../server/admin/helper'),
  'notify/whatsapp': () => require('../server/notify/whatsapp'),
  'notify/register': () => require('../server/notify/register'),
  'cron/daily-digest': () => require('../server/cron/daily-digest'),
  'family/link': () => require('../server/family/link'),
  'family/sos': () => require('../server/family/sos'),
  'family/reminders': () => require('../server/family/reminders'),
  'family/care-team': () => require('../server/family/care-team'),
  'family/favorites': () => require('../server/family/favorites'),
  'family/analytics': () => require('../server/family/analytics'),
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
