// Seeds a full demo PARENT (elder) account + a matching GUARDIAN (child abroad)
// account per city, already linked and active, plus sample care team, reminders
// and a pinned service so the guardian dashboard has something to show. Each
// city also gets its own admin, so the city-admin portal can be demonstrated
// without handing over the Siliguri account.
//
//   node --env-file=.env scripts/seed-demo-accounts.mjs              # all cities
//   node --env-file=.env scripts/seed-demo-accounts.mjs bengaluru    # one city
//
// Idempotent: re-running deletes the demo accounts by username first (cascading
// their links / reminders / care team) and recreates them fresh, so password
// hashes never go stale. Uses the service-role key -> run only in a trusted
// local/server environment, never in the app bundle.
//
// Every person, clinic and phone number below is invented for the demo. The
// real, sourced directory lives in src/data/services.*.json and is seeded by
// scripts/seed.mjs — do not mix the two.
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

// --- Demo identities, one family per city -----------------------------------
const PASSWORD = 'saathi123';

// Siliguri keeps the original bare usernames: the pitch deck, the promo video
// and every existing walkthrough sign in as demo.parent / demo.guardian.
const CITY_DEMOS = {
  siliguri: {
    parent: { username: 'demo.parent', fullName: 'Anjali Sen', phone: '9800000001', locale: 'bn' },
    guardian: { username: 'demo.guardian', fullName: 'Rahul Sen', phone: '9800000002', locale: 'en', relationship: 'son' },
    admin: { username: 'demo.admin', fullName: 'Saathi Admin', phone: '9800000003', locale: 'en' },
    careTeam: [
      {
        category: 'doctor',
        name: 'Dr. Ashok Banerjee',
        phone: '+913512510101',
        note: 'Family physician, Hakimpara. Mon/Wed/Fri evenings.',
      },
      {
        category: 'pharmacy',
        name: 'Sen Medical Hall',
        phone: '+913512522233',
        note: 'Home delivery for regular medicines.',
      },
      { category: 'helper', name: 'Mamata (day help)', phone: '+919800000045', note: 'Comes 9am-1pm daily.' },
    ],
    appointment: 'Dr. Banerjee appointment',
  },
  bengaluru: {
    parent: { username: 'demo.parent.blr', fullName: 'Lakshmi Rao', phone: '9800000011', locale: 'kn' },
    guardian: { username: 'demo.guardian.blr', fullName: 'Kiran Rao', phone: '9800000012', locale: 'en', relationship: 'daughter' },
    admin: { username: 'demo.admin.blr', fullName: 'Saathi Admin (Bengaluru)', phone: '9800000013', locale: 'en' },
    careTeam: [
      {
        category: 'doctor',
        name: 'Dr. Shanthi Murthy',
        phone: '+918025550101',
        note: 'Geriatric physician, Jayanagar. Tue/Thu mornings.',
      },
      {
        category: 'pharmacy',
        name: 'Rao Medicals, 4th Block',
        phone: '+918025550233',
        note: 'Delivers to the flat within an hour.',
      },
      { category: 'helper', name: 'Shobha (day help)', phone: '+919800000046', note: 'Comes 8am-12pm daily.' },
    ],
    appointment: 'Dr. Murthy appointment',
  },
  ahilyanagar: {
    parent: { username: 'demo.parent.ahn', fullName: 'Sunita Deshmukh', phone: '9800000021', locale: 'mr' },
    guardian: { username: 'demo.guardian.ahn', fullName: 'Amol Deshmukh', phone: '9800000022', locale: 'en', relationship: 'son' },
    admin: { username: 'demo.admin.ahn', fullName: 'Saathi Admin (Ahilyanagar)', phone: '9800000023', locale: 'en' },
    careTeam: [
      {
        category: 'doctor',
        name: 'Dr. Prakash Jadhav',
        phone: '+912412550101',
        note: 'Family physician, Savedi. Mon/Thu evenings.',
      },
      {
        category: 'pharmacy',
        name: 'Deshmukh Medical Stores',
        phone: '+912412550233',
        note: 'Keeps her monthly BP and sugar medicines in stock.',
      },
      { category: 'helper', name: 'Rekha (day help)', phone: '+919800000047', note: 'Comes 9am-2pm daily.' },
    ],
    appointment: 'Dr. Jadhav appointment',
  },
};

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const slugs = requested.length ? requested : Object.keys(CITY_DEMOS);

