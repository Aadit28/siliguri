// End-to-end smoke test of the two-phase booking flow (hold -> confirm ->
// [guardian approve] -> cancel) against a RUNNING API. Complements
// scripts/regression.mjs (which never touches bookings) and does NOT replace
// it. Every assertion is a hard assert: the first failure prints the
// PASS/FAIL table gathered so far and exits non-zero immediately, because
// every later step depends on state the earlier ones produced (a hold id, an
// idempotency key, a booking id) — there is nothing meaningful left to check
// once one of those is missing.
//
// Auth mechanism (discovered from server/_lib/auth.js + server/auth/signin.js):
// this app does NOT use Supabase Auth. Sign-in is a custom endpoint,
// POST /api/auth/signin with { username | phone, password }, which checks a
// pbkdf2 hash in public.user_accounts and returns a bearer token minted into
// public.auth_tokens (30-day TTL). Every other route reads that token from
// `Authorization: Bearer <token>` via authenticate() in server/_lib/auth.js.
// There is no OTP path for this flow (OTP is guardian phone verification,
// not sign-in) and no email field anywhere in this schema — accounts are
// keyed by username or phone, so SMOKE_ELDER_EMAIL as literally named in the
// task brief does not exist here; this script uses SMOKE_ELDER_USERNAME /
// SMOKE_ELDER_PASSWORD instead and documents that substitution here.
//
// Env vars (all optional — defaults match scripts/seed-demo-accounts.mjs's
// Siliguri demo family, which is already linked guardian<->parent):
//   SMOKE_ELDER_USERNAME       default: demo.parent
//   SMOKE_ELDER_PASSWORD       default: saathi123
//   SMOKE_GUARDIAN_USERNAME    default: demo.guardian
//   SMOKE_GUARDIAN_PASSWORD    default: saathi123
//   SMOKE_BOOKING_CATEGORY     default: doctor (capacity-1 slots, seeded by
//                              scripts/seed-vendor-slots.js — capacity 1 is
//                              what makes step 9's capacity-release assertion
//                              meaningful; a capacity-3 slot would let a
//                              second hold through even if release were
//                              broken)
//   EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
//                              required for step 8 (direct audit_log read).
//                              Same pair every other script in this repo uses.
//
// Run command (local dev API):
//   node scripts/dev-api.js                          # in one terminal
//   node --env-file=.env scripts/smoke-booking.js     # in another
//
// Against a deployed API:
//   node --env-file=.env scripts/smoke-booking.js --base https://<host> --yes-prod
//
// NOTE: this file could not be executed as part of this task — migration 17
// (booking core) and migration 18 (audit_log) may not be applied to whatever
// database --base points at, and there is no local Supabase instance in this
// environment. It has only been syntax-checked (`node --check`), not run.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { WebSocket } = require('ws');

const ROOT = path.resolve(__dirname, '..');

// Same minimal .env reader every other script in scripts/ uses — this file is
// invoked directly, not through `node --env-file=.env`, when someone forgets
// the flag, so it loads its own environment as a fallback.
function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
loadEnvFile();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const BASE = String(args.base || process.env.SMOKE_BOOKING_API || `http://127.0.0.1:${process.env.SAATHI_API_PORT || 8788}`).replace(/\/+$/, '');
const YES_PROD = args['yes-prod'] === true;

function isLocalBase(url) {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname === '::1';
  } catch {
    return false;
  }
}

if (!isLocalBase(BASE) && !YES_PROD) {
  console.error(`Refusing to run against a non-local API (${BASE}) without --yes-prod.`);
  console.error('Pass --yes-prod if this is really intended.');
  process.exit(1);
}

const ELDER_USERNAME = process.env.SMOKE_ELDER_USERNAME || 'demo.parent';
const ELDER_PASSWORD = process.env.SMOKE_ELDER_PASSWORD || 'saathi123';
const GUARDIAN_USERNAME = process.env.SMOKE_GUARDIAN_USERNAME || 'demo.guardian';
const GUARDIAN_PASSWORD = process.env.SMOKE_GUARDIAN_PASSWORD || 'saathi123';
const CATEGORY = process.env.SMOKE_BOOKING_CATEGORY || 'doctor';

// --- result tracking ---------------------------------------------------------
const results = [];

function record(label, ok, detail) {
  results.push({ label, ok: Boolean(ok), detail: detail || '' });
}

