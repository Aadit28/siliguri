// Seeds a full demo PARENT (elder) account + a matching GUARDIAN (child abroad)
// account, already linked and active, plus sample care team, reminders and a
// pinned service so the guardian dashboard has something to show.
//
//   node --env-file=.env scripts/seed-demo-accounts.mjs
//
// Idempotent: re-running deletes the two demo accounts by username first
// (cascading their links / reminders / care team) and recreates them fresh, so
// password hashes never go stale. Uses the service-role key -> run only in a
// trusted local/server environment, never in the app bundle.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

globalThis.WebSocket = globalThis.WebSocket ?? WebSocket;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// --- KDF + phone normalisation: must match api/_lib/auth.js exactly ---------
const PASSWORD_ITERATIONS = 310000;

function passwordHash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('base64');
}

function normalizePhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : raw;
}

function accountRow({ username, fullName, phone, password, role = 'user' }) {
  const salt = crypto.randomBytes(16).toString('base64');
  return {
    username,
    full_name: fullName,
    phone_number: normalizePhone(phone),
    password_hash: passwordHash(password, salt),
    password_salt: salt,
    role,
  };
}

// --- Demo identities --------------------------------------------------------
const PASSWORD = 'saathi123';

const PARENT = {
  username: 'demo.parent',
  fullName: 'Anjali Sen',
  phone: '9800000001',
  password: PASSWORD,
  locale: 'bn',
};

const GUARDIAN = {
  username: 'demo.guardian',
  fullName: 'Rahul Sen',
  phone: '9800000002',
  password: PASSWORD,
  locale: 'en',
  relationship: 'son',
};

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

async function resolveSiliguriCityId() {
  // Best effort: migration-3 adds public.cities. Absent on older schemas.
  try {
    const { data } = await supabase
      .from('cities')
      .select('id')
      .ilike('name', 'Siliguri')
      .maybeSingle();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

async function insertAccount(profile, cityId) {
  const row = accountRow(profile);
  if (cityId) row.city_id = cityId;
  const { data, error } = await supabase
    .from('user_accounts')
    .insert(row)
    .select('id,username,full_name,phone_number')
    .single();
  if (error) throw new Error(`insert ${profile.username}: ${error.message}`);
  return data;
}

async function main() {
  // 1. Clear any prior demo rows. FK on delete cascade wipes their family_links,
  //    reminders and care_team; favorites/profiles are cleaned explicitly below.
  console.log('Clearing old demo accounts...');
  const { data: stale } = await supabase
    .from('user_accounts')
    .select('id')
    .in('username', [PARENT.username, GUARDIAN.username]);
  const staleIds = (stale || []).map((r) => r.id);
  if (staleIds.length) {
    await supabase.from('profiles').delete().in('id', staleIds);
    await supabase.from('user_accounts').delete().in('id', staleIds);
  }

  const cityId = await resolveSiliguriCityId();
  if (cityId) console.log(`Siliguri city_id: ${cityId}`);

  // 2. Create both accounts.
  console.log('Creating parent + guardian accounts...');
  const parent = await insertAccount(PARENT, cityId);
  const guardian = await insertAccount(GUARDIAN, cityId);
  console.log(`  parent   ${parent.username} (${parent.id})`);
  console.log(`  guardian ${guardian.username} (${guardian.id})`);

  // 3. Profiles (locale) — best effort; table has no FK to user_accounts.
  const { error: profileError } = await supabase.from('profiles').insert([
    { id: parent.id, full_name: PARENT.fullName, locale: PARENT.locale },
    { id: guardian.id, full_name: GUARDIAN.fullName, locale: GUARDIAN.locale },
  ]);
  if (profileError) console.warn(`  (profiles skipped: ${profileError.message})`);

  // 4. Active guardian link — the state a verified WhatsApp OTP would produce.
  console.log('Linking guardian -> parent (active)...');
  const { error: linkError } = await supabase.from('family_links').insert({
    guardian_id: guardian.id,
    parent_id: parent.id,
    parent_phone: parent.phone_number,
    relationship: GUARDIAN.relationship,
    status: 'active',
    verified_at: new Date().toISOString(),
  });
  if (linkError) throw new Error(`family_links: ${linkError.message}`);

  // 5. Care team for the parent (set by the guardian).
  console.log('Seeding care team...');
  const { error: careError } = await supabase.from('care_team').insert([
    {
      parent_id: parent.id,
      category: 'doctor',
      name: 'Dr. Ashok Banerjee',
      phone: '+913512510101',
      note: 'Family physician, Hakimpara. Mon/Wed/Fri evenings.',
      set_by: guardian.id,
    },
    {
      parent_id: parent.id,
      category: 'pharmacy',
      name: 'Sen Medical Hall',
      phone: '+913512522233',
      note: 'Home delivery for regular medicines.',
      set_by: guardian.id,
    },
    {
      parent_id: parent.id,
      category: 'helper',
      name: 'Mamata (day help)',
      phone: '+919800000045',
      note: 'Comes 9am-1pm daily.',
      set_by: guardian.id,
    },
  ]);
  if (careError) console.warn(`  (care team skipped: ${careError.message})`);

  // 6. Reminders (set by the guardian, on the parent's account).
  console.log('Seeding reminders...');
  const { error: remError } = await supabase.from('family_reminders').insert([
    {
      parent_id: parent.id,
      created_by: guardian.id,
      title: 'Blood pressure medicine',
      note: 'After breakfast',
      date_iso: isoDaysFromNow(0),
      time: '08:30',
      repeat: 'daily',
    },
    {
      parent_id: parent.id,
      created_by: guardian.id,
      title: 'Dr. Banerjee appointment',
      note: 'Monthly check-up',
      date_iso: isoDaysFromNow(3),
      time: '18:00',
      repeat: 'once',
    },
    {
      parent_id: parent.id,
      created_by: guardian.id,
      title: 'Refill diabetes strips',
      date_iso: isoDaysFromNow(7),
      time: '11:00',
      repeat: 'monthly',
    },
  ]);
  if (remError) console.warn(`  (reminders skipped: ${remError.message})`);

  // 7. Pin one directory service, if the services table has been seeded.
  const { data: svc } = await supabase.from('services').select('id,name').limit(1).maybeSingle();
  if (svc) {
    const { error: favError } = await supabase.from('family_favorites').insert({
      parent_id: parent.id,
      service_id: svc.id,
      added_by: guardian.id,
      note: 'Recommended by neighbour',
    });
    if (favError) console.warn(`  (favorite skipped: ${favError.message})`);
    else console.log(`Pinned service: ${svc.name}`);
  } else {
    console.log('No services seeded yet — skipping pinned favorite. Run scripts/seed.mjs for the directory.');
  }

  console.log('\nDone. Demo credentials (username or phone + password):');
  console.log(`  PARENT   username=${PARENT.username}   phone=${normalizePhone(PARENT.phone)}   password=${PASSWORD}`);
  console.log(`  GUARDIAN username=${GUARDIAN.username} phone=${normalizePhone(GUARDIAN.phone)} password=${PASSWORD}`);
}

main().catch((error) => {
  console.error('Demo seed failed:', error.message);
  process.exit(1);
});
