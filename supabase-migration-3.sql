-- Saathi migration 3: cities, roles, announcements, service upi/city
-- Run in Supabase dashboard -> SQL Editor

-- 1. CITIES
create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  state text,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.cities enable row level security;
drop policy if exists "cities_read" on public.cities;
create policy "cities_read" on public.cities for select using (true);

insert into public.cities (name, slug, state)
values ('Siliguri', 'siliguri', 'West Bengal')
on conflict (slug) do nothing;

-- 2. USER ACCOUNTS: role + city
alter table public.user_accounts add column if not exists role text not null default 'user';
alter table public.user_accounts add column if not exists city_id uuid references public.cities(id);

do $$
begin
  alter table public.user_accounts drop constraint if exists user_accounts_role_check;
  alter table public.user_accounts add constraint user_accounts_role_check check (role in ('user','admin','super_admin'));
end $$;

-- 3. SERVICES: city + upi + category (add elder_home)
alter table public.services add column if not exists city_id uuid references public.cities(id);
alter table public.services add column if not exists upi_id text;

alter table public.services drop constraint if exists services_category_check;
alter table public.services add constraint services_category_check
  check (category in ('doctor','hospital','medical_shop','travel_agent','elder_home','home_service','daily_service'));

-- 4. ANNOUNCEMENTS
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  city_id uuid references public.cities(id),
  author_id uuid references public.user_accounts(id),
  author_name text,
  title text not null,
  body text not null,
  title_hi text,
  body_hi text,
  active boolean default true,
  created_at timestamptz default now()
);

alter table public.announcements enable row level security;
drop policy if exists "announcements_read" on public.announcements;
create policy "announcements_read" on public.announcements for select using (active = true);

-- Writes only via service_role API (no insert/update policy here), same pattern as existing schema.

-- HOW TO PROMOTE AN ADMIN ----------------------------------------------------
-- update public.user_accounts set role='admin', city_id=(select id from public.cities where slug='siliguri') where username='<username>';