function printSummary() {
  console.log('\n--- Booking smoke summary --------------------------------------------');
  const width = Math.max(4, ...results.map((r) => r.label.length));
  for (const r of results) {
    const status = r.ok ? 'PASS' : 'FAIL';
    console.log(`${status}  ${r.label.padEnd(width)}  ${r.detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`------------------------------------------------------------------------`);
  console.log(`${passed}/${results.length} passed`);
}

// Hard assert: records the result, and on failure prints everything gathered
// so far and exits immediately. Every step after the first hold depends on an
// id or key minted by an earlier step, so there is nothing left worth
// checking once one of them fails.
function assertStep(label, condition, detail) {
  record(label, condition, detail);
  if (!condition) {
    printSummary();
    process.exit(1);
  }
}

// --- HTTP helper -------------------------------------------------------------
async function api(method, urlPath, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON body (a proxy error page, a crashed server). Leave json null;
    // callers assert on shape and will fail loudly with the raw text visible.
  }
  return { status: res.status, json, text };
}

async function signIn(username, password) {
  const res = await api('POST', '/api/auth/signin', { username, password });
  return res;
}

// --- main ---------------------------------------------------------------------
async function main() {
  console.log(`Booking smoke test against ${BASE}`);
  console.log(`Elder: ${ELDER_USERNAME}   Guardian: ${GUARDIAN_USERNAME}   Category: ${CATEGORY}\n`);

  // 1. Sign in as the test elder.
  const elderAuth = await signIn(ELDER_USERNAME, ELDER_PASSWORD);
  assertStep(
    'sign in as elder',
    elderAuth.status === 200 && Boolean(elderAuth.json?.session?.access_token),
    `status ${elderAuth.status}: ${elderAuth.json?.error || elderAuth.text.slice(0, 120)}`,
  );
  const elderToken = elderAuth.json.session.access_token;

  // 2. bookings/search returns at least one slot with room in it.
  const search = await api('POST', '/api/bookings/search', { category: CATEGORY }, elderToken);
  const searchOk = search.status === 200 && Array.isArray(search.json?.slots);
  assertStep(
    'bookings/search reachable',
    searchOk,
    `status ${search.status}: ${search.json?.error || search.text.slice(0, 120)}`,
  );
  const openSlot = (search.json.slots || []).find((s) => s.spotsRemaining > 0);
  assertStep(
    `bookings/search returns >=1 open "${CATEGORY}" slot`,
    Boolean(openSlot),
    openSlot
      ? `slot ${openSlot.id} at ${openSlot.startsAt}`
      : `got ${search.json.slots.length} slot(s), none with room — run: node scripts/seed-vendor-slots.js --project demo --city <yours>`,
  );
  const slotId = openSlot.id;

  // 3. Hold the slot with a fresh idempotency key.
  const holdKey = crypto.randomUUID();
  const hold1 = await api('POST', '/api/bookings/hold', { slotId, idempotencyKey: holdKey }, elderToken);
  assertStep(
    'hold slot -> held',
    hold1.status === 200 && hold1.json?.hold?.status === 'held' && Boolean(hold1.json.hold.id),
    `status ${hold1.status}: ${JSON.stringify(hold1.json)}`,
  );
  const bookingId = hold1.json.hold.id;

  // 4. Repeat the SAME hold call with the SAME key: booking_hold must return
  // the same row rather than claim a second seat (migration 17, booking_hold).
  const hold2 = await api('POST', '/api/bookings/hold', { slotId, idempotencyKey: holdKey }, elderToken);
  assertStep(
    'repeat hold (same key) is idempotent',
    hold2.status === 200 && hold2.json?.hold?.id === bookingId,
    `first id ${bookingId}, retry id ${hold2.json?.hold?.id}, status ${hold2.status}`,
  );

  // 5. Confirm with the SAME key (booking_confirm checks the key against the
  // one stamped on the row at hold time, not a fresh one — see migration 17).
  const confirm = await api(
    'POST',
    '/api/bookings/confirm',
    { holdId: bookingId, idempotencyKey: holdKey },
    elderToken,
  );
  const confirmedStatus = confirm.json?.booking?.status;
  assertStep(
    'confirm -> pending_vendor or pending_guardian',
    confirm.status === 200 && ['pending_vendor', 'pending_guardian'].includes(confirmedStatus),
    `status ${confirm.status}: ${JSON.stringify(confirm.json)}`,
  );

  // 6. If it landed on the guardian and we have guardian creds, approve it.
  let statusAfterApproval = confirmedStatus;
  if (confirmedStatus === 'pending_guardian') {
    if (GUARDIAN_USERNAME && GUARDIAN_PASSWORD) {
      const guardianAuth = await signIn(GUARDIAN_USERNAME, GUARDIAN_PASSWORD);
      assertStep(
        'sign in as guardian',
        guardianAuth.status === 200 && Boolean(guardianAuth.json?.session?.access_token),
        `status ${guardianAuth.status}: ${guardianAuth.json?.error || guardianAuth.text.slice(0, 120)}`,
      );
      const guardianToken = guardianAuth.json.session.access_token;

      const approve = await api(
        'POST',
        '/api/bookings/approve',
        { bookingId, approve: true },
        guardianToken,
      );
      assertStep(
        'guardian approve -> pending_vendor',
        approve.status === 200 && approve.json?.booking?.status === 'pending_vendor',
        `status ${approve.status}: ${JSON.stringify(approve.json)}`,
      );
      statusAfterApproval = approve.json.booking.status;
    } else {
      record('guardian approve', true, 'skipped — no SMOKE_GUARDIAN_USERNAME/PASSWORD; booking left at pending_guardian');
    }
  }
  void statusAfterApproval;

  // 7. Cancel. Elder is family_id's own account, so requireFamilyLink allows
  // the elder to cancel their own booking directly.
  const cancel = await api('POST', '/api/bookings/cancel', { bookingId }, elderToken);
  assertStep(
    'cancel -> cancelled_user',
    cancel.status === 200 && cancel.json?.booking?.status === 'cancelled_user',
    `status ${cancel.status}: ${JSON.stringify(cancel.json)}`,
  );

  // 8. Audit rows exist for this booking. audit_log has no FK to bookings —
  // it is deliberately outlive-able — so the id is looked up wherever the
  // handlers put it: hold's args carry slotId only (the booking id is in its
  // *result*), confirm/cancel/approve put bookingId/holdId directly in args,
  // and every one of those calls in this run reused idempotency_key = holdKey
  // (confirm is required to, by booking_confirm's own check; cancel/approve
  // inherit it from the booking row). Checking all of those together is more
  // robust than any single column.
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    record(
      'audit_log rows exist for booking',
      false,
      'EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — cannot query audit_log directly',
    );
    printSummary();
    process.exit(1);
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
  });
  const { data: auditRows, error: auditError } = await admin
    .from('audit_log')
    .select('id,actor,action,args,result,idempotency_key,created_at')
    .or(
      [
        `idempotency_key.eq.${holdKey}`,
        `args->>bookingId.eq.${bookingId}`,
        `args->>holdId.eq.${bookingId}`,
        `result->>bookingId.eq.${bookingId}`,
      ].join(','),
    )
    .order('created_at', { ascending: true });
  assertStep(
    'audit_log rows exist for booking',
    !auditError && Array.isArray(auditRows) && auditRows.length > 0,
    auditError ? auditError.message : `${auditRows.length} row(s): ${auditRows.map((r) => r.action).join(', ')}`,
  );

  // 9. Second full pass: hold the SAME slot again. If step 7's cancel had not
  // released capacity, this hold would 409 (slot_full) immediately — the slot
  // was chosen from a capacity-1 category, so there is no room for a second
  // occupant unless the first one's seat came back.
  const holdKey2 = crypto.randomUUID();
  const hold3 = await api('POST', '/api/bookings/hold', { slotId, idempotencyKey: holdKey2 }, elderToken);
  assertStep(
    'second pass: hold same slot after release -> held',
    hold3.status === 200 && hold3.json?.hold?.status === 'held',
    `status ${hold3.status}: ${JSON.stringify(hold3.json)}`,
  );
  const bookingId2 = hold3.json.hold.id;

  const cancel2 = await api('POST', '/api/bookings/cancel', { bookingId: bookingId2 }, elderToken);
  assertStep(
    'second pass: cancel -> cancelled_user',
    cancel2.status === 200 && cancel2.json?.booking?.status === 'cancelled_user',
    `status ${cancel2.status}: ${JSON.stringify(cancel2.json)}`,
  );

  printSummary();
  process.exit(0);
}

main().catch((error) => {
  record('unexpected error', false, error?.stack || String(error));
  printSummary();
  process.exit(1);
});
