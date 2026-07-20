import { AppState } from 'react-native';
import { addEvent, listEvents, removeEvent } from './calendar';
import {
  listCareTeam,
  listFamilyFavorites,
  listFamilyLinks,
  listFamilyReminders,
} from './family';
import type {
  CareTeamMember,
  FamilyFavorite,
  FamilyLink,
  FamilyReminder,
  ReminderRepeat,
} from './types';

// Pulls a signed-in user's own family data (the parent calling for self) and
// mirrors their active reminders into the local calendar store so alerts fire
// on-device. Guardian screens write to the server; this is the read-back path.

export interface FamilySyncResult {
  careTeam: CareTeamMember[];
  favorites: FamilyFavorite[];
  guardians: FamilyLink[];
}

const EMPTY: FamilySyncResult = { careTeam: [], favorites: [], guardians: [] };

// Local scheduling only understands once/daily/weekly; a monthly family
// reminder lands as a single-date entry rather than being dropped.
function toLocalRepeat(repeat: FamilyReminder['repeat']): ReminderRepeat {
  return repeat === 'daily' || repeat === 'weekly' ? repeat : 'once';
}

async function mergeReminders(reminders: FamilyReminder[]) {
  const existing = await listEvents();
  const mirrored = existing.filter((event) => event.serverId);
  const byServerId = new Map(mirrored.map((event) => [event.serverId, event]));
  const activeIds = new Set<string>();

  for (const reminder of reminders) {
    if (reminder.status !== 'active') continue;
    activeIds.add(reminder.id);
    const current = byServerId.get(reminder.id);
    const repeat = toLocalRepeat(reminder.repeat);
    // Re-mirror when the server row changed so the scheduled alert is not stale;
    // AsyncStorage has no in-place update so we drop the old entry and re-add.
    const stale =
      current &&
      (current.title !== reminder.title ||
        current.dateISO !== reminder.dateISO ||
        (current.time ?? null) !== (reminder.time ?? null) ||
        (current.note ?? null) !== (reminder.note ?? null) ||
        (current.repeat ?? 'once') !== repeat);
    if (current && !stale) continue;
    if (current) await removeEvent(current.id);
    await addEvent({
      title: reminder.title,
      dateISO: reminder.dateISO,
      time: reminder.time,
      note: reminder.note,
      repeat,
      serverId: reminder.id,
    });
  }

  // Drop local mirrors whose server row is gone or no longer active.
  for (const event of mirrored) {
    if (event.serverId && !activeIds.has(event.serverId)) {
      await removeEvent(event.id);
    }
  }
}

let cached: FamilySyncResult | null = null;
let inFlight: Promise<FamilySyncResult> | null = null;

// Sync at most once per foreground session: drop the cache on resume so the
// next call re-fetches, but repeated calls within a session reuse the result.
AppState.addEventListener('change', (state) => {
  if (state === 'active') cached = null;
});

async function runSync(token: string, parentId: string): Promise<FamilySyncResult> {
  const [reminders, careTeam, favorites, links] = await Promise.all([
    listFamilyReminders(token, parentId).then((r) => r.reminders).catch(() => []),
    listCareTeam(token, parentId).then((r) => r.members).catch(() => []),
    listFamilyFavorites(token, parentId).then((r) => r.favorites).catch(() => []),
    listFamilyLinks(token).then((r) => r.asParent).catch(() => []),
  ]);
  await mergeReminders(reminders).catch(() => undefined);
  return { careTeam, favorites, guardians: links };
}

export async function syncFamilyForSelf(
  token: string | null | undefined,
  parentId: string | null | undefined,
): Promise<FamilySyncResult> {
  if (!token || !parentId) return EMPTY;
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = runSync(token, parentId)
    .then((result) => {
      cached = result;
      return result;
    })
    .catch(() => EMPTY)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
