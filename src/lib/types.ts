export type ServiceCategory =
  | 'elder_home'
  | 'doctor'
  | 'hospital'
  | 'medical_shop'
  | 'travel_agent'
  | 'home_service'
  | 'daily_service';

export type ServiceVerificationStatus =
  | 'unverified'
  | 'source_linked'
  | 'phone_confirmed'
  | 'claimed'
  | 'recently_reverified';

export type ServiceClaimStatus =
  | 'unclaimed'
  | 'claim_started'
  | 'claimed'
  | 'rejected';

export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string | null;
  phone: string | null;
  address: string | null;
  map_url: string | null;
  image_url: string | null;
  hours: string | null;
  rating: number | null;
  verified: boolean;
  town: string | null;
  source_url: string | null;
  verification_status?: ServiceVerificationStatus | null;
  verified_at?: string | null;
  verified_by?: string | null;
  verification_note?: string | null;
  phone_confirmed?: boolean | null;
  claim_status?: ServiceClaimStatus | null;
  service_area?: string | null;
  languages?: string[] | null;
  hours_confidence?: 'unknown' | 'source' | 'phone_confirmed' | null;
  created_at?: string;
  upi_id?: string | null;
  city_id?: string | null;
}

export interface City {
  id: string;
  name: string;
  slug: string;
  state: string | null;
  active: boolean;
}

// What the read path needs to scope a query: the id filters the database, the
// slug picks the bundled offline catalog. Kept separate from City so a caller
// holding only a slug (a deep link, a seeder argument) can still scope.
export interface CityScope {
  id?: string | null;
  slug: string;
}

export interface Announcement {
  id: string;
  city_id: string | null;
  author_id: string | null;
  author_name: string | null;
  title: string;
  body: string;
  title_hi: string | null;
  body_hi: string | null;
  active: boolean;
  created_at: string;
}

export type ReminderRepeat = 'once' | 'daily' | 'weekly' | 'monthly';

export interface CalendarEvent {
  id: string;
  title: string;
  dateISO: string;
  time: string | null;
  note: string | null;
  serviceId: string | null;
  serviceName: string | null;
  servicePhone: string | null;
  createdAt: number;
  // Absent on events saved before scheduling existed — treat as 'once'/unscheduled.
  repeat?: ReminderRepeat;
  notificationId?: string | null;
  // Set once the reminder is mirrored to a parent's family_reminders row.
  serverId?: string | null;
  // Server-authoritative activity sessions are mirrored into the local
  // calendar. Provenance makes those rows replaceable/read-only without
  // affecting reminders the elder created themselves.
  source?: 'manual' | 'family_reminder' | 'activity' | null;
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
  // Why this device could not schedule an alert for the reminder, if it could
  // not. Returned by addEvent for the screen to report; never persisted, since
  // it describes one attempt on one device rather than the reminder itself.
  alertProblem?: 'unsupported' | 'past' | 'permission' | 'failed';
}

// ACTIVITIES -----------------------------------------------------------------

export type ActivityCategory =
  | 'yoga'
  | 'fitness'
  | 'learning'
  | 'creative'
  | 'social'
  | 'wellness';

export type ActivityMobilityLevel = 'seated' | 'gentle' | 'moderate' | 'active';

export type ActivityVerificationStatus =
  | 'unverified'
  | 'source_linked'
  | 'phone_confirmed'
  | 'saathi_verified';

export type ActivityEnrollmentStatus = 'joined' | 'waitlisted' | 'cancelled';
export type ActivitySessionStatus = 'scheduled' | 'cancelled' | 'completed';

export interface ActivitySession {
  id: string;
  activityId: string;
  startsAt: string;
  endsAt: string | null;
  timezone: string;
  status: ActivitySessionStatus;
  capacity: number | null;
  spotsRemaining: number | null;
}

