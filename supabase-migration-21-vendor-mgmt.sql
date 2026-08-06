-- Migration 21: vendor self-management
--
-- Everything in the booking core so far treats a vendor as a row somebody else
-- maintains: services rows are seeded by the admin tools, slots by
-- scripts/seed-vendor-slots.js, and the vendor's only voice in the system is a
-- WhatsApp Accept/Reject tap (server/bookings/vendor-callback.js). This
-- migration is the one link that was missing for a vendor to hold their own
-- calendar: which LOGIN owns which services row.
--
-- Deliberately one column. The four vendor endpoints in server/vendor/ need no
-- new tables, no new statuses and no new RPCs:
--
--   * slot writes are ordinary upserts, because vendor_slots already carries
--     unique (vendor_id, starts_at) and the check constraint booked <= capacity
--     from migration 17 — a vendor shrinking a slot below its sold seats is
--     refused by Postgres, not by application code that could be raced;
--   * slot deletes are a single delete ... where id = ? and booked = 0, which
--     is atomic on its own, and bookings.slot_id references vendor_slots on
--     delete restrict, so a slot with any history at all is protected by the
--     foreign key even when its live seat count is zero;
--   * accept/decline is the same claim-checked status update the WhatsApp
--     webhook already makes.
--
-- Adding a table or an RPC here would have meant a second way to do each of
-- those, which is how the two paths drift apart.

-- 1. OWNERSHIP ---------------------------------------------------------------
-- Null is the norm, not an anomaly: the directory is a scrape plus admin entry,
-- and the overwhelming majority of services rows will never have anyone signed
-- in behind them. Claiming is opt-in, one row at a time.
--
-- on delete set null, not cascade: a vendor deleting their login must not take
-- the shop out of the directory an elder is searching. The row simply goes back
-- to being unclaimed.
--
-- No unique constraint on owner_account_id. A single owner legitimately holds
-- several rows — a clinic listed under both 'doctor' and 'medical_shop', or a
-- travel agent with two branches — and the endpoints resolve that by asking
-- which one rather than by assuming there is only ever one.
alter table public.services
  add column if not exists owner_account_id uuid
  references public.user_accounts(id) on delete set null;

-- Partial: the index exists to answer "what does THIS login own", which is one
-- lookup per vendor request, and indexing the null majority would be most of
-- the directory for no reader.
create index if not exists services_owner_account_idx
  on public.services (owner_account_id)
  where owner_account_id is not null;

comment on column public.services.owner_account_id is
  'user_accounts.id of the login that manages this listing. Null = unclaimed '
  '(the directory default). Set by an admin when a vendor is verified; grants '
  'the /api/vendor/* endpoints over this row and nothing else.';

-- 2. NOTHING ELSE ------------------------------------------------------------
-- No RLS policy is added. Every server handler in this project authenticates
-- with a custom token and reads through the service-role client (see
-- server/_lib/auth.js), so a policy written against auth.uid() would be dead
-- code that reads like a live control — the same trap the favorites policy
-- fell into. The access check for these endpoints lives in
-- server/vendor/_shared.js: resolve the caller's owned services rows, then
-- refuse anything outside that set.
