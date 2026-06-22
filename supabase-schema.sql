-- Saathi MVP schema for Supabase
-- Run in Supabase dashboard -> SQL Editor

-- 1. PROFILES (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  locale text default 'hi',
  created_at timestamptz default now()
);

-- 2. SERVICES directory
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('doctor','hospital','medical_shop','travel_agent','daily_service')),
  description text,
  phone text,
  address text,
  map_url text,
  image_url text,
  hours text,
  rating numeric(2,1) default 0,
  verified boolean default false,
  town text default 'Siliguri',
  created_at timestamptz default now()
);

-- 3. FAVORITES
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, service_id)
);

-- 4. COMMUNITY POSTS
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  category text not null default 'general' check (category in ('general','health','travel','daily_life','best_practice')),
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

-- 5. COMMUNITY REPLIES
create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz default now()
);

-- 6. POST LIKES
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);

-- ROW LEVEL SECURITY ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.favorites enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.post_likes enable row level security;

-- Services: anyone can read; only service_role/admin writes (via seed script)
drop policy if exists "services_read" on public.services;
create policy "services_read" on public.services for select using (true);

-- Profiles: user manages own
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles for select using (true);
drop policy if exists "profiles_self_upsert" on public.profiles;
create policy "profiles_self_upsert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update using (auth.uid() = id);

-- Favorites: user manages own
drop policy if exists "fav_select" on public.favorites;
create policy "fav_select" on public.favorites for select using (auth.uid() = user_id);
drop policy if exists "fav_insert" on public.favorites;
create policy "fav_insert" on public.favorites for insert with check (auth.uid() = user_id);
drop policy if exists "fav_delete" on public.favorites;
create policy "fav_delete" on public.favorites for delete using (auth.uid() = user_id);

-- Community posts: anyone reads; authenticated creates; author edits/deletes
drop policy if exists "posts_read" on public.community_posts;
create policy "posts_read" on public.community_posts for select using (true);
drop policy if exists "posts_insert" on public.community_posts;
create policy "posts_insert" on public.community_posts for insert with check (auth.uid() = author_id);
drop policy if exists "posts_update" on public.community_posts;
create policy "posts_update" on public.community_posts for update using (auth.uid() = author_id);
drop policy if exists "posts_delete" on public.community_posts;
create policy "posts_delete" on public.community_posts for delete using (auth.uid() = author_id);

-- Replies: anyone reads; authenticated creates; author deletes
drop policy if exists "replies_read" on public.community_replies;
create policy "replies_read" on public.community_replies for select using (true);
drop policy if exists "replies_insert" on public.community_replies;
create policy "replies_insert" on public.community_replies for insert with check (auth.uid() = author_id);
drop policy if exists "replies_delete" on public.community_replies;
create policy "replies_delete" on public.community_replies for delete using (auth.uid() = author_id);

-- Likes: anyone reads; user manages own
drop policy if exists "likes_read" on public.post_likes;
create policy "likes_read" on public.post_likes for select using (true);
drop policy if exists "likes_insert" on public.post_likes;
create policy "likes_insert" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "likes_delete" on public.post_likes;
create policy "likes_delete" on public.post_likes for delete using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
