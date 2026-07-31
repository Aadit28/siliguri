-- Migration 13 — in-app alert inbox.
--
-- Every server push also writes a row here, and the row is written even when
-- the user has no registered device: the web build and Expo Go cannot receive
-- push at all, so the bell's inbox is the only channel those users have.
-- Rows older than 30 days are pruned by the daily digest cron. RLS with no
-- policies: service-role only, reached through /api/notify/alerts.

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  title text not null,
  body text,
  url text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists alerts_user_created_idx
  on public.alerts (user_id, created_at desc);

alter table public.alerts enable row level security;
