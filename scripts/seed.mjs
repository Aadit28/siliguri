// Seeds the services table (and a couple of community posts) using the
// service_role key. Run AFTER applying supabase-schema.sql + supabase-migration-2.sql.
//
//   node --env-file=.env scripts/seed.mjs
//
// The service_role key bypasses RLS, so this must only ever run locally/server-side.
//
// DATA NOTE: listings below are gathered from public web sources (linked via
// source_url). Phone numbers / addresses found online are often outdated, so
// every entry is verified=false UNLESS it came from the provider's OWN official
// website. Always confirm before relying on any detail.
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
  // ---- ELDER CARE HOMES ----
  {
    name: 'Siliguri Bhawna Society',
    category: 'elder_home',
    description:
      'Registered orphanage & old-age home society running since 2011. Provides shelter, homemade food and care for elders.',
    phone: '+919832675576',
    address: 'Rajiv Nagar, Near Darjeeling More, Ward 46, PO Pradhan Nagar, Siliguri 734003',
    map_url: 'https://maps.google.com/?q=Siliguri+Bhawna+Society+Pradhan+Nagar',
    hours: null,
    rating: 4.7,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.bhawanasociety.org/',
  },
  {
    name: 'Naba Basanta Old Age Home',
    category: 'elder_home',
    description:
      'Old age home run by Shree Shree Ramkrishna Samity, Siliguri. Exact address/phone unconfirmed — please call ahead.',
    phone: null,
    address: 'Siliguri (exact address unconfirmed — please confirm)',
    map_url: 'https://maps.google.com/?q=Naba+Basanta+Old+Age+Home+Siliguri',
    hours: null,
    rating: null,
    verified: false,
    town: 'Siliguri',
    source_url: 'https://www.nababasanta.org/',
  },

  // ---- HOSPITALS ----
  {
    name: 'North Bengal Medical College & Hospital',
    category: 'hospital',
    description:
      'Largest government medical college and tertiary referral hospital in North Bengal (established 1968). 24/7 emergency services.',
    phone: '+913532585478',
    address: 'Sushrutanagar, Kawakhali, Siliguri 734012',
    map_url: 'https://maps.google.com/?q=North+Bengal+Medical+College+and+Hospital',
    hours: 'Open 24 hours',
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url:
      'https://wbuhs.ac.in/Affiliated%20Courses/north-bengal-medical-college-hospital/',
  },
  {
    name: 'Manipal Hospitals Siliguri',
    category: 'hospital',
    description:
      'Multispecialty hospital in Pradhan Nagar (formerly Medica). Appointments and 24/7 emergency; MARS ambulance service.',
    phone: '+913536650000',
    address: 'Meghnad Saha Sarani, Pradhan Nagar, Siliguri 734003',
    map_url: 'https://maps.google.com/?q=Manipal+Hospitals+Siliguri+Pradhan+Nagar',
    hours: 'Open 24 hours',
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.manipalhospitals.com/siliguri/contact-us/',
  },
  {
    name: 'DeSun Hospital Siliguri',
    category: 'hospital',
    description: 'Multispecialty hospital beside North Bengal Medical College, with a 24x7 pharmacy.',
    phone: '+919051715171',
    address: 'Medical College Road, Kawakhali, Beside North Bengal Medical College, Sushrutanagar, Siliguri 734012',
    map_url: 'https://maps.google.com/?q=Desun+Hospital+Siliguri',
    hours: 'Open 24 hours',
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.desunsiliguri.com/contact-us/',
  },
  {
    name: 'Star Hospital',
    category: 'hospital',
    description: 'Multispecialty hospital near Tinbatti More, Siliguri. Toll-free: 1800 123 8044.',
    phone: '+918001006060',
    address: 'Asian Highway-2, Near Tinbatti More, Babu Para, Siliguri 734004',
    map_url: 'https://maps.google.com/?q=Star+Hospital+Tinbatti+More+Siliguri',
    hours: null,
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.starhospitalslg.com/contact',
  },
  {
    name: 'Global Nursing Home',
    category: 'hospital',
    description: 'Multispecialty nursing home / hospital in Champasari, Siliguri.',
    phone: '+919800858132',
    address: 'Devidanga, Behind Maa Durga Petrol Pump, Champasari, Siliguri 734003',
    map_url: 'https://maps.google.com/?q=Global+Nursing+Home+Champasari+Siliguri',
    hours: null,
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.globalnursinghome.in/contact',
  },

  // ---- MEDICAL SHOPS / PHARMACIES ----
  {
    name: 'Apollo Pharmacy — Netaji More',
    category: 'medical_shop',
    description: 'Apollo Pharmacy outlet. Genuine medicines, health and wellness products, online delivery.',
    phone: '+919007907591',
    address: 'Netaji More, Subhaspally, Siliguri 734001',
    map_url: 'https://maps.google.com/?q=Apollo+Pharmacy+Netaji+More+Siliguri',
    hours: '9:00 AM – 11:00 PM, daily',
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.apollopharmacy.in/medical-stores/west_bengal/netaji_more-13070',
  },
  {
    name: 'DeSun 24x7 Pharmacy',
    category: 'medical_shop',
    description: '24-hour pharmacy at DeSun Hospital, beside North Bengal Medical College, Siliguri.',
    phone: '+919051715171',
    address: 'DeSun Hospital, Beside North Bengal Medical College, Sushrutanagar, Siliguri 734012',
    map_url: 'https://maps.google.com/?q=Desun+24x7+Pharmacy+Siliguri',
    hours: 'Open 24 hours',
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.desunsiliguri.com/24-hrs-pharmacy/',
  },

  // ---- TRAVEL AGENTS ----
  {
    name: 'Airtrips (IRCTC Authorised)',
    category: 'travel_agent',
    description: 'IRCTC-authorised train ticket booking plus flight bookings.',
    phone: '+919609596096',
    address: 'Unit 4, 5th Floor, Capital One Building, Burdwan Road, Siliguri 734005',
    map_url: 'https://maps.google.com/?q=Airtrips+Burdwan+Road+Siliguri',
    hours: null,
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://www.airtripsonline.com/contact.html',
  },
  {
    name: 'Angshika Travels',
    category: 'travel_agent',
    description: 'Travel agency in Siliguri. Exact address/phone unconfirmed — please confirm.',
    phone: null,
    address: 'Siliguri (exact address unconfirmed — please confirm)',
    map_url: 'https://maps.google.com/?q=Angshika+Travels+Siliguri',
    hours: null,
    rating: null,
    verified: false,
    town: 'Siliguri',
    source_url: 'https://angshikatravels.com/',
  },
  {
    name: 'North Bengal Tourism',
    category: 'travel_agent',
    description: 'Tour operator and travel agency for North Bengal, based in Hakim Para, Siliguri.',
    phone: '+918145584286',
    address: 'Nazrul Sarani, Ashram Para, Hakim Para, Siliguri 734001',
    map_url: 'https://maps.google.com/?q=North+Bengal+Tourism+Siliguri',
    hours: 'Mon–Sat, 10am–7pm',
    rating: null,
    verified: true,
    town: 'Siliguri',
    source_url: 'https://northbengaltourism.com/contact-us/',
  },
];

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

async function main() {
  const matchAll = '00000000-0000-0000-0000-000000000000';
  console.log('Clearing old seed data...');
  await supabase.from('community_posts').delete().neq('id', matchAll);
  await supabase.from('services').delete().neq('id', matchAll);

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
