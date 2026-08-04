const { adminClient, send, withCors } = require('./_lib/auth');
const {
  activitiesLiveEnabled,
  listActivities,
  requestQueryValue,
  sendActivityError,
} = require('./_lib/activities');

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (!activitiesLiveEnabled()) {
    return send(res, 503, { error: 'The live activities catalog is not enabled yet.' });
  }

  try {
    const activities = await listActivities(adminClient(), {
      cityId: requestQueryValue(req, 'cityId'),
      citySlug: requestQueryValue(req, 'citySlug'),
    });
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    return send(res, 200, { activities });
  } catch (error) {
    return sendActivityError(
      res,
      error,
      'Could not load activities. Please try again.',
      send,
    );
  }
};
