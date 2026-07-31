const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');
const { isExpoToken } = require('../_lib/push');

// Stores or removes an Expo push token for the signed-in user. The app calls
// this after sign-in (register) and during sign-out (remove) so a shared
// family tablet does not keep ringing for the previous account.
module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const token = String(body.token || '').trim();
    if (!isExpoToken(token)) return send(res, 400, { error: 'A valid push token is required.' });

    if (body.action === 'remove') {
      // Scoped to the caller: one user must not be able to unregister another
      // user's device by guessing its token.
      const { error } = await auth.supabase
        .from('push_tokens')
        .delete()
        .eq('token', token)
        .eq('user_id', auth.user.id);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    const platform = ['ios', 'android', 'web'].includes(body.platform) ? body.platform : 'unknown';
    // Upsert on the token: a device that switches accounts moves its token to
    // the new user instead of duplicating the row.
    const { error } = await auth.supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: auth.user.id,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'token' },
      );
    if (error) throw error;
    return send(res, 200, { ok: true });
  } catch (error) {
    return sendServerError(res, error, 'Could not save notification settings.');
  }
};
