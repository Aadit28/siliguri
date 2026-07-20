import { CalendarEvent } from './types';
import { toLocalISODate } from './calendar';

export type NotificationTone = 'overdue' | 'today' | 'soon';

export type NotificationItem = {
  id: string;
  title: string;
  dateISO: string;
  time: string | null;
  tone: NotificationTone;
};

// How far ahead a saved reminder starts showing up in the bell.
export const NOTIFICATION_HORIZON_DAYS = 7;

function shiftISO(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return toLocalISODate(date);
}

export function todayISO() {
  return toLocalISODate(new Date());
}

export function formatEventWhen(dateISO: string, time?: string | null) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  if (Number.isNaN(date.getTime())) return dateISO;
  const label = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${label} · ${time}` : label;
}

function weekdayOf(dateISO: string) {
  const [year, month, day] = dateISO.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

// A repeating reminder's stored dateISO is only its start; what matters on
// screen is the next time it actually fires.
export function nextOccurrenceISO(event: CalendarEvent, reference = todayISO()) {
  const repeat = event.repeat ?? 'once';
  if (repeat === 'once' || event.dateISO >= reference) return event.dateISO;
  if (repeat === 'daily') return reference;
  const target = weekdayOf(event.dateISO);
  const offset = (target - weekdayOf(reference) + 7) % 7;
  return shiftISO(reference, offset);
}

// Reminders are the only real notification source today: anything already due
// or landing inside the horizon. Sorted so overdue items surface first.
export function buildNotifications(events: CalendarEvent[], reference = todayISO()): NotificationItem[] {
  const horizon = shiftISO(reference, NOTIFICATION_HORIZON_DAYS);
  return events
    .map((event) => ({ event, dateISO: nextOccurrenceISO(event, reference) }))
    .filter(({ dateISO }) => dateISO <= horizon)
    .map<NotificationItem>(({ event, dateISO }) => ({
      id: event.id,
      title: event.title,
      dateISO,
      time: event.time ?? null,
      tone: dateISO < reference ? 'overdue' : dateISO === reference ? 'today' : 'soon',
    }))
    .sort((a, b) =>
      a.dateISO === b.dateISO
        ? (a.time ?? '').localeCompare(b.time ?? '')
        : a.dateISO.localeCompare(b.dateISO),
    );
}

// Returns each event paired with the date it will next fire, soonest first.
export function upcomingEvents(events: CalendarEvent[], limit = 3, reference = todayISO()) {
  return events
    .map((event) => ({ event, dateISO: nextOccurrenceISO(event, reference) }))
    .filter(({ dateISO }) => dateISO >= reference)
    .sort((a, b) =>
      a.dateISO === b.dateISO
        ? (a.event.time ?? '').localeCompare(b.event.time ?? '')
        : a.dateISO.localeCompare(b.dateISO),
    )
    .slice(0, limit);
}
