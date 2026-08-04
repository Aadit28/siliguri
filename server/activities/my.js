const { authenticate, send, withCors } = require('../_lib/auth');
const {
  activitiesLiveEnabled,
  listMyEnrollments,
  requestQueryValue,
  resolveParticipant,
  sendActivityError,
} = require('../_lib/activities');

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (!activitiesLiveEnabled()) {
    return send(res, 503, { error: 'Activity enrollment records are not enabled yet.' });
  }

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const participant = await resolveParticipant(auth, requestQueryValue(req, 'participantId'));
    const enrollments = await listMyEnrollments(auth.supabase, participant);
    return send(res, 200, { enrollments });
  } catch (error) {
    return sendActivityError(
      res,
      error,
      'Could not load your activities. Please try again.',
      send,
    );
  }
};
