const { authenticate, makeRateLimiter, send, sendServerError, withCors } = require('../_lib/auth');
const { sendPushToUsers, guardianIdsForParent } = require('../_lib/push');

// The parent pressed the emergency button. The dial to the emergency line
// happens on the device and never waits for this; this call just makes sure
// the family knows too. Always answers 200 with a count — a failed alert must
// not add any friction to an emergency flow.
const allowByUser = makeRateLimiter({ max: 3, windowMs: 5 * 60 * 1000 });

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    // A stuck or mashed button should not push guardians thirty times.
    if (!allowByUser(auth.user.id)) return send(res, 200, { alerted: 0 });

    const guardianIds = await guardianIdsForParent(auth.supabase, auth.user.id);
    if (!guardianIds.length) return send(res, 200, { alerted: 0 });

    const name = auth.user.full_name || auth.user.username || 'Your parent';
    const result = await sendPushToUsers(auth.supabase, guardianIds, {
      title: `${name} pressed the SOS button`,
      body: 'They opened the emergency call screen. Please call them now.',
      url: '/guardian',
    });
    return send(res, 200, { alerted: result.sent });
  } catch (error) {
    return sendServerError(res, error, 'Could not alert the family.');
  }
};
