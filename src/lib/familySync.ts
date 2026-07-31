import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addEvent, listEvents, removeEvent } from './calendar';
import { cancelReminder, scheduleReminder } from './reminderNotifications';
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

// The local calendar store only models once/daily/weekly, so monthly family
// reminders never flow through it — they are scheduled directly (see
// syncMonthlyReminders). Anything reaching here is one of the three it can hold.
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
    // Monthly reminders are scheduled outside the calendar store; skipping them
    // here also lets the cleanup pass below drop a stale mirror left behind when
    // a reminder's repeat was changed from weekly/daily to monthly.
    if (reminder.repeat === 'monthly') continue;
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

// expo-notifications has no native monthly repeat, so monthly reminders can't
// live in the calendar store (its CalendarEvent.repeat is once/daily/weekly).
// They are scheduled straight through scheduleReminder — which computes the next
// month's occurrence as a one-shot and is refreshed on every foreground sync —
// and their notification ids are tracked here so they can be cancelled/replaced.
const MONTHLY_KEY = 'saathi.familyMonthly.v1';

type MonthlyEntry = { notificationId: string; sig: string };
type MonthlyMap = Record<string, MonthlyEntry>;

// Fingerprint of the fields that affect the scheduled alert; an unchanged
// signature means the OS notification is still correct and can be left alone.
function reminderSignature(reminder: FamilyReminder) {
  return [reminder.title, reminder.dateISO, reminder.time ?? '', reminder.note ?? ''].join('|');
}

async function readMonthlyMap(): Promise<MonthlyMap> {
  try {
    const raw = await AsyncStorage.getItem(MONTHLY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as MonthlyMap) : {};
  } catch {
    return {};
  }
}

async function syncMonthlyReminders(reminders: FamilyReminder[]) {
  const map = await readMonthlyMap();
  const active = reminders.filter((r) => r.status === 'active' && r.repeat === 'monthly');
  const activeIds = new Set(active.map((r) => r.id));

  for (const reminder of active) {
    const sig = reminderSignature(reminder);
    const current = map[reminder.id];
    if (current && current.sig === sig) continue;
    if (current) await cancelReminder(current.notificationId);
    const notificationId = await scheduleReminder({
      id: `family-${reminder.id}`,
      title: reminder.title,
      dateISO: reminder.dateISO,
      time: reminder.time,
      note: reminder.note,
      repeat: 'monthly',
    });
    // Only record a successful schedule; a null (past date, web, or permission
    // not yet granted) is left untracked so the next foreground sync retries.
    if (notificationId) map[reminder.id] = { notificationId, sig };
    else delete map[reminder.id];
  }

  // Cancel alerts for reminders no longer active/monthly.
  for (const id of Object.keys(map)) {
    if (!activeIds.has(id)) {
      await cancelReminder(map[id].notificationId);
      delete map[id];
    }
  }

  await AsyncStorage.setItem(MONTHLY_KEY, JSON.stringify(map)).catch(() => undefined);
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
  await syncMonthlyReminders(reminders).catch(() => undefined);
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
