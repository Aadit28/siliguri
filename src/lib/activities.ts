import { PREVIEW_ACTIVITIES } from '../data/mockActivities';
import { backendRequest } from './backend';
import type { Activity, ActivityEnrollment, CityScope } from './types';

export const activityCatalogMode =
  process.env.EXPO_PUBLIC_ACTIVITY_CATALOG_MODE === 'live' ? 'live' : 'preview';

// Compatibility for screens ported from the earlier checkout. `source` is the
// authoritative state; `usingMock` remains until those screens stop reading it.
export const activityCatalogStatus: {
  source: 'live' | 'preview';
  usingMock: boolean;
} = {
  source: activityCatalogMode,
  usingMock: activityCatalogMode === 'preview',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value?: string | null) {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isPreviewActivityId(activityId: string) {
  return activityId.startsWith('preview-');
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function catalogQuery(city?: CityScope | null) {
  return queryString({
    cityId: isUuid(city?.id) ? city?.id || undefined : undefined,
    citySlug: !isUuid(city?.id) ? city?.slug : undefined,
  });
}

function participantQuery(participantId?: string) {
  return queryString({ participantId });
}

function clonePreviewCatalog(city?: CityScope | null): Activity[] {
  // The approved review catalog describes the Siliguri rollout. Returning an
  // empty list for another selected city keeps the public city boundary honest.
  if (city?.slug && city.slug !== 'siliguri') return [];

  return PREVIEW_ACTIVITIES.map((activity) => ({
    ...activity,
    cityId: city?.id || activity.cityId,
    catalogSource: 'preview',
    registrationOpen: false,
    enrollment: null,
    sessions: activity.sessions.map((session) => ({ ...session })),
  }));
}

function mergeEnrollments(activities: Activity[], enrollments: ActivityEnrollment[]) {
  const byActivityId = new Map(enrollments.map((enrollment) => [enrollment.activityId, enrollment]));
  return activities.map((activity) => ({
    ...activity,
    enrollment: byActivityId.get(activity.id) ?? null,
  }));
}

/**
 * Preview is the deliberate default for this rollout, including production.
 * It is browse-only and performs no request. Setting the build-time mode to
 * `live` opts into the server catalog and makes failures visible to the caller;
 * live mode never silently substitutes preview listings.
 */
export async function listActivities(
  token?: string,
  participantId?: string,
  city?: CityScope | null,
): Promise<Activity[]> {
  if (activityCatalogMode === 'preview') {
    activityCatalogStatus.source = 'preview';
    activityCatalogStatus.usingMock = true;
    return clonePreviewCatalog(city);
  }

  activityCatalogStatus.source = 'live';
  activityCatalogStatus.usingMock = false;
  const response = await backendRequest<{ activities: Activity[] }>(
    `/api/activities${catalogQuery(city)}`,
    { token },
  );
  if (!Array.isArray(response.activities)) {
    throw new Error('The activities response was invalid.');
  }

  const liveActivities = response.activities.map((activity) => ({
    ...activity,
    catalogSource: 'live' as const,
  }));
  if (!token) return liveActivities;

  const enrollments = await listMyActivities(token, participantId);
  return mergeEnrollments(liveActivities, enrollments);
}

export async function getActivity(
  id: string,
  token?: string,
  participantId?: string,
  city?: CityScope | null,
): Promise<Activity | null> {
  const activities = await listActivities(token, participantId, city);
  return activities.find((activity) => activity.id === id || activity.slug === id) ?? null;
}

export async function listMyActivities(
  token: string,
  participantId?: string,
): Promise<ActivityEnrollment[]> {
  const response = await backendRequest<{ enrollments: ActivityEnrollment[] }>(
    `/api/activities/my${participantQuery(participantId)}`,
    { token },
  );
  if (!Array.isArray(response.enrollments)) {
    throw new Error('The enrollments response was invalid.');
  }
  return response.enrollments;
}

function rejectPreviewMutation(activityId: string) {
  if (!isPreviewActivityId(activityId)) return;
  throw Object.assign(
    new Error('Preview activities are browse-only. Registration is not available.'),
    { status: 409 },
  );
}

export async function joinActivity(
  token: string,
  activityId: string,
  participantId?: string,
): Promise<ActivityEnrollment> {
  rejectPreviewMutation(activityId);
  const response = await backendRequest<{ enrollment: ActivityEnrollment }>(
    '/api/activities/enroll',
    {
      method: 'POST',
      token,
      body: { activityId, ...(participantId ? { participantId } : {}) },
    },
  );
  if (!response.enrollment) {
    throw new Error('Enrollment was not confirmed by the server.');
  }
  return response.enrollment;
}

export async function leaveActivity(
  token: string,
  activityId: string,
  participantId?: string,
): Promise<ActivityEnrollment> {
  rejectPreviewMutation(activityId);
  const response = await backendRequest<{ enrollment: ActivityEnrollment }>(
    '/api/activities/leave',
    {
      method: 'POST',
      token,
      body: { activityId, ...(participantId ? { participantId } : {}) },
    },
  );
  if (!response.enrollment) {
    throw new Error('Cancellation was not confirmed by the server.');
  }
  return response.enrollment;
}
