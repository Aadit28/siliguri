// Push delivery through Expo's push service. The app registers device tokens
// via /api/notify/register; rows live in push_tokens.
//
// Design rules:
// - Never throws: a failed push must not fail the request that triggered it.
// - Await it BEFORE sending the HTTP response. Vercel freezes the function
//   right after the response ends, so a dangling promise would silently die.
// - DeviceNotRegistered receipts delete the token row, so uninstalled devices
//   stop accumulating send errors.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts up to 100 messages per request.
const CHUNK_SIZE = 100;

function isExpoToken(token) {
  return /^Expo(nent)?PushToken\[.+\]$/.test(String(token || ''));
}

// message: { title, body, url } — url is a path like '/calendar' that the app
// opens when the notification is tapped (see the root layout listener).
async function sendPushToUsers(client, userIds, message) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return { sent: 0 };

    // The in-app inbox row comes FIRST and is written for every recipient,
    // devices or not: web and Expo Go cannot receive push, and the bell is
    // the only place those users will ever see this alert.
    await client
      .from('alerts')
      .insert(
        ids.map((userId) => ({
          user_id: userId,
          title: String(message.title || 'Saathi').slice(0, 120),
          body: message.body ? String(message.body).slice(0, 240) : null,
          url: message.url ? String(message.url).slice(0, 200) : null,
        })),
      )
      .then(({ error: insertError }) => {
        if (insertError) console.warn('Alert inbox write failed:', insertError.message);
      });

    const { data, error } = await client
      .from('push_tokens')
      .select('token')
      .in('user_id', ids);
    if (error || !data || !data.length) return { sent: 0 };

    const tokens = data.map((row) => row.token).filter(isExpoToken);
    if (!tokens.length) return { sent: 0 };

    const dead = [];
    let sent = 0;
    for (let start = 0; start < tokens.length; start += CHUNK_SIZE) {
      const chunk = tokens.slice(start, start + CHUNK_SIZE);
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify(
          chunk.map((token) => ({
            to: token,
            title: String(message.title || 'Saathi').slice(0, 120),
            body: String(message.body || '').slice(0, 240),
            sound: 'default',
            channelId: 'saathi-reminders',
            data: message.url ? { url: String(message.url).slice(0, 200) } : {},
          })),
        ),
      });
      if (!response.ok) continue;
      const result = await response.json().catch(() => null);
      const tickets = Array.isArray(result?.data) ? result.data : [];
      tickets.forEach((ticket, index) => {
        if (ticket?.status === 'ok') sent += 1;
        else if (ticket?.details?.error === 'DeviceNotRegistered') dead.push(chunk[index]);
      });
    }

    if (dead.length) {
      await client.from('push_tokens').delete().in('token', dead);
    }
    return { sent };
  } catch (error) {
    console.error('Push send failed:', error?.message || error);
    return { sent: 0 };
  }
}

// Guardian ids with an active link to this parent — the audience for "how is
// my parent doing" alerts.
async function guardianIdsForParent(client, parentId) {
  try {
    const { data, error } = await client
      .from('family_links')
      .select('guardian_id')
      .eq('parent_id', parentId)
      .eq('status', 'active');
    if (error) return [];
    return (data || []).map((row) => row.guardian_id).filter(Boolean);
  } catch {
    return [];
  }
}

module.exports = { sendPushToUsers, guardianIdsForParent, isExpoToken };
