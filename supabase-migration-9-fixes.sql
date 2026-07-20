-- Saathi migration 9: security + consistency fixes
-- Run in Supabase dashboard -> SQL Editor
-- Safe to run on databases at any prior migration level (additive / idempotent).

-- 1. Replies on moderated posts were publicly readable (policy was `using (true)`).
--    Restrict reads to replies whose parent post is approved.
drop policy if exists "replies_read" on public.community_replies;
create policy "replies_read" on public.community_replies for select using (
  exists (
    select 1 from public.community_posts p
    where p.id = community_replies.post_id and p.status = 'approved'
  )
);

-- 2. Migration 3 recreated services_category_check without 'home_service',
--    contradicting the base schema. Recreate with the full category list.
alter table public.services drop constraint if exists services_category_check;
alter table public.services add constraint services_category_check
  check (category in ('elder_home','doctor','hospital','medical_shop','travel_agent','home_service','daily_service'));

-- 3. Ensure role/city columns exist even on databases bootstrapped from an old
--    schema without migration 3 (api/_lib/auth.js always selects them).
alter table public.user_accounts add column if not exists role text not null default 'user';
alter table public.user_accounts add column if not exists city_id uuid;
