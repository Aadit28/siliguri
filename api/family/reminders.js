const { authenticate, readBody, requireFamilyLink, send, withCors,
  sendServerError } = require('../_lib/auth');

const REPEATS = ['once', 'daily', 'weekly', 'monthly'];

// A wrongly-ordered date ("31-07-2026") used to be stored verbatim, after which
// the recurrence helpers passed it through unchanged and the reminder never
// fired — a silent failure on the one feature elders depend on.
function invalidDate(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return 'Use a date like 2026-08-15.';
  const parsed = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateISO) {
    return 'That date does not exist.';
  }
  return undefined;
}

function invalidTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return 'Use a time like 08:30.';
  // Shape alone is not enough: "25:99" matches the pattern and would schedule
  // a notification that can never fire.
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 'Use a time between 00:00 and 23:59.';
  return undefined;
}

function toReminder(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    createdBy: row.created_by,
    title: row.title,
    note: row.note || null,
    dateISO: row.date_iso,
    time: row.time || null,
    repeat: row.repeat,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLS = 'id,parent_id,created_by,title,note,date_iso,time,repeat,status,created_at,updated_at';

module.exports = async function handler(req, res) {
  withCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await authenticate(req);
    if (auth.error) return send(res, 401, { error: auth.error });

    const body = await readBody(req);
    const parentId = String(body.parentId || '');
    if (!parentId) return send(res, 400, { error: 'parentId is required.' });
    const linkError = await requireFamilyLink(auth, parentId);
    if (linkError) return send(res, 403, linkError);

    const action = ['list', 'add', 'update', 'remove', 'done'].includes(body.action) ? body.action : 'list';

    if (action === 'add') {
      const title = String(body.title || '').trim();
      const dateISO = String(body.dateISO || '').trim();
      if (!title) return send(res, 400, { error: 'A title is required.' });
      if (!dateISO) return send(res, 400, { error: 'A date is required.' });
      const dateError = invalidDate(dateISO);
      if (dateError) return send(res, 400, { error: dateError });
      const time = body.time ? String(body.time).trim() : '';
      if (time) {
        const timeError = invalidTime(time);
        if (timeError) return send(res, 400, { error: timeError });
      }
      const repeat = REPEATS.includes(body.repeat) ? body.repeat : 'once';

      const { data, error } = await auth.supabase
        .from('family_reminders')
        .insert({
          parent_id: parentId,
          created_by: auth.user.id,
          title,
          note: body.note ? String(body.note).trim() : null,
          date_iso: dateISO,
          time: time || null,
          repeat,
        })
        .select(COLS)
        .single();
      if (error) throw error;
      return send(res, 200, { reminder: toReminder(data) });
    }

    if (action === 'update') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Reminder id is required.' });
      const patch = { updated_at: new Date().toISOString() };
      if (body.title !== undefined) patch.title = String(body.title || '').trim();
      if (body.note !== undefined) patch.note = body.note ? String(body.note).trim() : null;
      if (body.dateISO !== undefined) {
        const nextDate = String(body.dateISO || '').trim();
        const dateError = invalidDate(nextDate);
        if (dateError) return send(res, 400, { error: dateError });
        patch.date_iso = nextDate;
      }
      if (body.time !== undefined) {
        const nextTime = body.time ? String(body.time).trim() : '';
        if (nextTime) {
          const timeError = invalidTime(nextTime);
          if (timeError) return send(res, 400, { error: timeError });
        }
        patch.time = nextTime || null;
      }
      if (body.repeat !== undefined && REPEATS.includes(body.repeat)) patch.repeat = body.repeat;

      const { data, error } = await auth.supabase
        .from('family_reminders')
        .update(patch)
        .eq('id', id)
        .eq('parent_id', parentId)
        .select(COLS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return send(res, 404, { error: 'Reminder not found.' });
      return send(res, 200, { reminder: toReminder(data) });
    }

    if (action === 'done') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Reminder id is required.' });
      const { data, error } = await auth.supabase
        .from('family_reminders')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('parent_id', parentId)
        .select(COLS)
        .maybeSingle();
      if (error) throw error;
      if (!data) return send(res, 404, { error: 'Reminder not found.' });
      return send(res, 200, { reminder: toReminder(data) });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      if (!id) return send(res, 400, { error: 'Reminder id is required.' });
      const { error } = await auth.supabase
        .from('family_reminders')
        .delete()
        .eq('id', id)
        .eq('parent_id', parentId);
      if (error) throw error;
      return send(res, 200, { ok: true });
    }

    // list
    const { data, error } = await auth.supabase
      .from('family_reminders')
      .select(COLS)
      .eq('parent_id', parentId)
      .order('date_iso', { ascending: true })
      .order('time', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return send(res, 200, { reminders: (data || []).map(toReminder) });
  } catch (error) {
    return sendServerError(res, error, 'Could not update reminders.');
  }
};
