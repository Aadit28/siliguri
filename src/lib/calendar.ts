import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarEvent, ReminderRepeat } from './types';
import { cancelReminder, scheduleReminderWithOutcome } from './reminderNotifications';

const LEGACY_STORAGE_KEY = 'saathi.calendar.v1';
const STORAGE_PREFIX = 'saathi.calendar.v2:';
const GUEST_SCOPE = 'guest';
const LEGACY_MIGRATION_KEY = 'saathi.calendar.v2:migrated-legacy-v1';
const RESTORE_MARKER_PREFIX = 'saathi.calendar.v2:restore-alerts:';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toLocalISODate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// True only for a real calendar date: shape check plus a round-trip through
// Date so rollovers like 2026-02-31 (which JS silently turns into Mar 3) fail.
export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

// Normalizes free-text time ("5 pm", "17:00", "5:30pm") to HH:MM 24h form.
// Returns null when the input cannot be read as a time of day.
export function normalizeTimeInput(value: string): string | null {
  const match = value.trim().toLowerCase().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const meridiem = match[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

// Serializes every read-modify-write cycle on the AsyncStorage key so
// concurrent addEvent/removeEvent calls cannot clobber each other's writes.
let storeQueue: Promise<unknown> = Promise.resolve();

function withStoreLock<T>(task: () => Promise<T>): Promise<T> {
  const run = storeQueue.then(task, task);
  storeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function scopeFor(userId: string | null | undefined) {
  return userId?.trim() || GUEST_SCOPE;
}

function storageKeyFor(userId: string | null | undefined) {
  return `${STORAGE_PREFIX}${scopeFor(userId)}`;
}

function restoreMarkerKeyFor(userId: string) {
  return `${RESTORE_MARKER_PREFIX}${userId}`;
}

function parseStore(raw: string | null): CalendarEvent[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CalendarEvent =>
          item &&
          typeof item === 'object' &&
          typeof item.id === 'string' &&
          typeof item.title === 'string' &&
          typeof item.dateISO === 'string',
      )
      .map((event) => ({
        ...event,
        source: event.source ?? (event.serverId ? 'family_reminder' : 'manual'),
        sourceId: event.sourceId ?? event.serverId ?? null,
        seriesId: event.seriesId ?? null,
        readOnly: event.readOnly ?? false,
        activityId: event.activityId ?? null,
        sourceLabel: event.sourceLabel ?? null,
        sourceUrl: event.sourceUrl ?? null,
        participantId: event.participantId ?? null,
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
        timezone: event.timezone ?? null,
        supplyDays: normalizeSupplyDays(event.supplyDays),
        refillFor: event.refillFor ?? null,
      }));
  } catch {
    return [];
  }
}

// The old key was shared by every account. A signed-in account claims it on
// the first post-upgrade read, which preserves existing reminders without
// leaking them to later accounts. Guest reads can see the old rows but do not
// consume them before AuthContext restores a saved session.
let legacyMigrationPromise: Promise<void> | null = null;

async function runLegacyMigration(userId: string) {
  const migrated = await AsyncStorage.getItem(LEGACY_MIGRATION_KEY);
  if (migrated) return;

  const targetKey = storageKeyFor(userId);
  const [targetRaw, legacyRaw] = await Promise.all([
    AsyncStorage.getItem(targetKey),
    AsyncStorage.getItem(LEGACY_STORAGE_KEY),
  ]);
  const targetEvents = parseStore(targetRaw);
  const legacyEvents = parseStore(legacyRaw);
  const merged = [...targetEvents];
  const knownIds = new Set(targetEvents.map((event) => event.id));
  for (const event of legacyEvents) {
    if (!knownIds.has(event.id)) merged.push(event);
  }

  if (merged.length || targetRaw) {
    await AsyncStorage.setItem(targetKey, JSON.stringify(merged));
  }
  await AsyncStorage.setItem(LEGACY_MIGRATION_KEY, userId);
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
}

async function migrateLegacyStoreOnce(userId: string) {
  if (!legacyMigrationPromise) {
    legacyMigrationPromise = runLegacyMigration(userId).catch((error) => {
      legacyMigrationPromise = null;
      throw error;
    });
  }
  return legacyMigrationPromise;
}

async function readStore(userId: string | null | undefined): Promise<CalendarEvent[]> {
  try {
    if (userId?.trim()) {
      await migrateLegacyStoreOnce(userId.trim());
      return parseStore(await AsyncStorage.getItem(storageKeyFor(userId)));
    }
    const [guestRaw, legacyRaw] = await Promise.all([
      AsyncStorage.getItem(storageKeyFor(null)),
      AsyncStorage.getItem(LEGACY_STORAGE_KEY),
    ]);
    const guestEvents = parseStore(guestRaw);
    const known = new Set(guestEvents.map((event) => event.id));
    return [...guestEvents, ...parseStore(legacyRaw).filter((event) => !known.has(event.id))];
  } catch {
    // Calendar reads are allowed to degrade to an empty view; writes still
    // surface failures to their caller and never erase the stored value.
    return [];
  }
}

async function writeStore(userId: string | null | undefined, events: CalendarEvent[]) {
  await AsyncStorage.setItem(storageKeyFor(userId), JSON.stringify(events));
}

function sortEvents(events: CalendarEvent[]) {
  return [...events].sort((a, b) => {
    if (a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? -1 : 1;
    const aTime = a.time ?? '';
    const bTime = b.time ?? '';
    if (aTime === bTime) return 0;
    return aTime < bTime ? -1 : 1;
  });
}

export async function listEvents(userId: string | null | undefined): Promise<CalendarEvent[]> {
  const events = await readStore(userId);
  return sortEvents(events);
}

export async function addEvent(userId: string | null | undefined, input: {
  title: string;
  dateISO: string;
  time?: string | null;
  note?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  servicePhone?: string | null;
  repeat?: ReminderRepeat;
  // Set when mirroring a parent's family_reminders row so sync can de-dupe.
  serverId?: string | null;
  source?: CalendarEvent['source'];
  sourceId?: string | null;
  seriesId?: string | null;
  readOnly?: boolean;
  activityId?: string | null;
  sourceLabel?: string | null;
  sourceUrl?: string | null;
  participantId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timezone?: string | null;
  supplyDays?: number | null;
  refillFor?: string | null;
}): Promise<CalendarEvent> {
  return withStoreLock(async () => {
    const events = await readStore(userId);
    const event: CalendarEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: input.title,
      dateISO: input.dateISO,
      time: input.time ?? null,
      note: input.note ?? null,
      serviceId: input.serviceId ?? null,
      serviceName: input.serviceName ?? null,
      servicePhone: input.servicePhone ?? null,
      createdAt: Date.now(),
      repeat: input.repeat ?? 'once',
      notificationId: null,
      serverId: input.serverId ?? null,
      source: input.source ?? 'manual',
      sourceId: input.sourceId ?? input.serverId ?? null,
      seriesId: input.seriesId ?? null,
      readOnly: input.readOnly ?? false,
      activityId: input.activityId ?? null,
      sourceLabel: input.sourceLabel ?? null,
      sourceUrl: input.sourceUrl ?? null,
      participantId: input.participantId ?? null,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      timezone: input.timezone ?? null,
      supplyDays: normalizeSupplyDays(input.supplyDays),
      refillFor: input.refillFor ?? null,
    };
    events.push(event);
    // Persist before scheduling: a failed write after scheduling would orphan
    // an uncancellable repeating OS notification.
    await writeStore(userId, events);
    // Scheduling lives here so every entry point (calendar screen, quick-add
    // sheet, assistant) gets the OS alert without repeating the wiring.
    const outcome = await scheduleReminderWithOutcome(event);
    if (outcome.ok) {
      event.notificationId = outcome.notificationId;
      try {
        await writeStore(userId, events);
      } catch {
        // Could not record the id: cancel so the notification isn't orphaned.
        await cancelReminder(outcome.notificationId);
        event.notificationId = null;
      }
    } else {
      // The row is saved either way, but the caller must be able to tell the
      // user their phone will not ring. Not persisted: it describes this
      // attempt on this device, not the reminder.
      event.alertProblem = outcome.reason;
    }
    return event;
  });
}

export async function removeEvent(userId: string | null | undefined, id: string): Promise<void> {
  return withStoreLock(async () => {
    const events = await readStore(userId);
    // The reorder nudge only makes sense next to the medicine it covers, so it
    // goes with it. Deleting the nudge alone leaves the medicine untouched.
    const doomed = events.filter((event) => event.id === id || event.refillFor === id);
    if (!doomed.length) return;
    const doomedIds = new Set(doomed.map((event) => event.id));
    await Promise.all(doomed.map((event) => cancelReminder(event.notificationId)));
    await writeStore(userId, events.filter((event) => !doomedIds.has(event.id)));
  });
}

export async function cancelScopedEventNotifications(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  return withStoreLock(async () => {
    const events = await readStore(userId);
    const withNotifications = events.filter((event) => Boolean(event.notificationId));
    if (!withNotifications.length) return;

    // Write a durable recovery marker BEFORE cancelling anything. If this
    // write fails, abort with every alert still intact. If a later calendar
    // write fails, sign-in sees the marker and reschedules instead of trusting
    // stale notification ids whose OS alerts were already cancelled.
    await AsyncStorage.setItem(
      restoreMarkerKeyFor(userId),
      JSON.stringify({ requestedAt: Date.now() }),
    );
    await Promise.all(withNotifications.map((event) => cancelReminder(event.notificationId)));
    await writeStore(
      userId,
      events.map((event) =>
        event.notificationId ? { ...event, notificationId: null } : event,
      ),
    );
  });
}

// Sign-out cancels every alert owned by that account so a shared phone cannot
// keep announcing somebody else's private reminders. When the same account
// signs in again, restore alerts for its still-current stored rows. Persist all
// newly issued ids as one write; if that write fails, cancel the new alerts so
// none become orphaned and impossible to revoke later.
export async function restoreScopedEventNotifications(
  userId: string | null | undefined,
): Promise<{
  problems: Array<{
    eventId: string;
    reason: 'permission' | 'failed';
  }>;
}> {
  if (!userId) return { problems: [] };
  return withStoreLock(async () => {
    const events = await readStore(userId);
    const forceRestore = Boolean(await AsyncStorage.getItem(restoreMarkerKeyFor(userId)));
    const newlyScheduled: string[] = [];
    const problems: Array<{ eventId: string; reason: 'permission' | 'failed' }> = [];

    if (forceRestore) {
      // The stored ids may describe alerts cancelled just before an interrupted
      // write. Cancel is idempotent; clear every id in memory before rebuilding.
      await Promise.all(events.map((event) => cancelReminder(event.notificationId)));
      for (const event of events) event.notificationId = null;
    }

    for (const event of events) {
      if (event.notificationId) continue;
      const outcome = await scheduleReminderWithOutcome(event);
      if (!outcome.ok) {
        // Past one-offs need no alert and web has no native notification
        // surface. Permission/driver failures on a supported device must be
        // returned so AuthContext can tell the user instead of failing silently.
        if (outcome.reason === 'permission' || outcome.reason === 'failed') {
          problems.push({ eventId: event.id, reason: outcome.reason });
        }
        continue;
      }
      event.notificationId = outcome.notificationId;
      newlyScheduled.push(outcome.notificationId);
    }

    try {
      if (forceRestore || newlyScheduled.length) await writeStore(userId, events);
      if (forceRestore) await AsyncStorage.removeItem(restoreMarkerKeyFor(userId));
    } catch (error) {
      await Promise.all(newlyScheduled.map((id) => cancelReminder(id)));
      throw error;
    }
    return { problems };
  });
}

export function parseWhenToDate(when: string): { dateISO: string; time: string | null } {
  const normalized = when.toLowerCase();
  const now = new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\btomorrow\b/.test(normalized)) {
    target.setDate(target.getDate() + 1);
  } else if (/\btoday\b|\btonight\b/.test(normalized)) {
    // target stays as today
  } else {
    const weekdayMatch = WEEKDAYS.findIndex((day) => normalized.includes(day));
    if (weekdayMatch >= 0) {
      const currentDay = target.getDay();
      let diff = weekdayMatch - currentDay;
      if (diff <= 0) diff += 7;
      target.setDate(target.getDate() + diff);
    } else {
      target.setDate(target.getDate() + 1);
    }
  }

  const timeMatch = normalized.match(/(\d{1,2})(?::(\d{2}))?\s?(am|pm)/i);
  let time: string | null = null;
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    time = `${pad(hour)}:${pad(minute)}`;
  }

  return { dateISO: toLocalISODate(target), time };
}

