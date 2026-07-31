import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addEvent, listEvents, removeEvent } from './calendar';
import { cancelReminder } from './reminderNotifications';
import {
  listCareTeam,
  listFamilyFavorites,
  listFamilyLinks,
  listFamilyReminders,
} from './family';
import { nextMonthlyISO, todayISO } from './notifications';
import type {
  CareTeamMember,
  FamilyFavorite,
  FamilyLink,
  FamilyReminder,
  ReminderRepeat,
} from './types';

// Pulls the family data a signed-in user needs on their own device: the
// reminders/care team/saved places on their own account, plus the reminders of
// every parent they are a linked guardian for. Active reminders are mirrored
// into the local calendar store so they show on /calendar, in the bell, and as
// on-device alerts. Guardian screens write to the server; this is the read-back.

export interface FamilySyncResult {
  careTeam: CareTeamMember[];
  favorites: FamilyFavorite[];
  guardians: FamilyLink[];
}

const EMPTY: FamilySyncResult = { careTeam: [], favorites: [], guardians: [] };

// What the local store should hold for a family reminder. Every repeat kind is
// storable now, so the repeat carries through and the calendar marks a monthly
// reminder in each later month. Monthly is still dated at its next occurrence:
// expo-notifications has no monthly trigger, so its alert is a one-shot that
// only re-arms because this date moves on the foreground sync after it fires.
function localShape(
  reminder: FamilyReminder,
  today: string,
): { dateISO: string; repeat: ReminderRepeat } {
  return {
    dateISO:
      reminder.repeat === 'monthly' ? nextMonthlyISO(reminder.dateISO, today) : reminder.dateISO,
    repeat: reminder.repeat,
  };
}

// `complete` says whether every server list came back. On a partial fetch the
// reminders we did receive are still mirrored, but nothing is deleted: an empty
// list from a failed request is indistinguishable from "the guardian removed
// everything", and acting on it would cancel a real medicine alert on the
// parent's phone because their bus went through a tunnel.
async function mergeReminders(reminders: FamilyReminder[], complete: boolean) {
  const existing = await listEvents();
  const mirrored = existing.filter((event) => event.serverId);
  const byServerId = new Map(mirrored.map((event) => [event.serverId, event]));
  const activeIds = new Set<string>();
  const today = todayISO();

  for (const reminder of reminders) {
    if (reminder.status !== 'active') continue;
    activeIds.add(reminder.id);
    const current = byServerId.get(reminder.id);
    const { dateISO, repeat } = localShape(reminder, today);
    // Re-mirror when the server row changed so the scheduled alert is not stale;
    // AsyncStorage has no in-place update so we drop the old entry and re-add.
    const stale =
      current &&
      (current.title !== reminder.title ||
        current.dateISO !== dateISO ||
        (current.time ?? null) !== (reminder.time ?? null) ||
        (current.note ?? null) !== (reminder.note ?? null) ||
        (current.repeat ?? 'once') !== repeat);
    if (current && !stale) continue;
    if (current) await removeEvent(current.id);
    await addEvent({
      title: reminder.title,
      dateISO,
      time: reminder.time,
      note: reminder.note,
      repeat,
      serverId: reminder.id,
    });
  }

  // Drop local mirrors whose server row is gone or no longer active. Only safe
  // when the fetch succeeded; see the note on `complete`.
  if (!complete) return;
  for (const event of mirrored) {
    if (event.serverId && !activeIds.has(event.serverId)) {
      await removeEvent(event.id);
    }
  }
}

// Monthly reminders used to be scheduled outside the calendar store and tracked
// under this key. They now live in the store like every other reminder (see
// localShape), so any alert left over from the old path is cancelled once —
// otherwise the device would fire two notifications for the same reminder.
const LEGACY_MONTHLY_KEY = 'saathi.familyMonthly.v1';

async function cancelLegacyMonthlyAlerts() {
  const raw = await AsyncStorage.getItem(LEGACY_MONTHLY_KEY).catch(() => null);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, { notificationId?: string }>;
    for (const entry of Object.values(parsed ?? {})) {
      await cancelReminder(entry?.notificationId);
    }
  } catch {
    // Unreadable leftovers: nothing to cancel, just drop the key below.
  }
  await AsyncStorage.removeItem(LEGACY_MONTHLY_KEY).catch(() => undefined);
}

