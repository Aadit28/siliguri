export type ServiceCategory =
  | 'elder_home'
  | 'doctor'
  | 'hospital'
  | 'medical_shop'
  | 'travel_agent'
  | 'daily_service';

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
