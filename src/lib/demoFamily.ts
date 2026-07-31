// In-memory family data for the offline demo accounts (src/lib/demoAuth.ts).
// Mirrors what /api/family/* would return once the backend is connected, so the
// guardian dashboard is fully usable in demo mode: the guardian manages the
// parent's reminders, care team and saved places, and sees the analytics
// overview. State is mutable for the session (add/done/remove all work) but
// resets on reload. Remove together with demoAuth.ts when the backend is live.
import type {
  CareTeamCategory,
  CareTeamMember,
  FamilyFavorite,
  FamilyLink,
  FamilyReminder,
  FamilyReminderRepeat,
  ParentAnalytics,
} from './types';
import { DEMO_USERS, demoByKind } from './demoAuth';
import { fetchServices } from './api';

export function isDemoToken(token: string) {
  return token.startsWith('demo.');
}

function demoUserByToken(token: string) {
  const id = token.replace(/^demo\./, '');
  return DEMO_USERS.find((u) => u.id === id) ?? null;
}

const PARENT = demoByKind('parent');
const GUARDIAN = demoByKind('guardian');

// Demo data belongs to a parent living in Asia/Kolkata, and reminder dates are
// that parent's local day — so "today" is anchored to IST (UTC+5:30, no DST),
// not to UTC or the viewer's zone. Reading the UTC parts of a +5:30 shifted
// instant yields the Kolkata wall-clock date without Intl timeZone support.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function iso(daysFromNow: number) {
  const d = new Date(Date.now() + IST_OFFSET_MS + daysFromNow * 86400000);
  return d.toISOString().slice(0, 10);
}

function ts(daysAgo: number, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `demo-${prefix}-${idCounter}`;
}

// ----- Seed state -----------------------------------------------------------

const link: FamilyLink = {
  id: 'demo-link-0001',
  status: 'active',
  parentId: PARENT.id,
  parentName: PARENT.fullName,
  parentPhone: PARENT.phone,
  relationship: 'son',
  guardianId: GUARDIAN.id,
  guardianName: GUARDIAN.fullName,
  createdAt: ts(21),
  verifiedAt: ts(21),
};

const reminders: FamilyReminder[] = [
  {
    id: nextId('rem'),
    parentId: PARENT.id,
    createdBy: GUARDIAN.id,
    title: 'Blood pressure medicine',
    note: 'After breakfast',
    dateISO: iso(0),
    time: '08:30',
    repeat: 'daily',
    status: 'active',
    createdAt: ts(14),
  },
  {
    id: nextId('rem'),
    parentId: PARENT.id,
    createdBy: GUARDIAN.id,
    title: 'Dr. Banerjee appointment',
    note: 'Monthly check-up',
    dateISO: iso(3),
    time: '18:00',
    repeat: 'once',
    status: 'active',
    createdAt: ts(7),
  },
  {
    id: nextId('rem'),
    parentId: PARENT.id,
    createdBy: GUARDIAN.id,
    title: 'Refill diabetes strips',
    note: null,
    dateISO: iso(-2),
    time: '11:00',
    repeat: 'monthly',
    status: 'active',
    createdAt: ts(30),
  },
  {
    id: nextId('rem'),
    parentId: PARENT.id,
    createdBy: PARENT.id,
    title: 'Evening walk',
    note: null,
    dateISO: iso(-1),
    time: '17:30',
    repeat: 'daily',
    status: 'done',
    createdAt: ts(10),
  },
];

const careTeam: CareTeamMember[] = [
  {
    id: nextId('care'),
    parentId: PARENT.id,
    category: 'doctor',
    serviceId: null,
    name: 'Dr. Ashok Banerjee',
    phone: '+913512510101',
    note: 'Family physician, Hakimpara. Mon/Wed/Fri evenings.',
    setBy: GUARDIAN.id,
  },
  {
    id: nextId('care'),
    parentId: PARENT.id,
    category: 'pharmacy',
    serviceId: null,
    name: 'Sen Medical Hall',
    phone: '+913512522233',
    note: 'Home delivery for regular medicines.',
    setBy: GUARDIAN.id,
  },
  {
    id: nextId('care'),
    parentId: PARENT.id,
    category: 'helper',
    serviceId: null,
    name: 'Mamata (day help)',
    phone: '+919800000045',
    note: 'Comes 9am-1pm daily.',
    setBy: GUARDIAN.id,
  },
];

const favorites: FamilyFavorite[] = [
  {
    id: nextId('fav'),
    parentId: PARENT.id,
    serviceId: 'm-demo-hospital',
    name: 'Siliguri District Hospital',
    phone: '+913532585000',
    category: 'hospital',
    note: 'Closest emergency ward',
    addedBy: GUARDIAN.id,
  },
  {
    id: nextId('fav'),
    parentId: PARENT.id,
    serviceId: 'm-demo-grocery',
    name: 'Khan Grocery, Hakimpara',
    phone: '+919832011224',
    category: 'daily_service',
    note: 'Delivers same day before 6pm',
    addedBy: GUARDIAN.id,
  },
];

// ----- Guards ---------------------------------------------------------------

