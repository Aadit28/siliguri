import { backendRequest } from './backend';
import { isValidISODate } from './calendar';
import type {
  CareTeamCategory,
  CareTeamMember,
  FamilyFavorite,
  FamilyLink,
  FamilyReminder,
  FamilyReminderRepeat,
  ParentAnalytics,
} from './types';
import {
  demoAddFavorite,
  demoAddReminder,
  demoGetShareCode,
  demoJoinByCode,
  demoRotateShareCode,
  demoListCareTeam,
  demoListFavorites,
  demoListLinks,
  demoListReminders,
  demoMarkReminderDone,
  demoParentAnalytics,
  demoRemoveCareTeamMember,
  demoRemoveFavorite,
  demoRemoveReminder,
  demoRequestLink,
  demoRevokeLink,
  demoSetCareTeamMember,
  demoUpdateReminder,
  demoVerifyLink,
  isDemoToken,
} from './demoFamily';

// Typed wrappers over the /api/family/* action endpoints. Each throws on
// failure (backendRequest rejects with the server's { error } message).
// Demo sessions (offline demo accounts) are served from the in-memory store in
// demoFamily.ts instead of the network.

// A wrongly-ordered date ("31-07-2026") passes the server's column type but no
// recurrence helper can read it, so the reminder silently never fires. Rejected
// before it leaves the device, shaped like a 400 from our own handlers so
// friendlyFamilyError shows the sentence as-is.
function assertISODate(dateISO: string) {
  if (!isValidISODate(dateISO)) {
    throw Object.assign(new Error('Use a date like 2026-08-15.'), { status: 400 });
  }
}

// ----- Links -----

export async function requestFamilyLink(
  token: string,
  input: { parentPhone: string; relationship?: string | null },
): Promise<{ ok: boolean; devCode?: string }> {
  if (isDemoToken(token)) return demoRequestLink(token, input);
  return backendRequest('/api/family/link', {
    method: 'POST',
    token,
    body: { action: 'request', ...input },
  });
}

export async function verifyFamilyLink(
  token: string,
  input: { parentPhone: string; code: string },
): Promise<{ ok: boolean; link: FamilyLink }> {
  if (isDemoToken(token)) return demoVerifyLink(token, input);
  return backendRequest('/api/family/link', {
    method: 'POST',
    token,
    body: { action: 'verify', ...input },
  });
}

export async function listFamilyLinks(
  token: string,
): Promise<{ asGuardian: FamilyLink[]; asParent: FamilyLink[] }> {
  if (isDemoToken(token)) return demoListLinks(token);
  return backendRequest('/api/family/link', {
    method: 'POST',
    token,
    body: { action: 'list' },
  });
}

export async function revokeFamilyLink(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  if (isDemoToken(token)) return demoRevokeLink(token, id);
  return backendRequest('/api/family/link', {
    method: 'POST',
    token,
    body: { action: 'revoke', id },
  });
}

// ----- Account share codes -----

export type ShareCode = { code: string; grouped: string };

export type JoinRelationship =
  | 'son'
  | 'daughter'
  | 'spouse'
  | 'sibling'
  | 'friend'
  | 'caregiver'
  | 'other';

export async function getShareCode(token: string): Promise<ShareCode> {
  if (isDemoToken(token)) return demoGetShareCode(token);
  return backendRequest('/api/family/code', {
    method: 'POST',
    token,
    body: { action: 'get' },
  });
}

export async function rotateShareCode(token: string): Promise<ShareCode> {
  if (isDemoToken(token)) return demoRotateShareCode(token);
  return backendRequest('/api/family/code', {
    method: 'POST',
    token,
    body: { action: 'rotate' },
  });
}

export async function joinByCode(
  token: string,
  input: { code: string; relationship: JoinRelationship },
): Promise<{ ok: boolean; link: FamilyLink }> {
  if (isDemoToken(token)) return demoJoinByCode(token, input);
  return backendRequest('/api/family/code', {
    method: 'POST',
    token,
    body: { action: 'join', ...input },
  });
}

// Fire-and-forget family alert when the parent presses SOS. Never awaited on
// the emergency path and never throws — the dial must not wait on the network.
export function notifyFamilySos(token: string): void {
  if (!token || isDemoToken(token)) return;
  void backendRequest('/api/family/sos', { method: 'POST', token }).catch(() => undefined);
}

// ----- Reminders -----

export async function listFamilyReminders(
  token: string,
  parentId: string,
): Promise<{ reminders: FamilyReminder[] }> {
  if (isDemoToken(token)) return demoListReminders(token, parentId);
  return backendRequest('/api/family/reminders', {
    method: 'POST',
    token,
    body: { action: 'list', parentId },
  });
}

