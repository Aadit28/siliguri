import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarEvent } from './types';

const STORAGE_KEY = 'saathi.calendar.v1';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toLocalISODate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
}): Promise<CalendarEvent> {
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
  };
  events.push(event);
  await writeStore(events);
  return event;
}

export async function removeEvent(id: string): Promise<void> {
  const events = await readStore();
  await writeStore(events.filter((event) => event.id !== id));
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
