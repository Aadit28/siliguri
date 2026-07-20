import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarEvent, ReminderRepeat } from './types';
import { cancelReminder, scheduleReminder } from './reminderNotifications';

const STORAGE_KEY = 'saathi.calendar.v1';

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

async function readStore(): Promise<CalendarEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CalendarEvent =>
        item && typeof item === 'object' && typeof item.id === 'string' && typeof item.dateISO === 'string',
    );
  } catch {
    return [];
  }
}

async function writeStore(events: CalendarEvent[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
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

export async function listEvents(): Promise<CalendarEvent[]> {
  const events = await readStore();
  return sortEvents(events);
}

export async function addEvent(input: {
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
}): Promise<CalendarEvent> {
  return withStoreLock(async () => {
    const events = await readStore();
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
    };
    events.push(event);
    // Persist before scheduling: a failed write after scheduling would orphan
    // an uncancellable repeating OS notification.
    await writeStore(events);
    // Scheduling lives here so every entry point (calendar screen, quick-add
    // sheet, assistant) gets the OS alert without repeating the wiring.
    const notificationId = await scheduleReminder(event);
    if (notificationId) {
      event.notificationId = notificationId;
      try {
        await writeStore(events);
      } catch {
        // Could not record the id — cancel so the notification isn't orphaned.
        await cancelReminder(notificationId);
        event.notificationId = null;
      }
    }
    return event;
  });
}

export async function removeEvent(id: string): Promise<void> {
  return withStoreLock(async () => {
    const events = await readStore();
    const doomed = events.find((event) => event.id === id);
    await cancelReminder(doomed?.notificationId);
    await writeStore(events.filter((event) => event.id !== id));
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

export function googleCalendarUrl(event: CalendarEvent): string {
  const [year, month, day] = event.dateISO.split('-');
  let dates: string;
  if (event.time) {
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

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
