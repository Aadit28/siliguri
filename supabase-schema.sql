-- Saathi MVP schema for Supabase
-- Run in Supabase dashboard -> SQL Editor

-- 1. USER ACCOUNTS (username/password auth, no email confirmation flow)
create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  phone_number text unique,
  full_name text,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz default now()
);

alter table public.user_accounts add column if not exists phone_number text;
create unique index if not exists user_accounts_phone_number_key
  on public.user_accounts(phone_number)
  where phone_number is not null;

create table if not exists public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

-- 2. PROFILES
create table if not exists public.profiles (
  id uuid primary key,
  full_name text,
  locale text default 'hi',
  created_at timestamptz default now()
);

alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 3. SERVICES directory
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('elder_home','doctor','hospital','medical_shop','travel_agent','home_service','daily_service')),
  description text,
  phone text,
  address text,
  map_url text,
  image_url text,
  hours text,
  rating numeric(2,1) default 0,
  verified boolean default false,
  town text default 'Siliguri',
  source_url text,
  verification_status text default 'unverified' check (verification_status in ('unverified','source_linked','phone_confirmed','claimed','recently_reverified')),
  verified_at timestamptz,
  verified_by text,
  verification_note text,
  phone_confirmed boolean default false,
  claim_status text default 'unclaimed' check (claim_status in ('unclaimed','claim_started','claimed','rejected')),
  service_area text,
  languages text[],
  hours_confidence text default 'unknown' check (hours_confidence in ('unknown','source','phone_confirmed')),
  created_at timestamptz default now()
);

alter table public.services add column if not exists source_url text;
alter table public.services add column if not exists verification_status text default 'unverified';
alter table public.services add column if not exists verified_at timestamptz;
alter table public.services add column if not exists verified_by text;
alter table public.services add column if not exists verification_note text;
alter table public.services add column if not exists phone_confirmed boolean default false;
alter table public.services add column if not exists claim_status text default 'unclaimed';
alter table public.services add column if not exists service_area text;
alter table public.services add column if not exists languages text[];
alter table public.services add column if not exists hours_confidence text default 'unknown';

-- 4. FAVORITES
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, service_id)
);
alter table public.favorites drop constraint if exists favorites_user_id_fkey;

-- 5. COMMUNITY POSTS
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid,
  author_name text,
  category text not null default 'general' check (category in ('general','health','travel','daily_life','best_practice')),
  title text not null,
  body text not null,
  status text not null default 'approved' check (status in ('pending','approved','rejected','hidden')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
alter table public.community_posts drop constraint if exists community_posts_author_id_fkey;
alter table public.community_posts add column if not exists author_name text;
alter table public.community_posts add column if not exists status text not null default 'approved';
alter table public.community_posts add column if not exists reviewed_by text;
alter table public.community_posts add column if not exists reviewed_at timestamptz;

-- 6. COMMUNITY REPLIES
create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid,
  author_name text,
  body text not null,
  created_at timestamptz default now()
);
alter table public.community_replies drop constraint if exists community_replies_author_id_fkey;
alter table public.community_replies add column if not exists author_name text;

-- 7. POST LIKES
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);
alter table public.post_likes drop constraint if exists post_likes_user_id_fkey;

-- 8. PILOT OPERATIONS -------------------------------------------------------
create table if not exists public.callback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  phone text not null,
  issue text,
  source text not null default 'help' check (source in ('help','assistant','service')),
  status text not null default 'new' check (status in ('new','queued','contacted','closed','spam')),
  assigned_to text,
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.assistant_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  prompt_text text,
  source text,
  intent text,
  status text,
  service_ids uuid[],
  image_count int default 0,
  created_at timestamptz default now()
);

create table if not exists public.service_verification_events (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  status text not null,
  method text,
  note text,
  verified_by text,
  verified_at timestamptz default now()
);

create table if not exists public.provider_claims (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  claimant_name text not null,
  claimant_phone text not null,
  claimant_role text,
  status text not null default 'new' check (status in ('new','reviewing','approved','rejected')),
  note text,
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  city text default 'Siliguri',
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.elder_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  full_name text not null,
  phone text,
  preferred_language text default 'hi',
  locality text,
  emergency_note text,
  created_at timestamptz default now()
);

create table if not exists public.family_memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid,
  display_name text not null,
  phone text,
  role text not null default 'family' check (role in ('elder','child_abroad','local_family','neighbor','operator','family')),
  created_at timestamptz default now()
);

create table if not exists public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  title text not null,
  details text,
  status text not null default 'open' check (status in ('open','in_progress','waiting_on_provider','done','cancelled')),
  due_at timestamptz,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.consent_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  household_id uuid references public.households(id) on delete set null,
  consent_type text not null,
  version text not null,
  granted boolean not null default true,
  created_at timestamptz default now()
);

create table if not exists public.moderation_events (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('post','reply','service','callback')),
  subject_id uuid not null,
  action text not null,
  reason text,
  reviewer text,
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY ---------------------------------------------------------
alter table public.user_accounts enable row level security;
alter table public.auth_tokens enable row level security;
alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.favorites enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.post_likes enable row level security;
alter table public.callback_requests enable row level security;
alter table public.assistant_events enable row level security;
alter table public.service_verification_events enable row level security;
alter table public.provider_claims enable row level security;
alter table public.households enable row level security;
alter table public.elder_profiles enable row level security;
alter table public.family_memberships enable row level security;
alter table public.care_tasks enable row level security;
alter table public.consent_receipts enable row level security;
alter table public.moderation_events enable row level security;

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
create policy "posts_read" on public.community_posts for select using (status = 'approved');
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

-- Auth writes happen only through Vercel API routes using SUPABASE_SERVICE_ROLE_KEY.
