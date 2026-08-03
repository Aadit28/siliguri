-- Saathi migration 14: second and third cities (Bengaluru, Ahilyanagar)
-- Run in Supabase dashboard -> SQL Editor, on BOTH projects.
--
-- Migration 3 already made the schema city-aware (cities table, services.city_id,
-- user_accounts.city_id). Nothing ever wrote those columns, so every directory
-- row is city-less and the app shows one global list. This migration adds the
-- two new cities and backfills the existing rows to Siliguri, so that filtering
-- by city cannot silently empty the directory for the launch city.

-- 1. CITIES
insert into public.cities (name, slug, state)
values
  ('Bengaluru', 'bengaluru', 'Karnataka'),
  ('Ahilyanagar', 'ahilyanagar', 'Maharashtra')
on conflict (slug) do nothing;

-- 2. BACKFILL: every existing directory row and announcement predates
--    multi-city and belongs to the launch city.
update public.services
set city_id = (select id from public.cities where slug = 'siliguri')
where city_id is null;

update public.announcements
set city_id = (select id from public.cities where slug = 'siliguri')
where city_id is null;

-- 3. The directory read path now filters on city on every load.
create index if not exists services_city_id_idx on public.services (city_id);
create index if not exists announcements_city_id_idx on public.announcements (city_id);
