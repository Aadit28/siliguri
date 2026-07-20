const { authenticate, readBody, send, withCors } = require('../_lib/auth');

// Analytics are for the guardian looking in on a linked parent — the parent
// does not view their own summary, so this check does not accept self access.
async function requireActiveGuardian(auth, parentId) {
  const { data, error } = await auth.supabase
    .from('family_links')
    .select('id')
    .eq('guardian_id', auth.user.id)
    .eq('parent_id', parentId)
    .eq('status', 'active')
    .limit(1);
  if (error) throw error;
  return Boolean(data && data.length);
}

async function countRows(supabase, table, apply) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  query = apply(query);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const action = body.action || 'summary';
    if (action !== 'summary') return send(res, 400, { error: 'Unknown action.' });
    const parentId = String(body.parentId || '');
    if (!parentId) return send(res, 400, { error: 'parentId is required.' });
    if (!(await requireActiveGuardian(auth, parentId))) {
      return send(res, 403, { error: 'Not allowed.' });
    }

    const now = Date.now();
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const todayISO = new Date(now).toISOString().slice(0, 10);

    const { data: lastToken, error: tokenError } = await auth.supabase
      .from('auth_tokens')
      .select('created_at')
      .eq('user_id', parentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (tokenError) throw tokenError;

    const { data: callbacks, error: callbackError } = await auth.supabase
      .from('callback_requests')
      .select('status,created_at,issue')
      .eq('user_id', parentId)
      .order('created_at', { ascending: false })
      .limit(5);
    if (callbackError) throw callbackError;

    const [
      assistantEvents7d,
      assistantEvents30d,
      upcoming,
      overdue,
      done7d,
      careTeamCount,
      favoritesCount,
    ] = await Promise.all([
      countRows(auth.supabase, 'assistant_events', (q) => q.eq('user_id', parentId).gte('created_at', since7d)),
      countRows(auth.supabase, 'assistant_events', (q) => q.eq('user_id', parentId).gte('created_at', since30d)),
      countRows(auth.supabase, 'family_reminders', (q) => q.eq('parent_id', parentId).eq('status', 'active').gte('date_iso', todayISO)),
      countRows(auth.supabase, 'family_reminders', (q) => q.eq('parent_id', parentId).eq('status', 'active').lt('date_iso', todayISO)),
      countRows(auth.supabase, 'family_reminders', (q) => q.eq('parent_id', parentId).eq('status', 'done').gte('updated_at', since7d)),
      countRows(auth.supabase, 'care_team', (q) => q.eq('parent_id', parentId)),
      countRows(auth.supabase, 'family_favorites', (q) => q.eq('parent_id', parentId)),
    ]);

    return send(res, 200, {
      lastActiveAt: lastToken ? lastToken.created_at : null,
      assistantEvents7d,
      assistantEvents30d,
      callbacks: (callbacks || []).map((c) => ({ status: c.status, created_at: c.created_at, issue: c.issue || null })),
      reminders: { upcoming, overdue, done7d },
      careTeamCount,
      favoritesCount,
    });
  } catch (error) {
    return send(res, 500, { error: error.message || 'Could not load the summary.' });
  }
};
