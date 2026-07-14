-- Saathi pilot-readiness migration.
-- Run this on an existing Saathi Supabase project before enabling the public pilot.

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

alter table public.community_posts add column if not exists status text not null default 'approved';
alter table public.community_posts add column if not exists reviewed_by text;
alter table public.community_posts add column if not exists reviewed_at timestamptz;

create table if not exists public.callback_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  phone text not null,
  issue text,
  source text not null default 'help',
  status text not null default 'new',
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
  status text not null default 'new',
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
  role text not null default 'family',
  created_at timestamptz default now()
);

create table if not exists public.care_tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  title text not null,
  details text,
  status text not null default 'open',
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
  subject_type text not null,
  subject_id uuid not null,
  action text not null,
  reason text,
  reviewer text,
  created_at timestamptz default now()
);

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

drop policy if exists "posts_read" on public.community_posts;
create policy "posts_read" on public.community_posts for select using (status = 'approved');
