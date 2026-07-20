-- Saathi OTP hardening migration.
-- Run after supabase-migration-6-phone-otp.sql.

-- Daily per-phone send cap tracking (used by api/auth/otp-request.js).
alter table public.phone_otps
  add column if not exists send_count integer not null default 1;
alter table public.phone_otps
  add column if not exists day_started_at timestamptz not null default now();

-- Atomic attempt counter (used by api/auth/otp-verify.js). Incrementing
-- server-side before the hash compare closes the read-then-write race that
-- let parallel requests bypass the attempt cap.
create or replace function public.increment_otp_attempts(otp_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  update public.phone_otps
     set attempts = attempts + 1
   where id = otp_id
   returning attempts;
$$;

-- Only the service-role key (Vercel API) may call this, matching the
-- no-policies stance on phone_otps.
revoke execute on function public.increment_otp_attempts(uuid) from public, anon, authenticated;
grant execute on function public.increment_otp_attempts(uuid) to service_role;
