import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CalendarEvent, ReminderRepeat } from './types';

const ANDROID_CHANNEL_ID = 'saathi-reminders';
// Reminders with no time still deserve an alert; 9am reads as "morning of".
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;

const supported = Platform.OS !== 'web';

if (supported) {
  // Foreground reminders should still surface — the default handler hides them.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

let permissionPromise: Promise<boolean> | null = null;

// Only a granted result stays cached. Denials clear the promise so a user who
// later enables notifications in Settings gets rechecked on the next save
// instead of being stuck with a memoized "no" until app restart.
async function ensurePermission(): Promise<boolean> {
  if (!supported) return false;
  if (!permissionPromise) {
    permissionPromise = (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
          name: 'Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
        });
      }
      const current = await Notifications.getPermissionsAsync();
      if (current.granted) return true;
      if (!current.canAskAgain) return false;
      const asked = await Notifications.requestPermissionsAsync();
      return asked.granted;
    })().catch(() => false);
    permissionPromise.then((granted) => {
      if (!granted) permissionPromise = null;
    });
  }
  return permissionPromise;
}

function eventDate(event: Pick<CalendarEvent, 'dateISO' | 'time'>) {
  const [year, month, day] = event.dateISO.split('-').map(Number);
  const [hour, minute] = event.time
    ? event.time.split(':').map(Number)
    : [DEFAULT_HOUR, DEFAULT_MINUTE];
  return new Date(year, (month || 1) - 1, day || 1, hour || 0, minute || 0, 0, 0);
}

// Widened repeat: local CalendarEvent never stores 'monthly', but family
// reminders can carry it, so scheduling handles it without editing types.
function triggerFor(
  event: Pick<CalendarEvent, 'dateISO' | 'time'> & { repeat?: ReminderRepeat | 'monthly' },
) {
  const date = eventDate(event);
  const channelId = Platform.OS === 'android' ? ANDROID_CHANNEL_ID : undefined;
  const now = new Date();
  const startsOnFutureDay =
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() >
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (event.repeat === 'daily' || event.repeat === 'weekly') {
    // expo-notifications cannot start a DAILY/WEEKLY calendar repeat at a
    // future date (it would fire before the start day), so a reminder starting
    // on a later day gets its first occurrence as a one-shot date trigger; the
    // repeat is not chained beyond that first firing.
    if (startsOnFutureDay) {
      return {
        type: Notifications.SchedulableTriggerInputTypes.DATE as const,
        date,
        channelId,
      };
    }
    if (event.repeat === 'daily') {
      return {
        type: Notifications.SchedulableTriggerInputTypes.DAILY as const,
        hour: date.getHours(),
        minute: date.getMinutes(),
        channelId,
      };
    }
    return {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY as const,
      // expo weekday is 1-7 starting Sunday; JS getDay() is 0-6 starting Sunday.
      weekday: date.getDay() + 1,
      hour: date.getHours(),
      minute: date.getMinutes(),
      channelId,
    };
  }
  if (event.repeat === 'monthly') {
    // expo-notifications has no native monthly repeat — schedule only the next
    // occurrence (same day-of-month) as a one-shot date trigger.
    let next = new Date(date);
    for (let ahead = 1; next.getTime() <= Date.now() && ahead <= 48; ahead++) {
      const candidate = new Date(
        date.getFullYear(),
        date.getMonth() + ahead,
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
      );
      // Skip months lacking this day (e.g. the 31st) — JS would roll them over.
      if (candidate.getDate() === date.getDate()) next = candidate;
    }
    if (next.getTime() <= Date.now()) return null;
    return {
      type: Notifications.SchedulableTriggerInputTypes.DATE as const,
      date: next,
      channelId,
    };
  }
  // One-off in the past would fire immediately — skip it instead.
  if (date.getTime() <= Date.now()) return null;
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE as const,
    date,
    channelId,
  };
}

export async function scheduleReminder(event: CalendarEvent): Promise<string | null> {
  if (!supported) return null;
  const trigger = triggerFor(event);
  if (!trigger) return null;
  if (!(await ensurePermission())) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: event.title,
        body: event.note ?? event.serviceName ?? undefined,
        data: { eventId: event.id },
      },
      trigger,
    });
  } catch {
    return null;
  }
}

export async function cancelReminder(notificationId?: string | null) {
  if (!supported || !notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => undefined);
}
