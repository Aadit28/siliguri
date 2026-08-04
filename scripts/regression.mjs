// End-to-end regression across all three portals plus the agent surfaces.
// This is the pre-deploy gate (there is no unit test suite): run the dev API
// (`node scripts/dev-api.js`) against the seeded database, then:
//
//   node scripts/regression.mjs
//
// Every assertion prints PASS/FAIL so a failure is visible rather than
// inferred. Set SAATHI_REGRESSION_API to point somewhere other than the local
// dev API. The suite creates and removes its own rows; it leaves inbox alert
// rows behind (they age out via the daily cron).
import { readFile } from 'node:fs/promises';

const API = process.env.SAATHI_REGRESSION_API || 'http://127.0.0.1:8788';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) { pass += 1; console.log(`PASS  ${label}`); }
  else { fail += 1; console.log(`FAIL  ${label}  ${detail}`); }
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

const signIn = async (username) =>
  (await post('/api/auth/signin', { username, password: 'saathi123' })).json.session.access_token;

const parent = await signIn('demo.parent');
const guardian = await signIn('demo.guardian');
const admin = await signIn('demo.admin');
check('all three roles sign in', Boolean(parent && guardian && admin));

// PARENT: assistant answers, disclaimer is the vetted one, Hindi routes correctly.
const en = await post('/api/assistant/plan', { message: 'book a doctor appointment tomorrow', lang: 'en', services: [] }, parent);
check('assistant answers in English', en.status === 200 && Boolean(en.json.summary));
check('disclaimer is vetted copy', en.json.safetyNote?.startsWith('Saathi is a coordination tool'), en.json.safetyNote?.slice(0, 40));

const hi = await post('/api/assistant/plan', { message: 'बस एक डॉक्टर चाहिए', lang: 'hi', services: [] }, parent);
check('Hindi "just need a doctor" is medical, not transport', hi.json.intent === 'medical_appointment', hi.json.intent);

// AGENT: reminder proposals in both languages, validated shape.
const remEn = await post(
  '/api/assistant/plan',
  { message: 'Remind me to take BP medicine daily at 8pm', lang: 'en', services: [], context: { todayISO: '2026-07-31' } },
  parent,
);
const prEn = remEn.json.proposedReminder;
check(
  'English reminder proposal parsed',
  prEn && prEn.time === '20:00' && prEn.repeat === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(prEn.dateISO),
  JSON.stringify(prEn),
);

const remHi = await post(
  '/api/assistant/plan',
  { message: 'मुझे कल सुबह दवा लेना याद दिलाना', lang: 'hi', services: [], context: { todayISO: '2026-07-31' } },
  parent,
);
const prHi = remHi.json.proposedReminder;
// "कल" must resolve to tomorrow deterministically; the exact morning hour is
// the LLM's choice when the model path answers (the local parser says 09:00,
// kimi tends to say 08:00) — any morning time is a correct reading of "सुबह".
const hiHour = Number(String(prHi?.time || '').slice(0, 2));
check(
  'Hindi reminder proposal parsed',
  prHi && prHi.dateISO === '2026-08-01' && hiHour >= 5 && hiHour <= 11,
  JSON.stringify(prHi),
);

// GUARDIAN: links, reminders CRUD, validation.
const links = (await post('/api/family/link', { action: 'list' }, guardian)).json;
const parentId = links.asGuardian?.[0]?.parentId;
check('guardian sees a linked parent', Boolean(parentId));

const before = (await post('/api/family/reminders', { action: 'list', parentId }, guardian)).json;
// Assert on the seeded titles, not on a row count: the demo seeder writes 28
// days of adherence history, so any fixed number goes stale the next time that
// window changes and reports a green suite as a failure.
const seededTitles = new Set((before.reminders || []).map((r) => r.title));
check(
  'seeded reminders intact',
  ['Blood pressure medicine', 'Evening sugar tablet', 'Refill diabetes strips'].every((title) =>
    seededTitles.has(title),
  ),
  `got ${before.reminders?.length} rows: ${[...seededTitles].join(', ')}`,
);

