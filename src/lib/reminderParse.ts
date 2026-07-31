import { ReminderRepeat } from './types';
import { toLocalISODate } from './calendar';

// Turns "remind me to take BP medicine daily at 8am" (or the Hindi/Hinglish
// equivalent) into a concrete reminder proposal the user confirms with one
// tap. Deterministic on purpose: the same words always produce the same
// proposal, and the server's local planner ports this logic (server/assistant/
// plan.js) so online and offline answers agree.

export interface ProposedReminder {
  title: string;
  dateISO: string;
  time: string | null;
  repeat: ReminderRepeat;
}

const TRIGGER = /\b(remind|reminder|remember)\b|याद|रिमाइंड|\byaad\b/i;

const DAILY = /\b(every ?day|daily|roz|har din)\b|रोज|हर दिन|प्रतिदिन/i;
const WEEKLY = /\b(every ?week|weekly|har hafte|har week)\b|हर हफ्ते|साप्ताहिक/i;
const MONTHLY = /\b(every ?month|monthly|har mahine|har month)\b|हर महीने|मासिक/i;

const TOMORROW = /\btomorrow\b|\bkal\b|कल/i;
const TODAY = /\btoday\b|\btonight\b|\baaj\b|आज/i;

const WEEKDAYS = [
  { index: 0, pattern: /\bsunday\b|रविवार|\bravivar\b/i },
  { index: 1, pattern: /\bmonday\b|सोमवार|\bsomvar\b/i },
  { index: 2, pattern: /\btuesday\b|मंगलवार|\bmangalvar\b/i },
  { index: 3, pattern: /\bwednesday\b|बुधवार|\bbudhvar\b/i },
  { index: 4, pattern: /\bthursday\b|गुरुवार|\bguruvar\b/i },
  { index: 5, pattern: /\bfriday\b|शुक्रवार|\bshukravar\b/i },
  { index: 6, pattern: /\bsaturday\b|शनिवार|\bshanivar\b/i },
];

// Evening markers push a bare "8 baje" to 20:00 — elders often speak 12-hour
// clock; a wrong guess of 8am for an evening medicine is worse than none.
const EVENING = /\b(evening|night|tonight|shaam|raat)\b|शाम|रात/i;
const MORNING = /\b(morning|subah)\b|सुबह/i;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function extractReminderTime(message: string): string | null {
  // "8am", "8:30 pm", "20:15"
  const clocked = message.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i);
  if (clocked) {
    let hour = parseInt(clocked[1], 10);
    const minute = clocked[2] ? parseInt(clocked[2], 10) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const meridiem = clocked[3].toLowerCase();
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return `${pad(hour)}:${pad(minute)}`;
  }

  // "8 baje" / "8 बजे" — 12-hour speech; evening/night words select pm.
  const baje = message.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:baje|बजे)/i);
  if (baje) {
    let hour = parseInt(baje[1], 10);
    const minute = baje[2] ? parseInt(baje[2], 10) : 0;
    if (hour < 1 || hour > 23 || minute > 59) return null;
    if (hour <= 11 && EVENING.test(message)) hour += 12;
    return `${pad(hour)}:${pad(minute)}`;
  }

  // "at 20:15" — only with an explicit "at"/time marker so plain numbers
  // ("ward 12") are not read as times.
  const twentyFour = message.match(/\b(?:at|@)\s*(\d{1,2})[:.](\d{2})\b/i);
  if (twentyFour) {
    const hour = parseInt(twentyFour[1], 10);
    const minute = parseInt(twentyFour[2], 10);
    if (hour > 23 || minute > 59) return null;
    return `${pad(hour)}:${pad(minute)}`;
  }

  if (MORNING.test(message) && TRIGGER.test(message)) return '09:00';
  if (EVENING.test(message) && TRIGGER.test(message)) return '20:00';
  return null;
}

function resolveDate(message: string, todayISO: string): string {
  const [year, month, day] = todayISO.split('-').map(Number);
  const today = new Date(year, month - 1, day);

  if (TOMORROW.test(message) && !TODAY.test(message)) {
    const next = new Date(today);
    next.setDate(next.getDate() + 1);
    return toLocalISODate(next);
  }
  const weekday = WEEKDAYS.find((entry) => entry.pattern.test(message));
  if (weekday) {
    let diff = weekday.index - today.getDay();
    if (diff <= 0) diff += 7;
    const next = new Date(today);
    next.setDate(next.getDate() + diff);
    return toLocalISODate(next);
  }
  return todayISO;
}

function cleanTitle(message: string): string {
  let title = message
    // Lead-in phrases, both languages.
    .replace(/^.*?\b(?:remind (?:me|us|him|her)?|reminder|remember)\b(?:\s+(?:to|about|for))?/i, '')
    .replace(/(?:मुझे|हमें)?\s*याद\s*(?:दिला(?:ना|ओ|इए|एं)?|रख(?:ना|ो|िए)?)\s*(?:कि|की)?/g, ' ')
    .replace(/\byaad\s*(?:dila(?:na|o|iye|do)?|rakh(?:na|o)?)\b/gi, ' ')
    // Schedule words that are instructions, not the task itself.
    .replace(DAILY, ' ')
    .replace(WEEKLY, ' ')
    .replace(MONTHLY, ' ')
    .replace(TOMORROW, ' ')
    .replace(/\btoday\b|\btonight\b|\baaj\b|आज/gi, ' ')
    .replace(/\b(?:every\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, ' ')
    .replace(/\b(?:at|@)?\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|baje|बजे)\b/gi, ' ')
    .replace(/\b(?:at|@)\s*\d{1,2}[:.]\d{2}\b/gi, ' ')
    .replace(/\b(morning|evening|night|subah|shaam|raat)\b|सुबह|शाम|रात/gi, ' ')
    .replace(/\b(please|kripya)\b|कृपया/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.:;!?-]+|[\s,.:;!?-]+$/g, '')
    .trim();

  // Devanagari sentences usually put the verb last; a trailing "लेना है" or
  // "hai" adds nothing to a reminder title.
  title = title.replace(/\s*(?:लेना|करना|जाना)?\s*(?:है|हैं|hai|hain)[.?!]?$/i, '').trim();
  // Stripping schedule words can strand a function word at either edge
  // ("call the doctor on", "मुझे दवा लेना").
  title = title
    .replace(/^(?:to|about|for|that|मुझे|हमें|mujhe|humein|hume|कि|की|ki)\s+/i, '')
    .replace(/\s+(?:on|at|in|by|को|पर|ko|par)$/i, '')
    .trim();

  return title.slice(0, 80);
}

export function parseReminderRequest(
  message: string,
  lang: 'en' | 'hi',
  todayISO?: string,
): ProposedReminder | null {
  if (!TRIGGER.test(message)) return null;

  const repeat: ReminderRepeat = DAILY.test(message)
    ? 'daily'
    : WEEKLY.test(message)
      ? 'weekly'
      : MONTHLY.test(message)
        ? 'monthly'
        : WEEKDAYS.some((entry) => entry.pattern.test(message)) && /\bevery\b|हर|\bhar\b/i.test(message)
          ? 'weekly'
          : 'once';

  const baseDay = todayISO && /^\d{4}-\d{2}-\d{2}$/.test(todayISO) ? todayISO : toLocalISODate(new Date());
  const dateISO = resolveDate(message, baseDay);
  const time = extractReminderTime(message);
  const title = cleanTitle(message) || (lang === 'hi' ? 'रिमाइंडर' : 'Reminder');

  return { title, dateISO, time, repeat };
}
