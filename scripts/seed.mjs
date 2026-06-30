// Seeds the public service directory and starter community posts.
// Run after applying supabase-schema.sql and supabase-migration-2.sql:
//   node --env-file=.env scripts/seed.mjs
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

const services = JSON.parse(
  await readFile(new URL('../src/data/services.json', import.meta.url), 'utf8'),
);

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

async function main() {
  const matchAll = '00000000-0000-0000-0000-000000000000';

  console.log('Clearing old seed data...');
  await supabase.from('community_posts').delete().neq('id', matchAll);
  await supabase.from('services').delete().neq('id', matchAll);

  console.log('Seeding services...');
  const { error: servicesError } = await supabase.from('services').insert(services);
  if (servicesError) throw servicesError;
  console.log(`  inserted ${services.length} services`);

  console.log('Seeding community posts...');
  const { error: postsError } = await supabase.from('community_posts').insert(posts);
  if (postsError) throw postsError;
  console.log(`  inserted ${posts.length} posts`);

  console.log('Done');
}

main().catch((error) => {
  console.error('Seed failed:', error.message);
  process.exit(1);
});
