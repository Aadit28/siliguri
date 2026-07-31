const { authenticate, readBody, send, sendServerError, withCors } = require('../_lib/auth');

// The bell's server-alert inbox. Two actions:
//   list — newest 30 alerts for the signed-in user plus their unread count
//   read — stamp everything unread as read (the badge clears; rows remain)
module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);

    if (body.action === 'read') {
      const { error } = await auth.supabase
        .from('alerts')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', auth.user.id)
        .is('read_at', null);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    const { data, error } = await auth.supabase
      .from('alerts')
      .select('id,title,body,url,created_at,read_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    const alerts = (data || []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body || null,
      url: row.url || null,
      createdAt: row.created_at,
      unread: !row.read_at,
    }));
    return send(res, 200, { alerts, unread: alerts.filter((alert) => alert.unread).length });
  } catch (error) {
    return sendServerError(res, error, 'Could not load notifications.');
  }
};
