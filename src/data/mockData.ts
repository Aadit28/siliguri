import { Service, CommunityPost, CommunityReply } from '../lib/types';
import services from './services.json';

// Offline fallback and database seed share this one audited source of truth.
export const MOCK_SERVICES: Service[] = services.map((service, index) => ({
  ...service,
  id: `m-service-${index + 1}`,
  image_url: null,
})) as Service[];

// Community starts empty — real posts only.
export const MOCK_POSTS: (CommunityPost & { replies: CommunityReply[] })[] = [];