for (const slug of slugs) {
  if (!CITY_DEMOS[slug]) {
    console.error(`Unknown city "${slug}". Known: ${Object.keys(CITY_DEMOS).join(', ')}`);
    process.exit(1);
  }
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Every row in one insert must carry the same keys: PostgREST builds a single
// column list from the union of the batch, so a key omitted on some rows is
// sent as NULL for those rows instead of falling back to the column default.
function nowISO() {
  return new Date().toISOString();
}

function timestampDaysAgo(days, time) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const [hh, mm] = time.split(':');
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d.toISOString();
}

// Days in the past 28 where a dose was NOT marked. Fixed rather than random so
// two runs of the seeder produce the same adherence figure — a demo that shows
// 89% one day and 96% the next invites questions about the number instead of
// the product.
const MISSED_DAYS_AGO = new Set([3, 9, 17, 24]);

// A month of history behind each demo parent. Without it the guardian dashboard
// opens on a pie of one done and one missed, which reads as a broken chart
// rather than a quiet month. Rows are one-off copies rather than a repeating
// row because a repeat carries no per-day outcome: the point here is that some
// days were marked and some were not.
function buildReminderHistory(parentId, guardianId) {
  const rows = [];
  for (let daysAgo = 28; daysAgo >= 1; daysAgo -= 1) {
    const missed = MISSED_DAYS_AGO.has(daysAgo);
    rows.push({
      parent_id: parentId,
      created_by: guardianId,
      title: 'Blood pressure medicine',
      note: 'After breakfast',
      date_iso: isoDaysFromNow(-daysAgo),
      time: '08:30',
      repeat: 'once',
      // 'active' on a day already past is what the app counts as missed; there
      // is no separate missed state.
      status: missed ? 'active' : 'done',
      created_at: timestampDaysAgo(daysAgo, '07:00'),
      updated_at: missed ? timestampDaysAgo(daysAgo, '07:00') : timestampDaysAgo(daysAgo, '08:40'),
    });

    // Evening tablet on alternating days, so the calendar has days with one
    // reminder and days with two rather than a uniform grid.
    if (daysAgo % 2 === 0) {
      rows.push({
        parent_id: parentId,
        created_by: guardianId,
        title: 'Evening sugar tablet',
        date_iso: isoDaysFromNow(-daysAgo),
        time: '20:00',
        repeat: 'once',
        status: 'done',
        created_at: timestampDaysAgo(daysAgo, '07:00'),
        updated_at: timestampDaysAgo(daysAgo, '20:10'),
      });
    }
  }
  return rows;
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});

async function resolveCity(slug) {
  const { data, error } = await supabase.from('cities').select('id,name').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`cities lookup (${slug}): ${error.message}`);
  if (!data) throw new Error(`City "${slug}" is missing. Apply supabase-migration-14-multi-city.sql first.`);
  return data;
}

async function insertAccount(profile, cityId, role = 'user') {
  const row = accountRow({ ...profile, password: PASSWORD, role });
  if (cityId) row.city_id = cityId;
  const { data, error } = await supabase
    .from('user_accounts')
    .insert(row)
    .select('id,username,full_name,phone_number')
    .single();
  if (error) throw new Error(`insert ${profile.username}: ${error.message}`);
  return data;
}

async function clearAccounts(usernames) {
  const { data: stale } = await supabase.from('user_accounts').select('id').in('username', usernames);
  const staleIds = (stale || []).map((r) => r.id);
  if (!staleIds.length) return;
  // FK on delete cascade wipes family_links, reminders and care_team; profiles
  // has no FK to user_accounts, so it is cleared explicitly.
  await supabase.from('profiles').delete().in('id', staleIds);
  await supabase.from('user_accounts').delete().in('id', staleIds);
}