export interface Activity {
  catalogSource?: 'live' | 'preview';
  id: string;
  cityId: string;
  slug: string;
  title: string;
  description: string | null;
  category: ActivityCategory;
  instructorName: string | null;
  venueName: string | null;
  address: string | null;
  town: string | null;
  languages: string[];
  mobilityLevel: ActivityMobilityLevel;
  wheelchairAccessible: boolean;
  chairAvailable: boolean;
  caregiverWelcome: boolean;
  accessibilityNotes: string | null;
  imageUrl: string | null;
  costPaise: number;
  currency: 'INR';
  contactPhone: string | null;
  verificationStatus: ActivityVerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  registrationOpen: boolean;
  featured: boolean;
  capacity: number | null;
  waitlistCapacity: number;
  waitlistSpotsRemaining: number;
  sessions: ActivitySession[];
  enrollment?: ActivityEnrollment | null;
}

export interface ActivityEnrollment {
  id: string;
  cityId: string;
  activityId: string;
  participantId: string;
  status: ActivityEnrollmentStatus;
  waitlistPosition: number | null;
  enrolledAt: string;
  updatedAt: string;
  activity: Activity;
}

export type Session = ActivitySession;
export type Enrollment = ActivityEnrollment;

// FAMILY / GUARDIAN ----------------------------------------------------------

export type FamilyLinkStatus = 'pending' | 'active' | 'revoked';

export interface FamilyLink {
  id: string;
  status: FamilyLinkStatus;
  // Present on links where the signed-in user is the guardian.
  parentId?: string | null;
  parentName?: string | null;
  parentPhone?: string;
  relationship?: string | null;
  // Present on links where the signed-in user is the parent.
  guardianId?: string | null;
  guardianName?: string | null;
  createdAt?: string;
  verifiedAt?: string | null;
}

export type FamilyReminderRepeat = 'once' | 'daily' | 'weekly' | 'monthly';
export type FamilyReminderStatus = 'active' | 'done' | 'cancelled';

export interface FamilyReminder {
  id: string;
  parentId: string;
  createdBy: string;
  title: string;
  note: string | null;
  dateISO: string;
  time: string | null;
  repeat: FamilyReminderRepeat;
  status: FamilyReminderStatus;
  createdAt?: string;
  updatedAt?: string;
}

export type CareTeamCategory =
  | 'doctor'
  | 'grocery'
  | 'pharmacy'
  | 'hospital'
  | 'helper'
  | 'other';

export interface CareTeamMember {
  id: string;
  parentId: string;
  category: CareTeamCategory;
  serviceId: string | null;
  name: string;
  phone: string | null;
  note: string | null;
  setBy?: string | null;
  createdAt?: string;
}

export interface FamilyFavorite {
  id: string;
  parentId: string;
  serviceId: string;
  name: string;
  phone: string | null;
  category: ServiceCategory | null;
  note: string | null;
  addedBy?: string | null;
  createdAt?: string;
}

export interface ParentAnalytics {
  lastActiveAt: string | null;
  assistantEvents7d: number;
  assistantEvents30d: number;
  callbacks: { status: string; created_at: string; issue: string | null }[];
  reminders: { upcoming: number; overdue: number; done7d: number };
  careTeamCount: number;
  favoritesCount: number;
}

export type UserRole = 'user' | 'admin' | 'super_admin';

export type PostCategory =
  | 'general'
  | 'health'
  | 'travel'
  | 'daily_life'
  | 'best_practice';

// Moderation state. Rows created before moderation existed have no status —
// treat missing/undefined/null as 'approved' so legacy posts stay visible.
export type PostStatus = 'pending' | 'approved' | 'rejected';

export interface CommunityPost {
  id: string;
  author_id: string | null;
  category: PostCategory;
  title: string;
  body: string;
  created_at: string;
  status?: PostStatus | null;
  // joined / computed
  author_name?: string | null;
  reply_count?: number;
  like_count?: number;
  liked_by_me?: boolean;
}

export interface CommunityReply {
  id: string;
  post_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author_name?: string | null;
}

export interface CallbackRequestInput {
  name: string;
  phone: string;
  issue: string;
  source?: 'help' | 'assistant' | 'service';
  serviceId?: string | null;
  token?: string | null;
}
