import { supabase, supabaseConfigured } from './supabase';
import { Service, CommunityPost, CommunityReply, PostCategory } from './types';
import { MOCK_SERVICES, MOCK_POSTS } from '../data/mockData';

// Each function tries Supabase first and falls back to mock data so the app
// is always usable — even before the SQL schema is applied or while offline.

export const usingMockFlag = { value: !supabaseConfigured };

export async function fetchServices(): Promise<Service[]> {
  if (!supabaseConfigured) return MOCK_SERVICES;
  try {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('verified', { ascending: false })
      .order('rating', { ascending: false });
    if (error) throw error;
    if (!data || data.length === 0) return MOCK_SERVICES;
    usingMockFlag.value = false;
    return data as Service[];
  } catch (e) {
    console.warn('[Saathi] services fell back to mock:', (e as Error).message);
    usingMockFlag.value = true;
    return MOCK_SERVICES;
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
  authorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured) return { ok: false, error: 'Backend not configured' };
  const { error } = await supabase.from('community_posts').insert({
    title: input.title,
    body: input.body,
    category: input.category,
    author_id: input.authorId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function createReply(input: {
  postId: string;
  body: string;
  authorId: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseConfigured) return { ok: false, error: 'Backend not configured' };
  const { error } = await supabase.from('community_replies').insert({
    post_id: input.postId,
    body: input.body,
    author_id: input.authorId,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function toggleLike(postId: string, userId: string, liked: boolean) {
  if (!supabaseConfigured) return;
  if (liked) {
    await supabase.from('post_likes').delete().match({ post_id: postId, user_id: userId });
  } else {
    await supabase.from('post_likes').insert({ post_id: postId, user_id: userId });
  }
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
  if (isFav) {
    await supabase.from('favorites').delete().match({ service_id: serviceId, user_id: userId });
  } else {
    await supabase.from('favorites').insert({ service_id: serviceId, user_id: userId });
  }
}

function countBy<T extends Record<string, any>>(rows: T[], key: keyof T): Record<string, number> {
  return rows.reduce((acc, row) => {
    const k = String(row[key]);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