const badDate = await post('/api/family/reminders', { action: 'add', parentId, title: 'QA regression', dateISO: '31-08-2026' }, guardian);
check('malformed date rejected', badDate.status === 400, `status ${badDate.status}`);

const badTime = await post('/api/family/reminders', { action: 'add', parentId, title: 'QA regression', dateISO: '2026-08-20', time: '25:00' }, guardian);
check('out-of-range time rejected', badTime.status === 400, `status ${badTime.status}`);

const added = await post('/api/family/reminders', { action: 'add', parentId, title: 'QA regression', dateISO: '2026-08-20', time: '09:30', repeat: 'monthly' }, guardian);
check('monthly reminder accepted', added.status === 200 && added.json.reminder?.repeat === 'monthly');
if (added.json?.reminder?.id) {
  const removed = await post('/api/family/reminders', { action: 'remove', parentId, id: added.json.reminder.id }, guardian);
  check('QA reminder cleaned up', removed.status === 200);
}

// PUSH + INBOX: registration validates, SOS is guarded, alerts list and read.
const badToken = await post('/api/notify/register', { token: 'not-a-token' }, parent);
check('garbage push token rejected', badToken.status === 400, `status ${badToken.status}`);

const sosAnon = await post('/api/family/sos', {});
check('anonymous SOS rejected', sosAnon.status === 401, `status ${sosAnon.status}`);

const sos = await post('/api/family/sos', {}, parent);
check('parent SOS accepted', sos.status === 200 && typeof sos.json.alerted === 'number', JSON.stringify(sos.json));

const inbox = await post('/api/notify/alerts', {}, guardian);
check(
  'guardian inbox lists the SOS alert',
  inbox.status === 200 && inbox.json.alerts?.some((alert) => alert.title.includes('SOS')),
  `top: ${inbox.json.alerts?.[0]?.title}`,
);

const markRead = await post('/api/notify/alerts', { action: 'read' }, guardian);
const afterRead = await post('/api/notify/alerts', {}, guardian);
check('mark-read clears unread', markRead.status === 200 && afterRead.json.unread === 0, `unread ${afterRead.json.unread}`);

// ADMIN: directory, partial patch keeps other fields, callback queue scoped.
const list = await post('/api/admin/service', { action: 'list' }, admin);
// The Siliguri admin sees the Siliguri directory, so the expected count comes
// from that city's audited source file rather than a literal that has to be
// edited by hand every time a listing is added or removed.
const siliguriCatalog = JSON.parse(
  await readFile(new URL('../src/data/services.json', import.meta.url), 'utf8'),
);
check(
  'admin sees the directory',
  list.json.services?.length === siliguriCatalog.length,
  `got ${list.json.services?.length}, source file has ${siliguriCatalog.length}`,
);
check('map_url present in list payload', 'map_url' in (list.json.services?.[0] ?? {}));

const target = list.json.services.find((s) => s.phone && s.address);
const patched = await post('/api/admin/service', { id: target.id, name: target.name, category: target.category, hours: 'QA regression hours' }, admin);
check('partial patch succeeds', patched.status === 200, `status ${patched.status}`);
const after = (await post('/api/admin/service', { action: 'list' }, admin)).json.services.find((s) => s.id === target.id);
check('omitted fields survive a partial patch', after.phone === target.phone && after.address === target.address);
await post('/api/admin/service', { id: target.id, name: target.name, category: target.category, hours: target.hours ?? '' }, admin);
const restored = (await post('/api/admin/service', { action: 'list' }, admin)).json.services.find((s) => s.id === target.id);
check('service restored', (restored.hours ?? '') === (target.hours ?? ''), `now ${restored.hours}`);

const queue = await post('/api/admin/callback', { action: 'list' }, admin);
check('callback queue reachable', queue.status === 200);

// Cross-role: a parent token must not reach admin routes.
const forbidden = await post('/api/admin/service', { action: 'list' }, parent);
check('parent token rejected by admin route', forbidden.status === 403, `status ${forbidden.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