let cached: FamilySyncResult | null = null;
let inFlight: Promise<FamilySyncResult> | null = null;

// Sync at most once per foreground session: drop the cache on resume so the
// next call re-fetches, but repeated calls within a session reuse the result.
AppState.addEventListener('change', (state) => {
  if (state === 'active') cached = null;
});

// A guardian's reminder rows sit on the parent's account, so the mirrored copy
// says whose day it is — "Ma · Blood pressure medicine" — once more than the
// user's own reminders share the calendar.
function labelReminder(reminder: FamilyReminder, link: FamilyLink): FamilyReminder {
  const who = link.parentName || link.parentPhone;
  return who ? { ...reminder, title: `${who} · ${reminder.title}` } : reminder;
}

async function runSync(token: string, selfId: string): Promise<FamilySyncResult> {
  // Any failed list makes the mirror incomplete, which suppresses the deletion
  // pass in mergeReminders.
  let complete = true;
  const failed = <T>(fallback: T) => (): T => {
    complete = false;
    return fallback;
  };

  const [ownReminders, careTeam, favorites, links] = await Promise.all([
    listFamilyReminders(token, selfId).then((r) => r.reminders).catch(failed<FamilyReminder[]>([])),
    listCareTeam(token, selfId).then((r) => r.members).catch(failed<CareTeamMember[]>([])),
    listFamilyFavorites(token, selfId).then((r) => r.favorites).catch(failed<FamilyFavorite[]>([])),
    listFamilyLinks(token).catch(failed({ asGuardian: [] as FamilyLink[], asParent: [] as FamilyLink[] })),
  ]);

  // Guardians hold no reminders of their own — theirs are the ones they set on
  // the parents they help, so those get mirrored to this device as well.
  const wards = links.asGuardian.filter(
    (link) => link.status === 'active' && link.parentId && link.parentId !== selfId,
  );
  const wardLists = await Promise.all(
    wards.map((link) =>
      listFamilyReminders(token, link.parentId as string)
        .then((r) => r.reminders.map((reminder) => labelReminder(reminder, link)))
        .catch(failed<FamilyReminder[]>([])),
    ),
  );

  // A user who is both parent and guardian can see the same row twice.
  const byId = new Map<string, FamilyReminder>();
  for (const reminder of ownReminders) byId.set(reminder.id, reminder);
  for (const list of wardLists) {
    for (const reminder of list) if (!byId.has(reminder.id)) byId.set(reminder.id, reminder);
  }

  await cancelLegacyMonthlyAlerts().catch(() => undefined);
  await mergeReminders([...byId.values()], complete).catch(() => undefined);
  return { careTeam, favorites, guardians: links.asParent };
}

export async function syncFamilyForSelf(
  token: string | null | undefined,
  userId: string | null | undefined,
): Promise<FamilySyncResult> {
  if (!token || !userId) return EMPTY;
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = runSync(token, userId)
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

// Forces the next sync to hit the network. Used right after a screen writes a
// family reminder so the local mirror (calendar, bell, alert) reflects it now
// instead of on the next foreground.
export async function refreshFamilyForSelf(
  token: string | null | undefined,
  userId: string | null | undefined,
): Promise<FamilySyncResult> {
  cached = null;
  // Let a sync that started before the write finish, then drop its result too —
  // it was read from the server before the new row existed.
  if (inFlight) await inFlight.catch(() => undefined);
  cached = null;
  return syncFamilyForSelf(token, userId);
}

// Sign-out on a shared family tablet must leave nothing of the mirrored family
// behind: the ward rows are someone else's medical reminders, and their OS
// alerts outlive the session that scheduled them. Called from AuthContext for
// the same reason assistant memory is cleared there.
export async function clearFamilyForSelf(): Promise<void> {
  cached = null;
  // A sync already reading the server would re-mirror the rows behind us, so
  // let it finish writing before the mirrors are dropped.
  if (inFlight) await inFlight.catch(() => undefined);
  cached = null;
  const events = await listEvents();
  for (const event of events) {
    // removeEvent cancels the event's scheduled notification as well.
    if (event.serverId) await removeEvent(event.id);
  }
}
