-- Saathi migration 2: add Elder Care Homes category + source tracking.
-- Run in Supabase dashboard -> SQL Editor (after supabase-schema.sql).

-- Allow the new 'elder_home' category.
alter table public.services drop constraint if exists services_category_check;
alter table public.services
  add constraint services_category_check
  check (category in ('elder_home','doctor','hospital','medical_shop','travel_agent','home_service','daily_service'));

-- Track where each listing came from (a public web source), for traceability.
alter table public.services add column if not exists source_url text;