export async function addFamilyReminder(
  token: string,
  input: {
    parentId: string;
    title: string;
    note?: string | null;
    dateISO: string;
    time?: string | null;
    repeat?: FamilyReminderRepeat;
  },
): Promise<{ reminder: FamilyReminder }> {
  assertISODate(input.dateISO);
  if (isDemoToken(token)) return demoAddReminder(token, input);
  return backendRequest('/api/family/reminders', {
    method: 'POST',
    token,
    body: { action: 'add', ...input },
  });
}

export async function updateFamilyReminder(
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
): Promise<{ reminder: FamilyReminder }> {
  if (input.dateISO !== undefined) assertISODate(input.dateISO);
  if (isDemoToken(token)) return demoUpdateReminder(token, input);
  return backendRequest('/api/family/reminders', {
    method: 'POST',
    token,
    body: { action: 'update', ...input },
  });
}

export async function markFamilyReminderDone(
  token: string,
  input: { parentId: string; id: string },
): Promise<{ reminder: FamilyReminder }> {
  if (isDemoToken(token)) return demoMarkReminderDone(token, input.parentId, input.id);
  return backendRequest('/api/family/reminders', {
    method: 'POST',
    token,
    body: { action: 'done', ...input },
  });
}

export async function removeFamilyReminder(
  token: string,
  input: { parentId: string; id: string },
): Promise<{ ok: boolean }> {
  if (isDemoToken(token)) return demoRemoveReminder(token, input.parentId, input.id);
  return backendRequest('/api/family/reminders', {
    method: 'POST',
    token,
    body: { action: 'remove', ...input },
  });
}

// ----- Care team -----

export async function listCareTeam(
  token: string,
  parentId: string,
): Promise<{ members: CareTeamMember[] }> {
  if (isDemoToken(token)) return demoListCareTeam(token, parentId);
  return backendRequest('/api/family/care-team', {
    method: 'POST',
    token,
    body: { action: 'list', parentId },
  });
}

export async function setCareTeamMember(
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
): Promise<{ member: CareTeamMember }> {
  if (isDemoToken(token)) return demoSetCareTeamMember(token, input);
  return backendRequest('/api/family/care-team', {
    method: 'POST',
    token,
    body: { action: 'set', ...input },
  });
}

export async function removeCareTeamMember(
  token: string,
  input: { parentId: string; id: string },
): Promise<{ ok: boolean }> {
  if (isDemoToken(token)) return demoRemoveCareTeamMember(token, input.parentId, input.id);
  return backendRequest('/api/family/care-team', {
    method: 'POST',
    token,
    body: { action: 'remove', ...input },
  });
}

// ----- Favorites -----

export async function listFamilyFavorites(
  token: string,
  parentId: string,
): Promise<{ favorites: FamilyFavorite[] }> {
  if (isDemoToken(token)) return demoListFavorites(token, parentId);
  return backendRequest('/api/family/favorites', {
    method: 'POST',
    token,
    body: { action: 'list', parentId },
  });
}

export async function addFamilyFavorite(
  token: string,
  input: { parentId: string; serviceId: string; note?: string | null },
): Promise<{ favorite: FamilyFavorite }> {
  if (isDemoToken(token)) return demoAddFavorite(token, input);
  return backendRequest('/api/family/favorites', {
    method: 'POST',
    token,
    body: { action: 'add', ...input },
  });
}

export async function removeFamilyFavorite(
  token: string,
  input: { parentId: string; id: string },
): Promise<{ ok: boolean }> {
  if (isDemoToken(token)) return demoRemoveFavorite(token, input.parentId, input.id);
  return backendRequest('/api/family/favorites', {
    method: 'POST',
    token,
    body: { action: 'remove', ...input },
  });
}

// ----- Analytics -----

export async function fetchParentAnalytics(
  token: string,
  parentId: string,
): Promise<ParentAnalytics> {
  if (isDemoToken(token)) return demoParentAnalytics(token, parentId);
  return backendRequest('/api/family/analytics', {
    method: 'POST',
    token,
    body: { action: 'summary', parentId },
  });
}

// ----- Error copy -----

// Turns a rejected family call into copy a family member can act on. Raw
// messages ("TypeError: fetch failed", a Postgres constraint name) must never
// reach the screen. backendRequest attaches the HTTP status; a failure with no
// status never reached the server (offline, DNS, server down).
export function friendlyFamilyError(
  e: unknown,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const err = e as Error & { status?: number };
  const status = err?.status;
  const message = err?.message ?? '';
  if (status === undefined) return t('family.errorNetwork');
  if (status === 401) return t('family.errorSignIn');
  if (status === 403 || status === 404) return t('family.errorNotLinked');
  if (status === 429) return t('family.errorTooManyTries');
  // 503 is the one server state worth its own sentence: the account-code
  // migration has not been applied yet, so "try again later" is true advice and
  // "something went wrong" would send people hunting for a mistake they made.
  if (status === 503) return t('family.errorCodeNotReady');
  if (status >= 500) return t('family.errorGeneric');
  // 4xx from our own handlers carry a short, already-friendly sentence.
  return message && message.length <= 120 ? message : t('family.errorGeneric');
}
