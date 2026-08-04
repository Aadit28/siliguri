import { backendRequest } from './backend';
import { addEvent, listEvents, removeEvent } from './calendar';
import type {
  Activity,
  ActivityEnrollment,
  ActivitySession,
  CalendarEvent,
} from './types';

export interface ActivityCalendarSyncResult {
  enrollments: ActivityEnrollment[];
  alertProblems: Array<{
    sessionId: string;
    reason: NonNullable<CalendarEvent['alertProblem']>;
  }>;
}

interface SessionMirror {
  activity: Activity;
  enrollment: ActivityEnrollment;
  session: ActivitySession;
  dateISO: string;
  time: string;
  note: string | null;
}

const syncQueueByScope = new Map<string, Promise<unknown>>();
const suspendedCalendarOwners = new Set<string>();

function queueKey(calendarOwnerId: string, participantId: string) {
  return `${calendarOwnerId}\u0000${participantId}`;
}

function activitySourceUrl(activityId: string, participantId: string, calendarOwnerId: string) {
  const base = `/activity/${activityId}`;
  return participantId === calendarOwnerId
    ? base
    : `${base}?participantId=${encodeURIComponent(participantId)}`;
}

function participantQuery(participantId: string) {
  return `?participantId=${encodeURIComponent(participantId)}`;
}

async function fetchAuthoritativeEnrollments(token: string, participantId: string) {
  const response = await backendRequest<{ enrollments: ActivityEnrollment[] }>(
    `/api/activities/my${participantQuery(participantId)}`,
    { token },
  );
  if (!Array.isArray(response.enrollments)) {
    throw new Error('The activity enrollment response was invalid.');
  }
  // A mismatched row is a server-boundary failure, not an empty result. Abort
  // without reconciling so another participant's data can neither appear nor
  // cause this participant's existing calendar rows to be deleted.
  if (response.enrollments.some((item) => item.participantId !== participantId)) {
    throw new Error('The activity enrollment response was scoped incorrectly.');
  }
  return response.enrollments;
}

function sessionDateTime(session: ActivitySession) {
  const startsAt = new Date(session.startsAt);
  if (!Number.isFinite(startsAt.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: session.timezone || 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(startsAt);
    const byType = new Map(parts.map((part) => [part.type, part.value]));
    const year = byType.get('year');
    const month = byType.get('month');
    const day = byType.get('day');
    const hour = byType.get('hour');
    const minute = byType.get('minute');
    if (year && month && day && hour && minute) {
      return { dateISO: `${year}-${month}-${day}`, time: `${hour}:${minute}` };
    }
  } catch {
    // An invalid IANA timezone is invalid server data. Do not reinterpret the
    // class in the guardian's/device's local zone because Saathi dates are IST.
  }
  return null;
}

function mirrorNote(activity: Activity) {
  const parts = [activity.venueName, activity.address, activity.instructorName].filter(Boolean);
  return parts.length ? parts.join(' - ') : null;
}

function desiredMirrors(enrollments: ActivityEnrollment[]): SessionMirror[] {
  const now = Date.now();
  const mirrors: SessionMirror[] = [];

  for (const enrollment of enrollments) {
    if (enrollment.status !== 'joined' || !enrollment.activity) continue;
    for (const session of enrollment.activity.sessions ?? []) {
      if (session.status !== 'scheduled') continue;
      const startsAt = new Date(session.startsAt);
      if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= now) continue;
      const local = sessionDateTime(session);
      if (!local) continue;
      mirrors.push({
        activity: enrollment.activity,
        enrollment,
        session,
        dateISO: local.dateISO,
        time: local.time,
        note: mirrorNote(enrollment.activity),
      });
    }
  }

  return mirrors;
}

function isStale(event: CalendarEvent, desired: SessionMirror, calendarOwnerId: string) {
  return (
    event.title !== desired.activity.title ||
    event.dateISO !== desired.dateISO ||
    event.time !== desired.time ||
    event.note !== desired.note ||
    event.serviceName !== (desired.activity.instructorName ?? desired.activity.venueName) ||
    event.servicePhone !== desired.activity.contactPhone ||
    event.activityId !== desired.activity.id ||
    event.seriesId !== desired.activity.id ||
    event.participantId !== desired.enrollment.participantId ||
    event.sourceLabel !== desired.activity.title ||
    event.sourceUrl !== activitySourceUrl(
      desired.activity.id,
      desired.enrollment.participantId,
      calendarOwnerId,
    ) ||
    event.startsAt !== desired.session.startsAt ||
    event.endsAt !== desired.session.endsAt ||
    event.timezone !== desired.session.timezone ||
    event.source !== 'activity' ||
    event.sourceId !== desired.session.id ||
    event.repeat !== 'once' ||
    event.readOnly !== true
  );
}