// All demo family data belongs to the parent account. Both the parent (self)
// and the linked guardian may touch it; any other parentId simply has no data
// (canAccess false -> lists return empty, mutations throw).
// Demo failures carry an HTTP-shaped status so the shared UI error mapping
// (friendlyFamilyError) reads them as a server reply rather than a dead network.
function fail(message: string, status = 400): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function canAccess(token: string, parentId: string): boolean {
  const user = demoUserByToken(token);
  if (!user) throw fail('Sign in again.', 401);
  if (parentId !== PARENT.id) return false;
  if (user.id === PARENT.id) return true;
  // Mirrors requireFamilyLink in api/_lib/auth.js: a guardian reaches the
  // parent's data only through a live link, so revoking cuts access off here
  // too rather than leaving the parent detail page working.
  return user.id === link.guardianId && link.status === 'active';
}

function requireAccess(token: string, parentId: string) {
  if (!canAccess(token, parentId)) throw fail('Not allowed.', 403);
}

// ----- Handlers (mirror src/lib/family.ts return shapes) --------------------

// Nothing sends WhatsApp in demo mode, so the link code is fixed and handed
// straight back the way api/family/link.js does under OTP_DEV_ECHO — the
// guardian screen already shows a returned devCode as "Test mode code".
export const DEMO_LINK_CODE = '123456';

function samePhone(a: string, b: string) {
  return a.replace(/\D/g, '') === b.replace(/\D/g, '');
}

export function demoRequestLink(
  token: string,
  input: { parentPhone: string; relationship?: string | null },
): { ok: boolean; devCode?: string } {
  const user = demoUserByToken(token);
  if (!user) throw fail('Sign in again.', 401);
  if (samePhone(input.parentPhone, user.phone)) throw fail('You cannot link your own account.');
  if (!samePhone(input.parentPhone, PARENT.phone)) {
    // Same deliberately vague wording as api/family/link.js: a specific "no
    // account" answer would let anyone probe which numbers use Saathi.
    throw fail('That number cannot be linked right now. Check it with your parent and try again.', 404);
  }
  if (link.status === 'active' && link.guardianId === user.id) {
    throw fail('You are already linked to this parent.');
  }
  link.status = 'pending';
  link.guardianId = user.id;
  link.guardianName = user.fullName;
  link.relationship = input.relationship?.trim() || null;
  link.verifiedAt = null;
  return { ok: true, devCode: DEMO_LINK_CODE };
}

export function demoVerifyLink(
  token: string,
  input: { parentPhone: string; code: string },
): { ok: boolean; link: FamilyLink } {
  const user = demoUserByToken(token);
  if (!user) throw fail('Sign in again.', 401);
  if (link.status !== 'pending' || link.guardianId !== user.id || !samePhone(input.parentPhone, PARENT.phone)) {
    throw fail('Ask for a code first.', 404);
  }
  if (input.code.replace(/\D/g, '') !== DEMO_LINK_CODE) {
    throw fail('That code is not right. Check your parent’s WhatsApp and try again.', 401);
  }
  link.status = 'active';
  link.verifiedAt = new Date().toISOString();
  return { ok: true, link: { ...link } };
}

export function demoListLinks(token: string): { asGuardian: FamilyLink[]; asParent: FamilyLink[] } {
  const user = demoUserByToken(token);
  if (!user) throw fail('Sign in again.', 401);
  return {
    // Mirrors api/family/link.js: the guardian list keeps revoked rows (so the
    // card can show "Removed"), the parent list only shows live access.
    asGuardian: user.id === link.guardianId ? [link] : [],
    asParent: user.id === PARENT.id && link.status === 'active' ? [link] : [],
  };
}

export function demoRevokeLink(token: string, id: string): { ok: boolean } {
  const user = demoUserByToken(token);
  if (!user) throw fail('Sign in again.', 401);
  if (link.id !== id || (user.id !== link.guardianId && user.id !== PARENT.id)) {
    throw fail('Link not found.', 404);
  }
  link.status = 'revoked';
  return { ok: true };
}

export function demoListReminders(token: string, parentId: string): { reminders: FamilyReminder[] } {
  if (!canAccess(token, parentId)) return { reminders: [] };
  return { reminders: [...reminders] };
}

