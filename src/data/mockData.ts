import { Service, CommunityPost, CommunityReply } from '../lib/types';
import siliguri from './services.json';
import bangalore from './services.bangalore.json';
import ahilyanagar from './services.ahilyanagar.json';

// Offline fallback and database seed share this one audited source of truth,
// now one audited file per city. Ids are prefixed by slug so two cities can be
// loaded at once (the guardian dashboard resolves pinned services across
// cities) without colliding on m-service-1.
function toServices(slug: string, rows: unknown[]): Service[] {
  return rows.map((service, index) => ({
    ...(service as object),
    id: `m-${slug}-${index + 1}`,
    image_url: null,
  })) as Service[];
}

export const CITY_CATALOGS: Record<string, Service[]> = {
  siliguri: toServices('siliguri', siliguri as unknown[]),
  bengaluru: toServices('bengaluru', bangalore as unknown[]),
  ahilyanagar: toServices('ahilyanagar', ahilyanagar as unknown[]),
};

// Every bundled row, used where a lookup has no city in hand (a favourite
// pinned before the city was set, a deep-linked service detail).
export const MOCK_SERVICES: Service[] = Object.values(CITY_CATALOGS).flat();

// Community starts empty — real posts only.
export const MOCK_POSTS: (CommunityPost & { replies: CommunityReply[] })[] = [];
