// Seeds the public service directory (per city) and starter community posts.
// Run after applying supabase-schema.sql, supabase-migration-2.sql and
// supabase-migration-14-multi-city.sql:
//
//   node --env-file=.env scripts/seed.mjs                 # every known city
//   node --env-file=.env scripts/seed.mjs bengaluru       # one city only
//
// The service-role key bypasses RLS. Run this only in a trusted local/server
// environment; never expose that key in the app bundle.
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

globalThis.WebSocket = globalThis.WebSocket ?? WebSocket;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// One audited file per city. The file name keeps the common spelling of the
// city; the key is the slug that lives in public.cities.
const CITY_FILES = {
  siliguri: '../src/data/services.json',
  bengaluru: '../src/data/services.bangalore.json',
  ahilyanagar: '../src/data/services.ahilyanagar.json',
};

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const slugs = requested.length ? requested : Object.keys(CITY_FILES);

for (const slug of slugs) {
  if (!CITY_FILES[slug]) {
    console.error(`Unknown city "${slug}". Known: ${Object.keys(CITY_FILES).join(', ')}`);
    process.exit(1);
  }
}

const posts = [
  {
    category: 'best_practice',
    title: 'Tip: keep a printed medicine list on the fridge',
    body: 'For my parents I printed a big list of their medicines and timings and stuck it on the fridge. Helps any helper or neighbour in an emergency.',
  },
  {
    category: 'general',
    title: 'How did you choose an elder care home in Siliguri?',
    body: 'We are looking at a few care homes for my mother. What did others look for when visiting — staff ratio, food, medical support? Would love advice.',
  },
];

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function cityIdFor(slug) {
  const { data, error } = await supabase.from('cities').select('id,name').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`cities lookup (${slug}): ${error.message}`);
  if (!data) {
    throw new Error(`City "${slug}" is missing. Apply supabase-migration-14-multi-city.sql first.`);
  }
  return data;
}

async function seedCity(slug) {
  const city = await cityIdFor(slug);
  const rows = JSON.parse(await readFile(new URL(CITY_FILES[slug], import.meta.url), 'utf8'));

  if (!rows.length) {
    console.log(`  ${city.name}: source file is empty, leaving existing rows alone`);
    return;
  }

  // Scoped delete: reseeding one city must never touch another city's
  // directory, and re-running is how a corrected phone number ships.
  const { error: clearError } = await supabase.from('services').delete().eq('city_id', city.id);
  if (clearError) throw new Error(`clear ${slug}: ${clearError.message}`);

  const { error } = await supabase.from('services').insert(rows.map((row) => ({ ...row, city_id: city.id })));
  if (error) throw new Error(`insert ${slug}: ${error.message}`);
  console.log(`  ${city.name}: ${rows.length} services`);
}

async function seedPostsIfEmpty() {
  const { count, error } = await supabase.from('community_posts').select('id', { count: 'exact', head: true });
  if (error) throw new Error(`community_posts count: ${error.message}`);
  if (count) {
    console.log(`Community already has ${count} posts — left untouched.`);
    return;
  }
  const { error: postsError } = await supabase.from('community_posts').insert(posts);
  if (postsError) throw postsError;
  console.log(`Seeded ${posts.length} starter posts`);
}

async function main() {
  console.log(`Seeding directory for: ${slugs.join(', ')}`);
  for (const slug of slugs) {
    await seedCity(slug);
  }
  await seedPostsIfEmpty();
  console.log('Done');
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
