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
}

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
