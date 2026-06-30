-- Saathi username auth migration.
-- Run this in Supabase SQL Editor if signup says the account is not being created.

create table if not exists public.user_accounts (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  full_name text,
  password_hash text not null,
  password_salt text not null,
  created_at timestamptz default now()
);

create table if not exists public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz default now()
);

alter table public.user_accounts enable row level security;
alter table public.auth_tokens enable row level security;

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles drop constraint if exists profiles_id_fkey;
  end if;

  if to_regclass('public.favorites') is not null then
    alter table public.favorites drop constraint if exists favorites_user_id_fkey;
  end if;

  if to_regclass('public.community_posts') is not null then
    alter table public.community_posts drop constraint if exists community_posts_author_id_fkey;
    alter table public.community_posts add column if not exists author_name text;
  end if;

  if to_regclass('public.community_replies') is not null then
    alter table public.community_replies drop constraint if exists community_replies_author_id_fkey;
    alter table public.community_replies add column if not exists author_name text;
  end if;

  if to_regclass('public.post_likes') is not null then
    alter table public.post_likes drop constraint if exists post_likes_user_id_fkey;
  end if;
end $$;
