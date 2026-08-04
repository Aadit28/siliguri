const { requireFamilyLink } = require('./auth');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CITY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEFAULT_CITY_SLUG = 'siliguri';

// Public reads are deliberately allowlisted. These tables have no public RLS
// policies and are exposed only through the service-role dispatcher.
const ACTIVITY_COLUMNS = [
  'id',
  'city_id',
  'slug',
  'title',
  'description',
  'category',
  'instructor_name',
  'venue_name',
  'address',
  'town',
  'languages',
  'mobility_level',
  'wheelchair_accessible',
  'chair_available',
  'caregiver_welcome',
  'accessibility_notes',
  'image_url',
  'cost_paise',
  'currency',
  'contact_phone',
  'verification_status',
  'verified_at',
  'registration_open',
  'featured',
  'capacity',
  'waitlist_capacity',
  'status',
].join(',');

const SESSION_COLUMNS = 'id,activity_id,starts_at,ends_at,timezone,status,capacity';
const ENROLLMENT_COLUMNS =
  'id,city_id,activity_id,participant_id,status,waitlist_position,enrolled_at,updated_at';

class ActivityHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ActivityHttpError';
    this.status = status;
  }
}

function activitiesLiveEnabled() {
  return process.env.ACTIVITIES_LIVE_ENABLED === 'true';
}

function singleValue(value, label) {
  if (Array.isArray(value)) {
    if (value.length === 1) return value[0];
    throw new ActivityHttpError(400, `${label} is invalid.`);
  }
  return value;
}

function requireUuid(value, label) {
  const id = String(singleValue(value, label) || '').trim();
  if (!UUID_RE.test(id)) throw new ActivityHttpError(400, `${label} is invalid.`);
  return id;
}