async function seedCityDemo(slug) {
  const demo = CITY_DEMOS[slug];
  const city = await resolveCity(slug);
  console.log(`\n=== ${city.name} ===`);

  await clearAccounts([demo.parent.username, demo.guardian.username, demo.admin.username]);

  const parent = await insertAccount(demo.parent, city.id);
  const guardian = await insertAccount(demo.guardian, city.id);
  const admin = await insertAccount(demo.admin, city.id, 'admin');
  console.log(`  parent   ${parent.username} (${parent.id})`);
  console.log(`  guardian ${guardian.username} (${guardian.id})`);
  console.log(`  admin    ${admin.username} (${admin.id})`);

  const { error: profileError } = await supabase.from('profiles').insert([
    { id: parent.id, full_name: demo.parent.fullName, locale: demo.parent.locale },
    { id: guardian.id, full_name: demo.guardian.fullName, locale: demo.guardian.locale },
  ]);
  if (profileError) console.warn(`  (profiles skipped: ${profileError.message})`);

  // Active guardian link — the state a verified WhatsApp OTP would produce.
  const { error: linkError } = await supabase.from('family_links').insert({
    guardian_id: guardian.id,
    parent_id: parent.id,
    parent_phone: parent.phone_number,
    relationship: demo.guardian.relationship,
    status: 'active',
    verified_at: nowISO(),
  });
  if (linkError) throw new Error(`family_links: ${linkError.message}`);

  const { error: careError } = await supabase
    .from('care_team')
    .insert(demo.careTeam.map((member) => ({ ...member, parent_id: parent.id, set_by: guardian.id })));
  if (careError) console.warn(`  (care team skipped: ${careError.message})`);

  const { error: remError } = await supabase.from('family_reminders').insert([
    ...buildReminderHistory(parent.id, guardian.id),
    {
      parent_id: parent.id,
      created_by: guardian.id,
      title: 'Blood pressure medicine',
      note: 'After breakfast',
      date_iso: isoDaysFromNow(0),
      time: '08:30',
      repeat: 'daily',
      status: 'active',
      created_at: nowISO(),
      updated_at: nowISO(),
    },
    {
      parent_id: parent.id,
      created_by: guardian.id,
      title: demo.appointment,
      note: 'Monthly check-up',
      date_iso: isoDaysFromNow(3),
      time: '18:00',
      repeat: 'once',
      status: 'active',
      created_at: nowISO(),
      updated_at: nowISO(),
    },
    {
      parent_id: parent.id,
      created_by: guardian.id,
      title: 'Refill diabetes strips',
      note: null,
      date_iso: isoDaysFromNow(7),
      time: '11:00',
      repeat: 'monthly',
      status: 'active',
      created_at: nowISO(),
      updated_at: nowISO(),
    },
  ]);
  if (remError) console.warn(`  (reminders skipped: ${remError.message})`);

  // Pin one directory service from this city, so the guardian's saved list is
  // somewhere the elder could actually walk to.
  const { data: svc } = await supabase
    .from('services')
    .select('id,name')
    .eq('city_id', city.id)
    .limit(1)
    .maybeSingle();
  if (svc) {
    const { error: favError } = await supabase.from('family_favorites').insert({
      parent_id: parent.id,
      service_id: svc.id,
      added_by: guardian.id,
      note: 'Recommended by neighbour',
    });
    if (favError) console.warn(`  (favorite skipped: ${favError.message})`);
    else console.log(`  pinned service: ${svc.name}`);
  } else {
    console.log(`  no services seeded for ${city.name} yet — run scripts/seed.mjs ${slug}`);
  }

  return { city, demo };
}

async function main() {
  const seeded = [];
  for (const slug of slugs) {
    seeded.push(await seedCityDemo(slug));
  }

  console.log('\nDone. Demo credentials (username or phone + password):');
  for (const { city, demo } of seeded) {
    console.log(`  ${city.name}`);
    for (const role of ['parent', 'guardian', 'admin']) {
      const person = demo[role];
      console.log(
        `    ${role.padEnd(8)} username=${person.username.padEnd(20)} phone=${normalizePhone(person.phone)} password=${PASSWORD}`,
      );
    }
  }
}

main().catch((error) => {
  console.error('Demo seed failed:', error.message);
  process.exit(1);
});
