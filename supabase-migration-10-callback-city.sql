-- Migration 10 — callback city scoping + consent receipt integrity.
--
-- 1) callback_requests.city_id: the admin callback queue must be scoped per
--    city (a city_helper in one city must not see another city's citizen
--    names/phones). Nullable: legacy rows and requests from users without a
--    city stay visible to super admins only.
-- 2) consent_receipts uniqueness: the API's duplicate-detection branch assumed
--    a unique constraint that never existed; add it so re-consent upserts
--    instead of stacking rows.

alter table public.callback_requests
  add column if not exists city_id uuid references public.cities(id) on delete set null;

create index if not exists callback_requests_city_id_idx
  on public.callback_requests (city_id);

-- Backfill from the requesting user's city where known.
update public.callback_requests cr
set city_id = ua.city_id
from public.user_accounts ua
where cr.user_id = ua.id
  and cr.city_id is null
  and ua.city_id is not null;

-- Consent receipts: one live receipt per (user, consent type, version) so the
-- API's duplicate-detection branch works instead of stacking identical rows.
create unique index if not exists consent_receipts_user_type_version_key
  on public.consent_receipts (user_id, consent_type, version);
