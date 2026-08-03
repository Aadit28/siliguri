// Offline demo accounts. Lets the app be signed into without a backend so the
// UI can be shown before Supabase/Vercel are wired up. When the backend is
// live these same credentials also exist as real rows (scripts/seed-demo-accounts.mjs),
// so nothing changes for the user — the offline path just short-circuits the
// network call. Remove this module (and its use in AuthContext) once the
// backend is always available.

export const DEMO_PASSWORD = 'saathi123';

export type DemoKind = 'parent' | 'guardian' | 'admin';

export const DEFAULT_DEMO_CITY = 'siliguri';

export interface DemoUser {
  kind: DemoKind;
  citySlug: string;
  id: string;
  username: string;
  phone: string; // already normalized (+91…)
  password: string;
  fullName: string;
  role: string;
}

// One family per city, matching scripts/seed-demo-accounts.mjs row for row.
// Siliguri keeps the bare usernames: the pitch deck and the promo video sign in
// as demo.parent / demo.guardian.
export const DEMO_USERS: DemoUser[] = [
  {
    kind: 'parent',
    citySlug: 'siliguri',
    id: 'demo-parent-0001',
    username: 'demo.parent',
    phone: '+919800000001',
    password: DEMO_PASSWORD,
    fullName: 'Anjali Sen',
    role: 'user',
  },
  {
    kind: 'guardian',
    citySlug: 'siliguri',
    id: 'demo-guardian-0001',
    username: 'demo.guardian',
    phone: '+919800000002',
    password: DEMO_PASSWORD,
    fullName: 'Rahul Sen',
    role: 'user',
  },
  {
    kind: 'admin',
    citySlug: 'siliguri',
    id: 'demo-admin-0001',
    username: 'demo.admin',
    phone: '+919800000003',
    password: DEMO_PASSWORD,
    fullName: 'Saathi Admin',
    role: 'admin',
  },
  {
    kind: 'parent',
    citySlug: 'bengaluru',
    id: 'demo-parent-0002',
    username: 'demo.parent.blr',
    phone: '+919800000011',
    password: DEMO_PASSWORD,
    fullName: 'Lakshmi Rao',
    role: 'user',
  },
  {
    kind: 'guardian',
    citySlug: 'bengaluru',
    id: 'demo-guardian-0002',
    username: 'demo.guardian.blr',
    phone: '+919800000012',
    password: DEMO_PASSWORD,
    fullName: 'Kiran Rao',
    role: 'user',
  },
  {
    kind: 'admin',
    citySlug: 'bengaluru',
    id: 'demo-admin-0002',
    username: 'demo.admin.blr',
    phone: '+919800000013',
    password: DEMO_PASSWORD,
    fullName: 'Saathi Admin (Bengaluru)',
    role: 'admin',
  },
  {
    kind: 'parent',
    citySlug: 'ahilyanagar',
    id: 'demo-parent-0003',
    username: 'demo.parent.ahn',
    phone: '+919800000021',
    password: DEMO_PASSWORD,
    fullName: 'Sunita Deshmukh',
    role: 'user',
  },
  {
    kind: 'guardian',
    citySlug: 'ahilyanagar',
    id: 'demo-guardian-0003',
    username: 'demo.guardian.ahn',
    phone: '+919800000022',
    password: DEMO_PASSWORD,
    fullName: 'Amol Deshmukh',
    role: 'user',
  },
  {
    kind: 'admin',
    citySlug: 'ahilyanagar',
    id: 'demo-admin-0003',
    username: 'demo.admin.ahn',
    phone: '+919800000023',
    password: DEMO_PASSWORD,
    fullName: 'Saathi Admin (Ahilyanagar)',
    role: 'admin',
  },
];

function normUsername(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normPhone(value: string) {
  const raw = value.trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (raw.startsWith('+') && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : raw;
}

// Returns the matching demo user when identifier+password line up, else null.
// Identifier may be either the username or the phone number.
export function matchDemoUser(identifier: string, password: string): DemoUser | null {
  if (!identifier.trim() || password !== DEMO_PASSWORD) return null;
  const asUsername = normUsername(identifier);
  const asPhone = normPhone(identifier);
  return (
    DEMO_USERS.find((u) => u.username === asUsername || u.phone === asPhone) ?? null
  );
}

// Falls back to the launch city rather than throwing: a city can exist in the
// database (added by an admin) long before it has a demo family, and the login
// screen must still offer a working demo when that happens.
export function demoByKind(kind: DemoKind, citySlug: string = DEFAULT_DEMO_CITY): DemoUser {
  const inCity = DEMO_USERS.find((u) => u.kind === kind && u.citySlug === citySlug);
  if (inCity) return inCity;
  const fallback = DEMO_USERS.find((u) => u.kind === kind && u.citySlug === DEFAULT_DEMO_CITY);
  if (!fallback) throw new Error(`No demo user for kind ${kind}`);
  return fallback;
}
