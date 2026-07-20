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

export type ReminderRepeat = 'once' | 'daily' | 'weekly';

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
}

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

export interface CommunityPost {
  id: string;
  author_id: string | null;
  category: PostCategory;
  title: string;
  body: string;
  created_at: string;
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
