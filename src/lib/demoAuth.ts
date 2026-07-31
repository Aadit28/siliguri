// Offline demo accounts. Lets the app be signed into without a backend so the
// UI can be shown before Supabase/Vercel are wired up. When the backend is
// live these same credentials also exist as real rows (scripts/seed-demo-accounts.mjs),
// so nothing changes for the user — the offline path just short-circuits the
// network call. Remove this module (and its use in AuthContext) once the
// backend is always available.

export const DEMO_PASSWORD = 'saathi123';

export type DemoKind = 'parent' | 'guardian';

export interface DemoUser {
  kind: DemoKind;
  id: string;
  username: string;
  phone: string; // already normalized (+91…)
  password: string;
  fullName: string;
  role: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    kind: 'parent',
    id: 'demo-parent-0001',
    username: 'demo.parent',
    phone: '+919800000001',
    password: DEMO_PASSWORD,
    fullName: 'Anjali Sen',
    role: 'user',
  },
  {
    kind: 'guardian',
    id: 'demo-guardian-0001',
    username: 'demo.guardian',
    phone: '+919800000002',
    password: DEMO_PASSWORD,
    fullName: 'Rahul Sen',
    role: 'user',
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

export function demoByKind(kind: DemoKind): DemoUser {
  const found = DEMO_USERS.find((u) => u.kind === kind);
  if (!found) throw new Error(`No demo user for kind ${kind}`);
  return found;
}