export function demoAddReminder(
  token: string,
  input: {
    parentId: string;
    title: string;
    note?: string | null;
    dateISO: string;
    time?: string | null;
    repeat?: FamilyReminderRepeat;
  },
): { reminder: FamilyReminder } {
  requireAccess(token, input.parentId);
  const user = demoUserByToken(token)!;
  const reminder: FamilyReminder = {
    id: nextId('rem'),
    parentId: input.parentId,
    createdBy: user.id,
    title: input.title,
    note: input.note ?? null,
    dateISO: input.dateISO,
    time: input.time ?? null,
    repeat: input.repeat ?? 'once',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  reminders.unshift(reminder);
  return { reminder };
}

export function demoUpdateReminder(
  token: string,
  input: {
    parentId: string;
    id: string;
    title?: string;
    note?: string | null;
    dateISO?: string;
    time?: string | null;
    repeat?: FamilyReminderRepeat;
  },
): { reminder: FamilyReminder } {
  requireAccess(token, input.parentId);
  const reminder = reminders.find((r) => r.id === input.id);
  if (!reminder) throw fail('Reminder not found.', 404);
  // Only fields the caller sent are touched; the rest keep their value.
  if (input.title !== undefined) reminder.title = input.title;
  if (input.note !== undefined) reminder.note = input.note ?? null;
  if (input.dateISO !== undefined) reminder.dateISO = input.dateISO;
  if (input.time !== undefined) reminder.time = input.time ?? null;
  if (input.repeat !== undefined) reminder.repeat = input.repeat;
  reminder.updatedAt = new Date().toISOString();
  return { reminder };
}

export function demoMarkReminderDone(token: string, parentId: string, id: string): { reminder: FamilyReminder } {
  requireAccess(token, parentId);
  const reminder = reminders.find((r) => r.id === id);
  if (!reminder) throw fail('Reminder not found.', 404);
  reminder.status = 'done';
  return { reminder };
}

export function demoRemoveReminder(token: string, parentId: string, id: string): { ok: boolean } {
  requireAccess(token, parentId);
  const index = reminders.findIndex((r) => r.id === id);
  if (index >= 0) reminders.splice(index, 1);
  return { ok: true };
}

export function demoListCareTeam(token: string, parentId: string): { members: CareTeamMember[] } {
  if (!canAccess(token, parentId)) return { members: [] };
  return { members: [...careTeam] };
}

export function demoSetCareTeamMember(
  token: string,
  input: {
    parentId: string;
    id?: string;
    category: CareTeamCategory;
    name: string;
    phone?: string | null;
    note?: string | null;
    serviceId?: string | null;
  },
): { member: CareTeamMember } {
  requireAccess(token, input.parentId);
  const user = demoUserByToken(token)!;
  if (input.id) {
    const existing = careTeam.find((m) => m.id === input.id);
    if (!existing) throw fail('Contact not found.', 404);
    existing.category = input.category;
    existing.name = input.name;
    existing.phone = input.phone ?? null;
    existing.note = input.note ?? null;
    return { member: existing };
  }
  const member: CareTeamMember = {
    id: nextId('care'),
    parentId: input.parentId,
    category: input.category,
    serviceId: input.serviceId ?? null,
    name: input.name,
    phone: input.phone ?? null,
    note: input.note ?? null,
    setBy: user.id,
  };
  careTeam.unshift(member);
  return { member };
}

export function demoRemoveCareTeamMember(token: string, parentId: string, id: string): { ok: boolean } {
  requireAccess(token, parentId);
  const index = careTeam.findIndex((m) => m.id === id);
  if (index >= 0) careTeam.splice(index, 1);
  return { ok: true };
}

export function demoListFavorites(token: string, parentId: string): { favorites: FamilyFavorite[] } {
  if (!canAccess(token, parentId)) return { favorites: [] };
  return { favorites: [...favorites] };
}

export async function demoAddFavorite(
  token: string,
  input: { parentId: string; serviceId: string; note?: string | null },
): Promise<{ favorite: FamilyFavorite }> {
  requireAccess(token, input.parentId);
  const user = demoUserByToken(token)!;
  if (favorites.some((f) => f.serviceId === input.serviceId)) {
    throw fail('Already saved.');
  }
  // Resolve display fields from the (mock) services catalog.
  const services = await fetchServices().catch(() => []);
  const service = services.find((s) => s.id === input.serviceId);
  const favorite: FamilyFavorite = {
    id: nextId('fav'),
    parentId: input.parentId,
    serviceId: input.serviceId,
    name: service?.name ?? 'Saved place',
    phone: service?.phone ?? null,
    category: service?.category ?? null,
    note: input.note ?? null,
    addedBy: user.id,
  };
  favorites.unshift(favorite);
  return { favorite };
}

export function demoRemoveFavorite(token: string, parentId: string, id: string): { ok: boolean } {
  requireAccess(token, parentId);
  const index = favorites.findIndex((f) => f.id === id);
  if (index >= 0) favorites.splice(index, 1);
  return { ok: true };
}

export function demoParentAnalytics(token: string, parentId: string): ParentAnalytics {
  requireAccess(token, parentId);
  const today = iso(0);
  const active = reminders.filter((r) => r.status === 'active');
  return {
    lastActiveAt: ts(0, 8),
    assistantEvents7d: 6,
    assistantEvents30d: 23,
    callbacks: [
      { status: 'closed', created_at: ts(2), issue: 'Needed a plumber for kitchen tap' },
      { status: 'contacted', created_at: ts(5), issue: 'Asked about cab to SSKM Hospital' },
      { status: 'closed', created_at: ts(12), issue: 'Grocery delivery did not arrive' },
    ],
    reminders: {
      upcoming: active.filter((r) => r.dateISO >= today).length,
      overdue: active.filter((r) => r.dateISO < today).length,
      done7d: reminders.filter((r) => r.status === 'done').length,
    },
    careTeamCount: careTeam.length,
    favoritesCount: favorites.length,
  };
}