function addDaysToISO(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

// True when a reminder lands on the given local date. A repeating reminder
// recurs from its stored start date: daily on every later day, weekly on the
// same weekday, monthly on the same day-of-month. Months with no such day (the
// 31st in April) are skipped rather than rolled forward, matching how
// familySync picks a monthly reminder's next date.
export function occursOnDate(event: CalendarEvent, dateISO: string): boolean {
  const repeat: ReminderRepeat = event.repeat ?? 'once';
  if (repeat === 'once') return event.dateISO === dateISO;

  const [startYear, startMonth, startDay] = event.dateISO.split('-').map(Number);
  const [year, month, day] = dateISO.split('-').map(Number);
  if (!startYear || !startMonth || !startDay || !year || !month || !day) return false;

  const start = new Date(startYear, startMonth - 1, startDay);
  const cell = new Date(year, month - 1, day);
  if (cell.getTime() < start.getTime()) return false;

  if (repeat === 'daily') return true;
  if (repeat === 'weekly') return cell.getDay() === start.getDay();
  if (repeat === 'monthly') return day === startDay;
  return false;
}

// The first date at or after `fromISO` that this reminder lands on, or null
// when it has none left — a one-off whose day has passed. The scan is bounded
// to a year because every repeat pattern recurs inside that window, including a
// monthly reminder on the 31st, which only some months have.
export function nextOccurrenceISO(event: CalendarEvent, fromISO: string): string | null {
  const repeat: ReminderRepeat = event.repeat ?? 'once';
  if (repeat === 'once') return event.dateISO >= fromISO ? event.dateISO : null;
  if (event.dateISO >= fromISO) return event.dateISO;
  for (let offset = 0; offset <= 366; offset++) {
    const candidate = addDaysToISO(fromISO, offset);
    if (occursOnDate(event, candidate)) return candidate;
  }
  return null;
}

// How many days before the last dose the reorder reminder fires. Three days is
// enough for a Siliguri pharmacy delivery without the nudge landing so early
// that it is forgotten.
export const REFILL_LEAD_DAYS = 3;

// Days of stock, not doses. Counting "14 uses" would need per-dose logging the
// app does not have, so a typed count is read as days. Bounded so a slipped
// keypress ("300" for "30") cannot park a reminder a lifetime away.
export function normalizeSupplyDays(value: unknown): number | null {
  const days = Math.floor(Number(value));
  if (!Number.isFinite(days) || days < 1) return null;
  return Math.min(days, 365);
}

export function supplyRunsOutISO(startISO: string, supplyDays: number): string {
  return addDaysToISO(startISO, supplyDays);
}

// The reorder nudge sits a few days before the stock runs out, but never before
// the reminder itself starts: a two-day supply must not ask for a refill in the
// past, where the alert would be dropped as already-fired.
export function refillDateISO(startISO: string, supplyDays: number): string {
  const lead = Math.min(REFILL_LEAD_DAYS, Math.max(supplyDays - 1, 0));
  return addDaysToISO(startISO, supplyDays - lead);
}

export function formatReadableDate(dateISO: string): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return dateISO;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const [year, month, day] = event.dateISO.split('-');
  let dates: string;
  const canonicalStart = event.startsAt ? new Date(event.startsAt) : null;
  const canonicalEnd = event.endsAt ? new Date(event.endsAt) : null;
  if (canonicalStart && Number.isFinite(canonicalStart.getTime())) {
    const end =
      canonicalEnd && Number.isFinite(canonicalEnd.getTime()) && canonicalEnd > canonicalStart
        ? canonicalEnd
        : new Date(canonicalStart.getTime() + 60 * 60 * 1000);
    const compactUtc = (value: Date) =>
      value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    dates = `${compactUtc(canonicalStart)}/${compactUtc(end)}`;
  } else if (event.time) {
    const [hour, minute] = event.time.split(':');
    const start = `${year}${month}${day}T${hour}${minute}00`;
    const endDate = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
    endDate.setHours(endDate.getHours() + 1);
    const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
    dates = `${start}/${end}`;
  } else {
    const endISO = addDaysToISO(event.dateISO, 1).replace(/-/g, '');
    dates = `${year}${month}${day}/${endISO}`;
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates,
    details: event.note ?? '',
  });
  if (event.timezone) params.set('ctz', event.timezone);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
