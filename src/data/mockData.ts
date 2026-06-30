import { Service, CommunityPost, CommunityReply } from '../lib/types';
import services from './services.json';

// Offline fallback and database seed share this one audited source of truth.
export const MOCK_SERVICES: Service[] = services.map((service, index) => ({
  ...service,
  id: `m-service-${index + 1}`,
  image_url: null,
})) as Service[];

export const MOCK_POSTS: (CommunityPost & { replies: CommunityReply[] })[] = [
  {
    id: 'm-post-1',
    author_id: null,
    author_name: 'Priya (London)',
    category: 'health',
    title: 'Reliable physiotherapist for my father in Siliguri?',
    body: 'My father had a knee operation. Looking for someone trustworthy who can visit at home a few times a week. Any recommendations?',
    created_at: '2026-06-20T10:00:00Z',
    reply_count: 1,
    like_count: 5,
    replies: [
      {
        id: 'm-r-1',
        post_id: 'm-post-1',
        author_id: null,
        author_name: 'Sunita (Siliguri)',
        body: 'Manipal Hospitals in Pradhan Nagar can refer a home physio — they were helpful for my mother.',
        created_at: '2026-06-20T11:30:00Z',
      },
    ],
  },
  {
    id: 'm-post-2',
    author_id: null,
    author_name: 'Ramesh (Siliguri)',
    category: 'best_practice',
    title: 'Tip: keep a printed medicine list on the fridge',
    body: 'For my parents I printed a big list of their medicines and timings and stuck it on the fridge. Helps any helper or neighbour in an emergency.',
    created_at: '2026-06-19T08:00:00Z',
    reply_count: 0,
    like_count: 12,
    replies: [],
  },
];
