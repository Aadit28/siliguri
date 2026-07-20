-- Saathi migration 5: city helper role
-- Run in Supabase dashboard -> SQL Editor
-- City helpers are trusted locals ("city mods") an admin appoints. They can
-- add services/places and publish announcements for their own city, but they
-- cannot mark services verified or manage other helpers.

do $$
begin
  alter table public.user_accounts drop constraint if exists user_accounts_role_check;
  alter table public.user_accounts add constraint user_accounts_role_check
    check (role in ('user','city_helper','admin','super_admin'));
end $$;

-- Helpers are normally appointed from the app (Admin portal -> City helpers).
-- Manual fallback:
-- update public.user_accounts
--   set role='city_helper', city_id=(select id from public.cities where slug='siliguri')
--   where username='<username>';
