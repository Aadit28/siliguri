// Mints the LiveKit room token that lets an elder (or the guardian sitting
// beside them) talk to the Saathi voice agent from the app.
//
// The Python worker in voice-agent/ registers without an `agent_name`, so it is
// on LiveKit's AUTOMATIC dispatch: it joins whatever room appears in the
// project. That makes the room NAME the only routing key we control, hence the
// deterministic `saathi-<elder_id>` below — one room per elder, so a second tap
// rejoins the call already in progress instead of starting a rival one, and the
// worker can read the elder off the room name alone.

const crypto = require('crypto');
const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const { resolveFamilyContext } = require('../bookings/_shared');

// A join token outlives the connection handshake, not the call: LiveKit only
// checks it at join time, so an hour is generous for "tap the button, talk".
const TOKEN_TTL_SECONDS = 60 * 60;

// Small backdate for the clock skew between this lambda and the LiveKit edge.
// Without it a freshly minted token is occasionally "not yet valid".
const NBF_SKEW_SECONDS = 10;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// LiveKit access tokens are ordinary HS256 JWTs signed with the API secret;
// the grant lives under the `video` claim and the API key is the issuer.
// Hand-rolled because neither livekit-server-sdk nor jsonwebtoken is a
// dependency of this project, and a room token is not worth a native install.
function signAccessToken({ apiKey, apiSecret, identity, room, name, metadata, ttlSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: identity,
    // LiveKit replaces a duplicate participant by IDENTITY, so a reconnect
    // from the same device takes over its old slot rather than showing up
    // twice. jti just mirrors it, matching what livekit-server-sdk emits.
    jti: identity,
    nbf: now - NBF_SKEW_SECONDS,
    exp: now + ttlSeconds,
    video: {
      room,
      roomJoin: true,
      // The elder speaks and hears; canPublishData carries nothing today but is
      // what any later "press to repeat that" control would ride on.
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  if (name) payload.name = name;
  if (metadata) payload.metadata = metadata;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

module.exports = async function handler(req, res) {
  withCors(res);
  // A room token is a bearer credential with a live grant on it. Nothing may
  // hold a copy.
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    // Read at call time, never at import: the LiveKit credentials are still
    // pending, and a module-scope throw would take down the whole /api/*
    // dispatcher — every other route with it — the moment this file is
    // required. The endpoint has to be able to say "not yet" and stay up.
    const url = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    if (!url || !apiKey || !apiSecret) {
      return send(res, 503, {
        error: 'Voice calling is not set up on this server yet.',
        code: 'voice_not_configured',
      });
    }

    const body = await readBody(req);
    // Same door as the bookings routes: an absent elderId means "the elder is
    // the caller, or the single parent this guardian looks after", and a named
    // one is checked against family_links before it is trusted. A guardian of
    // two parents gets the 400 that asks which, not a guess.
    const { elderId } = await resolveFamilyContext(auth, body.elderId);

    const room = `saathi-${elderId}`;

    const token = signAccessToken({
      apiKey,
      apiSecret,
      // The identity is the DEVICE HOLDER, not the elder the room belongs to.
      // A guardian starting a call for their parent joins saathi-<parent> as
      // themselves; minting the elder's id here would let the worker mistake a
      // guardian for the elder and read a booking confirmation back to the
      // wrong person.
      identity: auth.user.id,
      room,
      name: auth.user.full_name || auth.user.username || undefined,
      // Who is actually speaking, for a worker that cannot tell from the room
      // name alone. Unconsumed today — the worker's context comes from job
      // metadata, which automatic dispatch does not carry.
      metadata: JSON.stringify({
        elder_id: elderId,
        caller_id: auth.user.id,
        caller_role: auth.user.id === elderId ? 'elder' : 'guardian',
      }),
      ttlSeconds: TOKEN_TTL_SECONDS,
    });

    // The ws URL rides along so the app needs no LiveKit config of its own —
    // one fewer thing to get wrong in two places when the project moves region.
    return send(res, 200, { token, url, room, identity: auth.user.id, elderId });
  } catch (error) {
    return sendServerError(res, error, 'Could not start the call. Please try again.');
  }
};
