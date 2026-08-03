// Dates the parent's way. A senior using Saathi lives in Asia/Kolkata (UTC+5:30,
// no DST); a guardian may be reading this from anywhere. Every "day" the family
// screens compare — a reminder's due date, an activity stamp, "yesterday" — is
// the parent's calendar day, so all of it is anchored to IST rather than to the
// viewer's zone or to UTC. Offsetting an instant by +5:30 and reading its UTC
// parts yields the Kolkata wall-clock date without needing Intl timeZone data.
import { todayISO } from './notifications';

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function pad(value: number) {
  return String(value).padStart(2, '0');
}

// month is 0-based, matching Date.
export function toISO(year: number, month: number, day: number) {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

// Buckets an absolute timestamp into the parent's calendar day.
export function istDateISO(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const k = new Date(d.getTime() + IST_OFFSET_MS);
  return toISO(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
}

// Renders an absolute server timestamp as the parent's own Kolkata wall time,
// labelled IST so a guardian abroad reads no ambiguity into the numbers.
export function formatISTStamp(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const k = new Date(d.getTime() + IST_OFFSET_MS);
  const period = k.getUTCHours() < 12 ? 'AM' : 'PM';
  const hour12 = k.getUTCHours() % 12 === 0 ? 12 : k.getUTCHours() % 12;
  return `${k.getUTCDate()} ${MONTHS_SHORT[k.getUTCMonth()]} ${k.getUTCFullYear()}, ${hour12}:${pad(
    k.getUTCMinutes(),
  )} ${period} IST`;
}

export function relativeDayLabel(iso: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const dayISO = istDateISO(iso);
  if (!dayISO) return null;
  return relativeDayLabelFromISO(dayISO, t);
}

// Same wording for a plain calendar day (a reminder's dateISO) as for a stamp.
export function relativeDayLabelFromISO(
  dayISO: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
) {
  const [y, m, d] = dayISO.split('-').map(Number);
  const [ty, tm, td] = todayISO().split('-').map(Number);
  const diff = Math.round((Date.UTC(ty, (tm || 1) - 1, td || 1) - Date.UTC(y, (m || 1) - 1, d || 1)) / 86400000);
  // A future stamp only happens on clock skew; it is still "today" to a reader.
  if (diff <= 0) return t('family.tile.today');
  if (diff === 1) return t('family.tile.yesterday');
  return t('family.tile.daysAgo', { days: diff });
}

// Days between two calendar days, positive when `later` is after `earlier`.
export function daysBetweenISO(earlier: string, later: string) {
  const [ay, am, ad] = earlier.split('-').map(Number);
  const [by, bm, bd] = later.split('-').map(Number);
  return Math.round((Date.UTC(by, (bm || 1) - 1, bd || 1) - Date.UTC(ay, (am || 1) - 1, ad || 1)) / 86400000);
}

// Calendar day `days` after `dateISO`, staying in plain-date arithmetic.
export function shiftISO(dateISO: string, days: number) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return toISO(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}