function requestQueryValue(req, key) {
  if (req.query && req.query[key] !== undefined) return req.query[key];
  const values = new URL(req.url || '/', 'http://localhost').searchParams.getAll(key);
  if (values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

async function resolveCatalogCityId(client, { cityId, citySlug } = {}) {
  const rawCityId = singleValue(cityId, 'cityId');
  if (rawCityId !== undefined && rawCityId !== null && rawCityId !== '') {
    const id = requireUuid(rawCityId, 'cityId');
    const { data, error } = await client
      .from('cities')
      .select('id')
      .eq('id', id)
      .eq('active', true)
      .maybeSingle();
    if (error) throw error;
    return data?.id || null;
  }

  const rawSlug = singleValue(citySlug, 'citySlug');
  const slug = String(rawSlug || DEFAULT_CITY_SLUG).trim().toLowerCase();
  if (!CITY_SLUG_RE.test(slug) || slug.length > 80) {
    throw new ActivityHttpError(400, 'citySlug is invalid.');
  }

  const { data, error } = await client
    .from('cities')
    .select('id')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

// The caller may act for themselves or an actively linked parent. The
// participant lookup happens after that authorization check and is the only
// source of the enrollment city; the client never supplies a trusted city_id.
async function resolveParticipant(auth, requestedParticipantId) {
  const requested = String(singleValue(requestedParticipantId, 'participantId') || '').trim();
  const participantId = requested ? requireUuid(requested, 'participantId') : auth.user.id;
  const linkError = await requireFamilyLink(auth, participantId);
  if (linkError) throw new ActivityHttpError(403, linkError.error || 'Not allowed.');

  const { data, error } = await auth.supabase
    .from('user_accounts')
    .select('id,city_id')
    .eq('id', participantId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ActivityHttpError(404, 'Participant was not found.');
  if (!data.city_id) {
    throw new ActivityHttpError(409, 'Choose a city for this participant before joining an activity.');
  }
  return { participantId: data.id, cityId: data.city_id };
}

async function listActivities(
  client,
  { activityIds, publishedOnly = true, cityId, citySlug } = {},
) {
  if (Array.isArray(activityIds) && activityIds.length === 0) return [];
  const scopedCityId = await resolveCatalogCityId(client, { cityId, citySlug });
  if (!scopedCityId) return [];

  let query = client.from('activities').select(ACTIVITY_COLUMNS).eq('city_id', scopedCityId);
  if (publishedOnly) {
    query = query.eq('status', 'published').eq('verification_status', 'saathi_verified');
  }
  if (Array.isArray(activityIds)) query = query.in('id', activityIds);
  query = query.order('featured', { ascending: false }).order('title', { ascending: true });

  const { data: activityRows, error: activityError } = await query;
  if (activityError) throw activityError;
  if (!activityRows || activityRows.length === 0) return [];

  const ids = activityRows.map((row) => row.id);
  const now = new Date().toISOString();
  const [sessionResult, enrollmentResult] = await Promise.all([
    client
      .from('activity_sessions')
      .select(SESSION_COLUMNS)
      .in('activity_id', ids)
      .in('status', ['scheduled', 'cancelled'])
      .gte('ends_at', now)
      .order('starts_at', { ascending: true }),
    client
      .from('activity_enrollments')
      .select('activity_id,status')
      .eq('city_id', scopedCityId)
      .in('activity_id', ids)
      .in('status', ['joined', 'waitlisted']),
  ]);
  if (sessionResult.error) throw sessionResult.error;
  if (enrollmentResult.error) throw enrollmentResult.error;

  const sessionsByActivity = new Map();
  for (const row of sessionResult.data || []) {
    const rows = sessionsByActivity.get(row.activity_id) || [];
    rows.push(row);
    sessionsByActivity.set(row.activity_id, rows);
  }

  const joinedCounts = new Map();
  const waitlistedCounts = new Map();
  for (const row of enrollmentResult.data || []) {
    const counts = row.status === 'waitlisted' ? waitlistedCounts : joinedCounts;
    counts.set(row.activity_id, (counts.get(row.activity_id) || 0) + 1);
  }

  return activityRows.map((row) =>
    toActivity(
      row,
      sessionsByActivity.get(row.id) || [],
      joinedCounts.get(row.id) || 0,
      waitlistedCounts.get(row.id) || 0,
    ),
  );
}

async function listMyEnrollments(client, participant) {
  const { data, error } = await client
    .from('activity_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('participant_id', participant.participantId)
    .eq('city_id', participant.cityId)
    .in('status', ['joined', 'waitlisted'])
    .order('enrolled_at', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  const activityIds = [...new Set(data.map((row) => row.activity_id))];
  const activities = await listActivities(client, {
    activityIds,
    publishedOnly: false,
    cityId: participant.cityId,
  });
  const activityById = new Map(activities.map((activity) => [activity.id, activity]));

  return data
    .map((row) => toEnrollment(row, activityById.get(row.activity_id) || null))
    .filter((enrollment) => enrollment.activity);
}

async function getEnrollment(client, participant, activityId) {
  const { data, error } = await client
    .from('activity_enrollments')
    .select(ENROLLMENT_COLUMNS)
    .eq('participant_id', participant.participantId)
    .eq('city_id', participant.cityId)
    .eq('activity_id', activityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const activities = await listActivities(client, {
    activityIds: [activityId],
    publishedOnly: false,
    cityId: participant.cityId,
  });
  return toEnrollment(data, activities[0] || null);
}

function toActivity(row, sessionRows, joinedCount, waitlistedCount) {
  const defaultCapacity = numberOrNull(row.capacity);
  const scheduledCapacities = sessionRows
    .filter((session) => session.status === 'scheduled')
    .map((session) => numberOrNull(session.capacity))
    .filter((capacity) => capacity !== null);
  const capacityCandidates = [defaultCapacity, ...scheduledCapacities].filter(
    (capacity) => capacity !== null,
  );
  const effectiveCapacity = capacityCandidates.length ? Math.min(...capacityCandidates) : null;
  const effectiveSessions =
    row.status === 'published'
      ? sessionRows
      : sessionRows.map((session) => ({ ...session, status: 'cancelled' }));
  const hasUpcomingSession = effectiveSessions.some((session) => session.status === 'scheduled');
  const verificationStatus =
    ({ community_listed: 'unverified', partner_verified: 'saathi_verified' }[
      row.verification_status
    ] || row.verification_status || 'unverified');

  return {
    id: row.id,
    cityId: row.city_id,
    slug: row.slug,
    title: row.title,
    description: row.description || null,
    category: row.category,
    instructorName: row.instructor_name || null,
    venueName: row.venue_name || null,
    address: row.address || null,
    town: row.town,
    languages: Array.isArray(row.languages) ? row.languages.map(String) : [],
    mobilityLevel: row.mobility_level,
    wheelchairAccessible: Boolean(row.wheelchair_accessible),
    chairAvailable: Boolean(row.chair_available),
    caregiverWelcome: Boolean(row.caregiver_welcome),
    accessibilityNotes: row.accessibility_notes || null,
    imageUrl: row.image_url || null,
    costPaise: Number(row.cost_paise || 0),
    currency: 'INR',
    contactPhone: row.contact_phone || null,
    verificationStatus: ['unverified', 'source_linked', 'phone_confirmed', 'saathi_verified'].includes(
      verificationStatus,
    )
      ? verificationStatus
      : 'unverified',
    verifiedAt: row.verified_at || null,
    // Operator identity is audit data and is never exposed in the public
    // catalog payload.
    verifiedBy: null,
    registrationOpen: Boolean(row.registration_open) && row.status === 'published' && hasUpcomingSession,
    featured: Boolean(row.featured),
    capacity: effectiveCapacity,
    waitlistCapacity: Number(row.waitlist_capacity || 0),
    waitlistSpotsRemaining: Math.max(0, Number(row.waitlist_capacity || 0) - waitlistedCount),
    sessions: effectiveSessions.map((session) => toSession(session, effectiveCapacity, joinedCount)),
  };
}

function toSession(row, effectiveCapacity, joinedCount) {
  return {
    id: row.id,
    activityId: row.activity_id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    capacity: effectiveCapacity,
    spotsRemaining:
      row.status !== 'scheduled'
        ? 0
        : effectiveCapacity === null
          ? null
          : Math.max(0, effectiveCapacity - joinedCount),
  };
}

function toEnrollment(row, activity) {
  return {
    id: row.id,
    cityId: row.city_id,
    activityId: row.activity_id,
    participantId: row.participant_id,
    status: row.status,
    waitlistPosition: numberOrNull(row.waitlist_position),
    enrolledAt: row.enrolled_at,
    updatedAt: row.updated_at,
    activity,
  };
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function enrollmentCalendarEntries(enrollments) {
  const entries = [];
  for (const enrollment of enrollments || []) {
    if (enrollment.status !== 'joined' || !enrollment.activity) continue;
    for (const session of enrollment.activity.sessions || []) {
      if (session.status !== 'scheduled') continue;
      const local = localDateTime(session.startsAt, session.timezone || 'Asia/Kolkata');
      if (!local) continue;
      entries.push({
        title: enrollment.activity.title,
        dateISO: local.dateISO,
        time: local.time,
        activityId: enrollment.activityId,
        sessionId: session.id,
        source: 'activity',
      });
    }
  }
  return entries.sort((a, b) => `${a.dateISO}T${a.time}`.localeCompare(`${b.dateISO}T${b.time}`));
}

function localDateTime(value, timezone) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      dateISO: `${byType.year}-${byType.month}-${byType.day}`,
      time: `${byType.hour}:${byType.minute}`,
    };
  } catch {
    return null;
  }
}

function activityErrorStatus(error) {
  if (error instanceof ActivityHttpError) return error.status;
  if (error instanceof SyntaxError) return 400;
  if (error?.code === 'P0002') return 404;
  if (error?.code === '23503' || error?.code === '22004' || error?.code === '22P02') return 400;
  if (error?.code === 'P0001' || error?.code === '23505') return 409;
  return 500;
}

function activityErrorMessage(error, fallback) {
  if (error instanceof SyntaxError) return 'Request body is invalid.';
  if (error?.code === '23503') return 'Activity or participant was not found.';
  if (error?.code === '22004') return 'Activity and participant are required.';
  if (error?.code === '22P02') return 'One of the values sent is not in a valid format.';
  const status = activityErrorStatus(error);
  if (status < 500 && error?.message) return error.message;
  return fallback;
}

function sendActivityError(res, error, fallback, send) {
  const status = activityErrorStatus(error);
  if (status >= 500) console.error(fallback, error);
  return send(res, status, { error: activityErrorMessage(error, fallback) });
}

module.exports = {
  ActivityHttpError,
  activitiesLiveEnabled,
  enrollmentCalendarEntries,
  getEnrollment,
  listActivities,
  listMyEnrollments,
  requestQueryValue,
  requireUuid,
  resolveParticipant,
  sendActivityError,
};
