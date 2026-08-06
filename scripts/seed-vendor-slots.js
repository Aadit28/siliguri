// Seeds demo appointment slots into public.vendor_slots for every doctor,
// medical_shop and home_service vendor in one city, for the next 7 days:
//
//   node scripts/seed-vendor-slots.js --project demo --city siliguri
//   node scripts/seed-vendor-slots.js --project prod --city bengaluru
//
// doctor      -> 10:00-13:00 and 17:00-20:00 IST, 15-minute slots, capacity 1
// medical_shop
// home_service -> 09:00-21:00 IST, hourly slots, capacity 3
//
// Idempotent: vendor_slots already carries a unique (vendor_id, starts_at)
// constraint (migration 17), so this upserts with ON CONFLICT DO NOTHING —
// a slot that exists from an earlier run is left exactly as it is, never
// overwritten.
//
// --project is REQUIRED and refused if missing, on purpose. Per
// docs/operations.md this repo has only ONE Supabase project today ("There is
// one Supabase project ... There is no staging."), so demo/prod isolation
// does not exist yet: both values fall back to this repo's single
// EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY pair, with a loud
// warning before writing. The flag still has to be typed every time so
// seeding is a deliberate choice, not a habit — and if a second project is
// ever stood up, pointing SUPABASE_URL_DEMO / SUPABASE_SERVICE_ROLE_KEY_DEMO
// (or the _PROD pair) at it makes this script isolate for free, no code
// change required.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { WebSocket } = require('ws');

const ROOT = path.resolve(__dirname, '..');

// Same minimal .env reader scripts/dev-api.js uses: this script is invoked
// directly (`node scripts/seed-vendor-slots.js ...`), not through
// `node --env-file=.env`, so it has to load its own environment.
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
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

const PROJECTS = ['demo', 'prod'];
const args = parseArgs(process.argv.slice(2));

if (!args.project || !PROJECTS.includes(String(args.project))) {
  console.error(`Missing or invalid --project. Pass one of: ${PROJECTS.join(', ')}.`);
  console.error('Example: node scripts/seed-vendor-slots.js --project demo --city siliguri');
  process.exit(1);
}
if (!args.city || args.city === true) {
  console.error('Missing --city. Pass a city slug or name, e.g. --city siliguri');
  process.exit(1);
}

const project = String(args.project);
const cityArg = String(args.city).trim();

function credentialsFor(projectName) {
  const suffix = projectName.toUpperCase();
  const scopedUrl = process.env[`SUPABASE_URL_${suffix}`];
  const scopedKey = process.env[`SUPABASE_SERVICE_ROLE_KEY_${suffix}`];
  if (scopedUrl && scopedKey) return { url: scopedUrl, key: scopedKey, scoped: true };
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    scoped: false,
  };
}

const { url, key, scoped } = credentialsFor(project);
if (!url || !key) {
  console.error(
    `Missing Supabase credentials for --project ${project}. Set SUPABASE_URL_${project.toUpperCase()} / ` +
      `SUPABASE_SERVICE_ROLE_KEY_${project.toUpperCase()} in .env, or EXPO_PUBLIC_SUPABASE_URL / ` +
      'SUPABASE_SERVICE_ROLE_KEY for this repo\'s single project.',
  );
  process.exit(1);
}
if (!scoped) {
  console.warn(
    `No SUPABASE_URL_${project.toUpperCase()} override found: this repo has one Supabase project today, so ` +
      `--project ${project} writes to the same database everything else runs on. Proceed only if that is intended.`,
  );
}

const CATEGORY_CONFIG = {
  doctor: { durationMin: 15, capacity: 1, windows: [[10, 13], [17, 20]] },
  medical_shop: { durationMin: 60, capacity: 3, windows: [[9, 21]] },
  home_service: { durationMin: 60, capacity: 3, windows: [[9, 21]] },
};
const CATEGORIES = Object.keys(CATEGORY_CONFIG);
const DAYS_AHEAD = 7;
const IST_OFFSET = '+05:30';
const UPSERT_CHUNK = 500;