async function addMirror(
  calendarOwnerId: string,
  participantId: string,
  item: SessionMirror,
  alertProblems: ActivityCalendarSyncResult['alertProblems'],
) {
  const event = await addEvent(calendarOwnerId, {
    title: item.activity.title,
    dateISO: item.dateISO,
    time: item.time,
    note: item.note,
    serviceName: item.activity.instructorName ?? item.activity.venueName,
    servicePhone: item.activity.contactPhone,
    repeat: 'once',
    source: 'activity',
    sourceId: item.session.id,
    seriesId: item.activity.id,
    readOnly: true,
    activityId: item.activity.id,
    sourceLabel: item.activity.title,
    sourceUrl: activitySourceUrl(item.activity.id, participantId, calendarOwnerId),
    participantId: item.enrollment.participantId,
    startsAt: item.session.startsAt,
    endsAt: item.session.endsAt,
    timezone: item.session.timezone,
  });
  if (event.alertProblem) {
    alertProblems.push({ sessionId: item.session.id, reason: event.alertProblem });
  }
}

async function reconcile(
  calendarOwnerId: string,
  participantId: string,
  enrollments: ActivityEnrollment[],
): Promise<ActivityCalendarSyncResult> {
  const desired = desiredMirrors(enrollments);
  const desiredBySessionId = new Map(desired.map((item) => [item.session.id, item]));
  const existing = (await listEvents(calendarOwnerId)).filter(
    (event) => event.source === 'activity' && event.participantId === participantId,
  );
  const existingBySessionId = new Map<string, CalendarEvent>();
  const alertProblems: ActivityCalendarSyncResult['alertProblems'] = [];

  // Remove duplicate or unidentifiable mirrors left by an interrupted older
  // sync. Manual and family reminders are never considered here.
  for (const event of existing) {
    if (!event.sourceId || existingBySessionId.has(event.sourceId)) {
      await removeEvent(calendarOwnerId, event.id);
      continue;
    }
    existingBySessionId.set(event.sourceId, event);
  }

  for (const item of desired) {
    const current = existingBySessionId.get(item.session.id);
    if (current && !isStale(current, item, calendarOwnerId)) continue;

    // Add the replacement before deleting the old row. A scheduling/storage
    // failure therefore preserves the last known calendar commitment.
    await addMirror(calendarOwnerId, participantId, item, alertProblems);
    if (current) await removeEvent(calendarOwnerId, current.id);
  }

  // This deletion happens only after a successful authenticated fetch. A
  // network or server failure throws before reconcile, so it can never look
  // like an authoritative empty enrollment list.
  for (const event of existingBySessionId.values()) {
    if (event.sourceId && !desiredBySessionId.has(event.sourceId)) {
      await removeEvent(calendarOwnerId, event.id);
    }
  }

  return { enrollments, alertProblems };
}

async function runSync(token: string, participantId: string, calendarOwnerId: string) {
  const enrollments = await fetchAuthoritativeEnrollments(token, participantId);
  // Sign-out can happen while the authenticated fetch is in flight. Never let
  // its result recreate a private calendar alert after that account has been
  // suspended on a shared device.
  if (suspendedCalendarOwners.has(calendarOwnerId)) {
    throw new Error('Activity calendar sync was cancelled because the account signed out.');
  }
  return reconcile(calendarOwnerId, participantId, enrollments);
}

export function syncActivitiesForParticipant(
  token: string,
  participantId: string,
  calendarOwnerId: string = participantId,
): Promise<ActivityCalendarSyncResult> {
  const scopedParticipantId = participantId.trim();
  const scopedCalendarOwnerId = calendarOwnerId.trim();
  if (!token.trim() || !scopedParticipantId || !scopedCalendarOwnerId) {
    return Promise.reject(new Error('Sign in before syncing activity sessions.'));
  }
  if (suspendedCalendarOwners.has(scopedCalendarOwnerId)) {
    return Promise.reject(new Error('Sign in before syncing activity sessions.'));
  }
  // Calendar storage and OS alerts belong to the signed-in device account,
  // even when a guardian is acting for a linked parent. Keep participant
  // identity on the event, but serialize by both owner and participant.
  const requestKey = queueKey(scopedCalendarOwnerId, scopedParticipantId);
  const previous = syncQueueByScope.get(requestKey) ?? Promise.resolve();

  // Queue rather than deduplicate. If a background refresh began just before a
  // confirmed join/leave, the post-mutation call must perform a newer fetch;
  // reusing the earlier in-flight result would leave the calendar stale.
  const request = previous
    .catch(() => undefined)
    .then(() => runSync(token, scopedParticipantId, scopedCalendarOwnerId))
    .finally(() => {
      if (syncQueueByScope.get(requestKey) === request) {
        syncQueueByScope.delete(requestKey);
      }
    });
  syncQueueByScope.set(requestKey, request);
  return request;
}

// Block new work immediately, then drain anything that began before sign-out.
// AuthContext calls this before cancelling this account's OS alerts so an
// in-flight enrollment refresh cannot recreate one behind it.
export async function suspendActivitySyncForParticipant(
  participantId: string | null | undefined,
): Promise<void> {
  const id = participantId?.trim();
  if (!id) return;
  suspendedCalendarOwners.add(id);
  const prefix = `${id}\u0000`;
  await Promise.all(
    [...syncQueueByScope.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, request]) => request.catch(() => undefined)),
  );
}

export function resumeActivitySyncForParticipant(
  participantId: string | null | undefined,
) {
  const id = participantId?.trim();
  if (id) suspendedCalendarOwners.delete(id);
}
