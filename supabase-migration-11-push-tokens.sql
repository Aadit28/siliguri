-- Migration 11 — push notification tokens.
--
-- One row per (user, device token). The server sends through Expo's push API,
-- so the token is an ExponentPushToken string, not a raw FCM/APNs token. RLS is
-- enabled with no policies: the app talks to this table only through the API's
-- service-role client, and the anon key must not be able to read anyone's
-- device tokens.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  token text not null unique,
  platform text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;
