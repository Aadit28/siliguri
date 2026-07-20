import { supabase, supabaseConfigured } from './supabase';
import { Service, CommunityPost, CommunityReply, PostCategory, CallbackRequestInput } from './types';
import { MOCK_SERVICES, MOCK_POSTS } from '../data/mockData';
import { backendRequest } from './backend';

// Each function tries Supabase first and falls back to mock data so the app
// is always usable — even before the SQL schema is applied or while offline.

export const usingMockFlag = { value: !supabaseConfigured };

export async function fetchServices(): Promise<Service[]> {
  if (!supabaseConfigured) return localCatalogServices();
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('verified', { ascending: false })
      .order('rating', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) {
      usingMockFlag.value = true;
      return localCatalogServices();
    }
    usingMockFlag.value = false;
    return mergeServiceCatalog(data as Service[]);
  } catch (e) {
    console.warn('[Saathi] services fell back to mock:', (e as Error).message);
    usingMockFlag.value = true;
    return localCatalogServices();
  }
}

export async function fetchService(id: string): Promise<Service | null> {
  const mock = MOCK_SERVICES.find((service) => service.id === id) ?? null;
  if (!supabaseConfigured || id.startsWith('m-')) return mock;

  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeServiceTrust(data as Service) : null;
  } catch (e) {
    console.warn('[Saathi] service detail failed:', (e as Error).message);
    return mock ? normalizeServiceTrust(mock) : null;
  }
}

export async function fetchPosts(currentUserId?: string | null): Promise<CommunityPost[]> {
  if (!supabaseConfigured) return MOCK_POSTS;
  try {
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!posts || posts.length === 0) return MOCK_POSTS;

    const ids = posts.map((p) => p.id);
    const [{ data: replies }, { data: likes }] = await Promise.all([
      supabase.from('community_replies').select('post_id').in('post_id', ids),
      supabase.from('post_likes').select('post_id, user_id').in('post_id', ids),
    ]);

    const replyCount = countBy(replies ?? [], 'post_id');
    const likeCount = countBy(likes ?? [], 'post_id');
    const likedByMe = new Set(
      (likes ?? [])
        .filter((l: any) => currentUserId && l.user_id === currentUserId)
        .map((l: any) => l.post_id),
    );

    return (posts as CommunityPost[]).map((p) => ({
      ...p,
      reply_count: replyCount[p.id] ?? 0,
      like_count: likeCount[p.id] ?? 0,
      liked_by_me: likedByMe.has(p.id),
    }));
  } catch (e) {
    console.warn('[Saathi] posts fell back to mock:', (e as Error).message);
    return MOCK_POSTS;
  }
}

export async function fetchPost(id: string): Promise<CommunityPost | null> {
  const mock = MOCK_POSTS.find((p) => p.id === id);
  if (!supabaseConfigured || id.startsWith('m-')) return mock ?? null;
  try {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as CommunityPost;
  } catch {
    return mock ?? null;
  }
}

export async function fetchReplies(postId: string): Promise<CommunityReply[]> {
  const mock = MOCK_POSTS.find((p) => p.id === postId)?.replies ?? [];
  if (!supabaseConfigured || postId.startsWith('m-')) return mock;
  try {
    const { data, error } = await supabase
      .from('community_replies')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as CommunityReply[]) ?? [];
  } catch {
    return mock;
  }
}

export async function createPost(input: {
  title: string;
  body: string;
  category: PostCategory;
  token: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured) return { ok: false, error: 'Backend not configured' };
  try {
    await backendRequest('/api/community/post', {
      method: 'POST',
      token: input.token,
      body: { title: input.title, body: input.body, category: input.category, status: 'pending' },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function createCallbackRequest(input: CallbackRequestInput): Promise<{ ok: boolean; error?: string }> {
  try {
    await backendRequest('/api/callback/request', {
      method: 'POST',
      token: input.token,
      body: {
        name: input.name,
        phone: input.phone,
        issue: input.issue,
        source: input.source ?? 'help',
        serviceId: input.serviceId ?? null,
      },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function createReply(input: {
  postId: string;
  body: string;
  token: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured) return { ok: false, error: 'Backend not configured' };
  try {
    await backendRequest('/api/community/reply', {
      method: 'POST',
      token: input.token,
      body: { postId: input.postId, body: input.body },
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function toggleLike(postId: string, token: string, liked: boolean) {
  if (!supabaseConfigured) return;
  await backendRequest('/api/community/like', {
    method: 'POST',
    token,
    body: { postId, liked },
  }).catch((error) => console.warn('[Saathi] like failed:', (error as Error).message));
}

// ----- Favorites -----
export async function fetchFavoriteIds(userId: string): Promise<Set<string>> {
  if (!supabaseConfigured) return new Set();
  try {
    const { data, error } = await supabase
      .from('favorites')
      .select('service_id')
      .eq('user_id', userId);
    if (error) throw error;
    return new Set((data ?? []).map((f: any) => f.service_id));
  } catch {
    return new Set();
  }
}

export async function toggleFavorite(serviceId: string, userId: string, isFav: boolean) {
  if (!supabaseConfigured) return;
  const { error } = isFav
    ? await supabase.from('favorites').delete().match({ service_id: serviceId, user_id: userId })
    : await supabase.from('favorites').insert({ service_id: serviceId, user_id: userId });
  if (error) throw error;
}

function countBy<T extends Record<string, any>>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce((acc, row) => {
    const k = String(row[key]);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function normalizeServiceTrust(service: Service): Service {
  const verified = Boolean(service.verified);
  return {
    ...service,
    verified,
    verification_status:
      service.verification_status ??
      (verified && service.phone_confirmed ? 'phone_confirmed' : verified && service.source_url ? 'source_linked' : 'unverified'),
    claim_status: service.claim_status ?? 'unclaimed',
    hours_confidence: service.hours_confidence ?? (service.hours ? 'source' : 'unknown'),
    service_area: service.service_area ?? service.town ?? null,
    languages: Array.isArray(service.languages) ? service.languages : null,
  };
}

function localCatalogServices() {
  return MOCK_SERVICES.map(normalizeServiceTrust);
}

function mergeServiceCatalog(remoteServices: Service[]) {
  const normalizedRemote = remoteServices.map(normalizeServiceTrust);
  const known = new Set(normalizedRemote.map(serviceIdentity));
  const localAdditions = localCatalogServices().filter((service) => {
    const key = serviceIdentity(service);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });

  return [...normalizedRemote, ...localAdditions];
}

function serviceIdentity(service: Service) {
  return [service.name, service.town ?? service.address ?? '']
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
