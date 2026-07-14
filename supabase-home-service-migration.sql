-- Saathi home-service category migration.
-- Run on an existing Supabase project before reseeding services.json.

alter table public.services drop constraint if exists services_category_check;
alter table public.services
  add constraint services_category_check
  check (category in ('elder_home','doctor','hospital','medical_shop','travel_agent','home_service','daily_service'));
