// Seeds the services table (and a couple of community posts) using the
// service_role key. Run AFTER applying supabase-schema.sql.
//
//   node --env-file=.env scripts/seed.mjs
//
// The service_role key bypasses RLS, so this must only ever run locally/server-side.
import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

// supabase-js initializes a realtime client that needs WebSocket; Node < 22
// has no global one. The app (browser / React Native) has it natively.
globalThis.WebSocket = globalThis.WebSocket ?? WebSocket;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const services = [
  {
    name: 'Dr. Anjali Sharma — Physician',
    category: 'doctor',
    description: 'General physician, 20+ years. Home visits for elderly patients available.',
    phone: '+913532500111',
    address: 'Sevoke Road, Siliguri',
    map_url: 'https://maps.google.com/?q=Sevoke+Road+Siliguri',
    hours: 'Mon–Sat, 9am–7pm',
    rating: 4.8,
    verified: true,
    town: 'Siliguri',
  },
  {
    name: 'Dr. Rajiv Menon — Cardiologist',
    category: 'doctor',
    description: 'Heart specialist. Telemedicine consults for relatives abroad.',
    phone: '+913532500222',
    address: 'Hakimpara, Siliguri',
    map_url: 'https://maps.google.com/?q=Hakimpara+Siliguri',
    hours: 'Mon–Fri, 10am–5pm',
    rating: 4.9,
    verified: true,
    town: 'Siliguri',
  },
  {
    name: 'North Bengal Medical College & Hospital',
    category: 'hospital',
    description: 'Major government hospital with emergency and 24/7 services.',
    phone: '+913532500333',
    address: 'Sushrutanagar, Siliguri',
    map_url: 'https://maps.google.com/?q=North+Bengal+Medical+College',
    hours: 'Open 24 hours',
    rating: 4.2,
    verified: true,
    town: 'Siliguri',
  },
  {
    name: 'LifeCare Pharmacy',
    category: 'medical_shop',
    description: 'Home delivery of medicines. Accepts prescription photo on WhatsApp.',
    phone: '+913532500444',
    address: 'Hill Cart Road, Siliguri',
    map_url: 'https://maps.google.com/?q=Hill+Cart+Road+Siliguri',
    hours: 'Daily, 8am–10pm',
    rating: 4.6,
    verified: true,
    town: 'Siliguri',
  },
  {
    name: 'Himalayan Journeys Travel',
    category: 'travel_agent',
    description: 'Train, flight & cab booking. Help with senior-citizen concessions.',
    phone: '+913532500555',
    address: 'Sevoke Road, Siliguri',
    map_url: 'https://maps.google.com/?q=Sevoke+Road+Siliguri',
    hours: 'Mon–Sat, 10am–7pm',
    rating: 4.5,
    verified: false,
    town: 'Siliguri',
  },
  {
    name: 'GharSeva Home Helpers',
    category: 'daily_service',
    description: 'Verified house help, cooks and attendants for elderly care.',
    phone: '+913532500666',
    address: 'Pradhan Nagar, Siliguri',
    map_url: 'https://maps.google.com/?q=Pradhan+Nagar+Siliguri',
    hours: 'Daily, 7am–9pm',
    rating: 4.4,
    verified: true,
    town: 'Siliguri',
  },
];

const posts = [
  {
    category: 'best_practice',
    title: 'Tip: keep a printed medicine list on the fridge',
    body: 'For my parents I printed a big list of their medicines and timings and stuck it on the fridge. Helps any helper or neighbour in an emergency.',
  },
  {
    category: 'travel',
    title: 'Best way to book a train ticket with senior concession?',
    body: 'Want to bring my mother to Kolkata. How do people here handle senior citizen train bookings?',
  },
];

async function main() {
  console.log('Seeding services...');
  const { error: sErr } = await supabase.from('services').insert(services);
  if (sErr) throw sErr;
  console.log(`  inserted ${services.length} services`);

  console.log('Seeding community posts...');
  const { error: pErr } = await supabase.from('community_posts').insert(posts);
  if (pErr) throw pErr;
  console.log(`  inserted ${posts.length} posts`);

  console.log('Done ✅');
}

main().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
