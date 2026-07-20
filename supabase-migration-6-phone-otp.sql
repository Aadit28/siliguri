-- Saathi WhatsApp/SMS OTP sign-in migration.
-- Run after supabase-migration-4-phone-auth.sql.

create table if not exists public.phone_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.phone_otps enable row level security;
-- No policies on purpose: only the service-role key (Vercel API) may touch OTPs.