// Siliguri time, fixed offset, same as server/bookings/_shared.js.
function isoAt(dateStr, hh, mm) {
  const hour = String(hh).padStart(2, '0');
  const min = String(mm).padStart(2, '0');
  return new Date(`${dateStr}T${hour}:${min}:00${IST_OFFSET}`).toISOString();
}

// IST calendar date, `days` ahead of right now — shifted from UTC by +5:30
// before slicing, so a run late in the UTC evening still lands on the
// Siliguri day it looks like to the person watching a demo.
function dateStrDaysFromNow(days) {
  const istMillis = Date.now() + 5.5 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000;
  return new Date(istMillis).toISOString().slice(0, 10);
}

// Every duration-minute-aligned start time in [startHour, endHour) whose slot
// still ends by endHour — so a 15-minute grid over 10:00-13:00 stops at
// 12:45, never spilling a slot past the window it was asked for.
function timesInWindow(startHour, endHour, intervalMin) {
  const times = [];
  const totalEnd = endHour * 60;
  for (let t = startHour * 60; t + intervalMin <= totalEnd; t += intervalMin) {
    times.push({ hh: Math.floor(t / 60), mm: t % 60 });
  }
  return times;
}

async function resolveCity(supabase, wanted) {
  const bySlug = await supabase.from('cities').select('id,name,slug').eq('slug', wanted.toLowerCase()).maybeSingle();
  if (bySlug.error) throw new Error(`cities lookup: ${bySlug.error.message}`);
  if (bySlug.data) return bySlug.data;

  const byName = await supabase.from('cities').select('id,name,slug').ilike('name', wanted).maybeSingle();
  if (byName.error) throw new Error(`cities lookup: ${byName.error.message}`);
  if (byName.data) return byName.data;

  throw new Error(`City "${wanted}" was not found. Pass a known slug or name from public.cities.`);
}

function buildSlotRows(vendors, cityId) {
  const rows = [];
  for (const vendor of vendors) {
    const config = CATEGORY_CONFIG[vendor.category];
    if (!config) continue;
    for (let day = 0; day < DAYS_AHEAD; day += 1) {
      const dateStr = dateStrDaysFromNow(day);
      for (const [startHour, endHour] of config.windows) {
        for (const { hh, mm } of timesInWindow(startHour, endHour, config.durationMin)) {
          rows.push({
            vendor_id: vendor.id,
            starts_at: isoAt(dateStr, hh, mm),
            duration_min: config.durationMin,
            capacity: config.capacity,
            booked: 0,
            city_id: cityId,
          });
        }
      }
    }
  }
  return rows;
}

async function main() {
  const supabase = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { transport: WebSocket },
  });

  const city = await resolveCity(supabase, cityArg);

  const { data: vendors, error: vendorsError } = await supabase
    .from('services')
    .select('id,name,category')
    .eq('city_id', city.id)
    .in('category', CATEGORIES);
  if (vendorsError) throw new Error(`services lookup: ${vendorsError.message}`);

  if (!vendors || !vendors.length) {
    console.log(`No ${CATEGORIES.join('/')} vendors found for ${city.name}. Nothing to seed.`);
    return;
  }

  const rows = buildSlotRows(vendors, city.id);
  console.log(`${city.name} (${city.slug}): ${vendors.length} vendors, ${rows.length} slot rows to attempt.`);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    // ignoreDuplicates turns this into INSERT ... ON CONFLICT (vendor_id,
    // starts_at) DO NOTHING; PostgREST's returning clause then reports only
    // the rows actually written, which is exactly the "skip if it already
    // exists" contract asked for.
    const { data, error } = await supabase
      .from('vendor_slots')
      .upsert(chunk, { onConflict: 'vendor_id,starts_at', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(`vendor_slots upsert: ${error.message}`);
    inserted += (data || []).length;
  }

  console.log(`Inserted ${inserted} new slot(s). ${rows.length - inserted} already existed and were left alone.`);
}

main().catch((error) => {
  console.error('Seeding vendor slots failed:', error.message);
  process.exit(1);
});
