import { backendRequest } from './backend';
import type {
  CareTeamCategory,
  CareTeamMember,
  FamilyFavorite,
  FamilyLink,
  FamilyReminder,
  FamilyReminderRepeat,
  ParentAnalytics,
} from './types';

// Typed wrappers over the /api/family/* action endpoints. Each throws on
// failure (backendRequest rejects with the server's { error } message).

// ----- Links -----

export async function requestFamilyLink(
  token: string,
  input: { parentPhone: string; relationship?: string | null },
): Promise<{ ok: boolean; devCode?: string }> {
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
  return backendRequest('/api/family/link', {
    method: 'POST',
    token,
    body: { action: 'verify', ...input },
  });
}

export async function listFamilyLinks(
  token: string,
): Promise<{ asGuardian: FamilyLink[]; asParent: FamilyLink[] }> {
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
  return backendRequest('/api/family/link', {
    method: 'POST',
    token,
    body: { action: 'revoke', id },
  });
}

// ----- Reminders -----

export async function listFamilyReminders(
  token: string,
  parentId: string,
): Promise<{ reminders: FamilyReminder[] }> {
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
  return backendRequest('/api/family/analytics', {
    method: 'POST',
    token,
    body: { action: 'summary', parentId },
  });
}
