const { authenticate, readBody, send, withCors } = require('../_lib/auth');
const {
  activitiesLiveEnabled,
  getEnrollment,
  requireUuid,
  resolveParticipant,
  sendActivityError,
} = require('../_lib/activities');

module.exports = async function handler(req, res) {
  withCors(res);
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!activitiesLiveEnabled()) {
    return send(res, 503, { error: 'Activity enrollment is not enabled yet.' });
  }

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const activityId = requireUuid(body.activityId, 'activityId');
    const participant = await resolveParticipant(auth, body.participantId);

    const { error } = await auth.supabase.rpc('leave_activity', {
      p_activity_id: activityId,
      p_participant_id: participant.participantId,
      p_actor_id: auth.user.id,
    });
    if (error) throw error;

    const enrollment = await getEnrollment(auth.supabase, participant, activityId);
    if (!enrollment) throw new Error('Enrollment was not found after leaving.');
    return send(res, 200, { enrollment });
  } catch (error) {
    return sendActivityError(
      res,
      error,
      'Could not leave this activity. Please try again.',
      send,
    );
  }
};
