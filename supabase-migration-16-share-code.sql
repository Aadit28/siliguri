-- Saathi migration 16: account share codes.
-- Run in Supabase dashboard -> SQL Editor, on BOTH projects.
--
-- A senior reads a short code off their profile screen and says it to a family
-- member over the phone. The family member types it into the app and becomes an
-- active guardian, without WhatsApp OTP ever being involved. The OTP path in
-- server/family/link.js stays exactly as it was; this is an additional door.
--
-- No backfill on purpose: codes are minted lazily by /api/family/code on the
-- first `get`, so accounts that never open the profile screen never carry one,
-- and a code that has never been spoken aloud never exists to be guessed.
--
-- Until this runs, server/family/code.js answers 503 with friendly copy rather
-- than a 500 — the column is absent, not the feature broken.

alter table public.user_accounts
  add column if not exists share_code text;

-- Partial unique index, not a unique constraint: every account without a code
-- holds null, and a plain unique constraint over many nulls is allowed in
-- Postgres but the partial index states the intent and stays smaller.
create unique index if not exists user_accounts_share_code_key
  on public.user_accounts (share_code)
  where share_code is not null;
