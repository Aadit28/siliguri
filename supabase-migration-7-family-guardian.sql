-- Saathi migration 7: family / guardian links.
-- Children abroad ("guardians") link to a parent's account by phone + WhatsApp
-- OTP, then help manage reminders, care-team contacts and saved services on the
-- parent's behalf. Run after supabase-migration-6-phone-otp.sql.
-- All tables are service-role only (Vercel API): RLS on, no public policies,
-- same as the auth/OTP tables.

-- 1. FAMILY LINKS -----------------------------------------------------------
-- One row per (guardian, parent phone). parent_id stays null until the OTP is
-- verified and the phone resolves to a real account.
create table if not exists public.family_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.user_accounts(id) on delete cascade,
  parent_id uuid references public.user_accounts(id) on delete cascade,
  parent_phone text not null,
  relationship text,
  status text not null default 'pending' check (status in ('pending','active','revoked')),
  otp_hash text,
  otp_expires_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (guardian_id, parent_phone)
);

create index if not exists family_links_parent_id_idx on public.family_links(parent_id);
create index if not exists family_links_guardian_id_idx on public.family_links(guardian_id);

-- 2. FAMILY REMINDERS -------------------------------------------------------
-- Set by the parent or an active-linked guardian. date_iso is YYYY-MM-DD and
-- time is HH:mm (24h) so the client can render without parsing a timestamptz.
create table if not exists public.family_reminders (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.user_accounts(id) on delete cascade,
  created_by uuid not null,
  title text not null,
  note text,
  date_iso text not null,
  time text,
  repeat text not null default 'once' check (repeat in ('once','daily','weekly','monthly')),
  status text not null default 'active' check (status in ('active','done','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_reminders_parent_id_idx on public.family_reminders(parent_id);

-- 3. CARE TEAM --------------------------------------------------------------
-- The people/places a parent relies on. Multiple entries per category allowed;
-- service_id is optional (a free-typed contact needs no directory entry).
create table if not exists public.care_team (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.user_accounts(id) on delete cascade,
  category text not null check (category in ('doctor','grocery','pharmacy','hospital','helper','other')),
  service_id uuid references public.services(id) on delete set null,
  name text not null,
  phone text,
  note text,
  set_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists care_team_parent_id_idx on public.care_team(parent_id);

-- 4. FAMILY FAVORITES -------------------------------------------------------
-- Directory services pinned to a parent's account. One row per service.
create table if not exists public.family_favorites (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.user_accounts(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  added_by uuid,
  note text,
  created_at timestamptz not null default now(),
  unique (parent_id, service_id)
);

create index if not exists family_favorites_parent_id_idx on public.family_favorites(parent_id);

-- ROW LEVEL SECURITY --------------------------------------------------------
-- No policies on purpose: only the service-role key (Vercel API) may read or
-- write these tables, same as the auth and OTP tables.
alter table public.family_links enable row level security;
alter table public.family_reminders enable row level security;
alter table public.care_team enable row level security;
alter table public.family_favorites enable row level security;
