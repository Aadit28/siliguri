-- Migration 12 — durable rate limiting.
--
-- The in-memory limiters reset on every cold start and do not add up across
-- serverless instances, so a patient attacker gets a fresh allowance per
-- instance. This table makes the caps hold: one row per counted event, keyed
-- by a bucket string like 'signin-fail:id:<username>'. Only FAILED sign-ins
-- are recorded, so a busy legitimate user never spends the budget.
--
-- Rows are pruned by the daily digest cron (anything older than two days);
-- the windows in use are 24 hours or less. RLS with no policies: service-role
-- access only, like push_tokens.

create table if not exists public.rate_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_events_bucket_created_idx
  on public.rate_events (bucket, created_at desc);

alter table public.rate_events enable row level security;
