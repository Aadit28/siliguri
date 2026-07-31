const { adminClient, send, withCors } = require('../_lib/auth');
const { sendPushToUsers } = require('../_lib/push');

// Evening digest to guardians: how the day's reminders went for each linked
// parent. Vercel cron calls this once a day (Hobby's minimum interval) with
// `Authorization: Bearer ${CRON_SECRET}`; the same secret allows a manual run.
//
// The digest is a push per (guardian, parent) pair, so a guardian looking after
// two parents gets two lines they can tell apart.

// IST, not server time: the reminders' date_iso values are the parent's local
// day in Siliguri, and a UTC "today" would report yesterday until 05:30.
function istTodayISO() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const secret = process.env.CRON_SECRET;
  const header = String(req.headers.authorization || '');
  if (!secret || header !== `Bearer ${secret}`) {
    return send(res, 401, { error: 'Not allowed.' });
  }

  try {
    const client = adminClient();

    // Housekeeping riding the daily wake-up: durable rate-limit events older
    // than two days are outside every window in use and only slow the counts.
    // Runs before the digest work so an early "no links" return still prunes.
    await client
      .from('rate_events')
      .delete()
      .lt('created_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ error }) => {
        if (error) console.warn('rate_events purge failed:', error.message);
      });
    // Inbox rows keep a month of history, then leave.
    await client
      .from('alerts')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .then(({ error }) => {
        if (error) console.warn('alerts purge failed:', error.message);
      });

    const todayISO = istTodayISO();
    // Bound the scan: a reminder more than 30 days overdue has been reported
    // for a month already and only adds noise.
    const sinceISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: links, error: linkError } = await client
      .from('family_links')
      .select('guardian_id,parent_id')
      .eq('status', 'active');
    if (linkError) throw linkError;
    if (!links || !links.length) return send(res, 200, { ok: true, digests: 0 });

    const parentIds = [...new Set(links.map((link) => link.parent_id))];

    const [{ data: reminders, error: reminderError }, { data: parents, error: parentError }] =
      await Promise.all([
        client
          .from('family_reminders')
          .select('parent_id,status,date_iso')
          .in('parent_id', parentIds)
          .gte('date_iso', sinceISO)
          .lte('date_iso', todayISO),
        client.from('user_accounts').select('id,full_name,username').in('id', parentIds),
      ]);
    if (reminderError) throw reminderError;
    if (parentError) throw parentError;

    const nameById = new Map(
      (parents || []).map((row) => [row.id, row.full_name || row.username || 'Your parent']),
    );

    const statsByParent = new Map();
    for (const row of reminders || []) {
      const stats = statsByParent.get(row.parent_id) || { doneToday: 0, openToday: 0, overdue: 0 };
      if (row.date_iso === todayISO) {
        if (row.status === 'done') stats.doneToday += 1;
        else if (row.status === 'active') stats.openToday += 1;
      } else if (row.status === 'active') {
        stats.overdue += 1;
      }
      statsByParent.set(row.parent_id, stats);
    }

    let digests = 0;
    for (const parentId of parentIds) {
      const stats = statsByParent.get(parentId);
      // No reminders in the window means nothing to report; silence beats a
      // daily "0 of 0" push that trains guardians to ignore the channel.
      if (!stats) continue;

      const name = nameById.get(parentId) || 'Your parent';
      const total = stats.doneToday + stats.openToday;
      const parts = [];
      if (total > 0) parts.push(`${stats.doneToday} of ${total} reminders done today`);
      if (stats.openToday > 0) parts.push(`${stats.openToday} still open`);
      if (stats.overdue > 0) parts.push(`${stats.overdue} overdue from earlier days`);
      if (!parts.length) continue;

      const guardianIds = links
        .filter((link) => link.parent_id === parentId)
        .map((link) => link.guardian_id);
      const result = await sendPushToUsers(client, guardianIds, {
        title: `Saathi: ${name}`,
        body: parts.join(' · '),
        url: '/guardian',
      });
      digests += result.sent;
    }

    return send(res, 200, { ok: true, digests });
  } catch (error) {
    console.error('Digest cron failed:', error?.message || error);
    return send(res, 500, { error: 'Digest failed.' });
  }
};
