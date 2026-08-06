-- Saathi migration 17: booking core (vendor slots, holds, confirmations).
-- Run in Supabase dashboard -> SQL Editor, on BOTH projects, after migration 16.
--
-- A booking is money and a promise to an 80-year-old, so the seat is claimed in
-- the database rather than in the API: booking_hold takes it with one
-- conditional update, and the app and the voice agent reach it through the same
-- function with the same idempotency key. Nothing here trusts the caller for
-- city, vendor or slot ownership - those are read off the slot row.
--
-- There is no separate families table in this schema. Migration 7 anchors a
-- family on the elder's own account and attaches children abroad to it through
-- family_links(guardian_id, parent_id). bookings.family_id is that anchor
-- account and elder_id is the account the appointment is for; they differ only
-- in a household where one linked account books on another's behalf.

-- 1. VENDOR SLOTS ------------------------------------------------------------
create table if not exists public.vendor_slots (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.services(id) on delete restrict,
  starts_at timestamptz not null,
  duration_min int not null default 15 check (duration_min > 0),
  capacity int not null default 1 check (capacity > 0),
  booked int not null default 0 check (booked >= 0),
  city_id uuid not null references public.cities(id) on delete restrict,
  created_at timestamptz not null default now(),
  -- The overbooking guard sits on the table, not only inside booking_hold: a
  -- hand fix in the dashboard must not be able to sell the same seat twice.
  constraint vendor_slots_capacity_check check (booked <= capacity),
  -- Also serves as the (vendor_id, starts_at) lookup index, so there is no
  -- separate index for the vendor calendar read.
  unique (vendor_id, starts_at)
);

create index if not exists vendor_slots_city_starts_idx
  on public.vendor_slots (city_id, starts_at);

-- 2. BOOKINGS ----------------------------------------------------------------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.user_accounts(id) on delete cascade,
  elder_id uuid not null references public.user_accounts(id) on delete cascade,
  vendor_id uuid not null references public.services(id) on delete restrict,
  slot_id uuid not null references public.vendor_slots(id) on delete restrict,
  status text not null default 'held' check (status in (
    'held','pending_guardian','pending_vendor','confirmed','completed',
    'cancelled_user','cancelled_vendor_timeout','expired'
  )),
  hold_expires_at timestamptz,
  -- Null means "not quoted yet", which booking_confirm routes to a guardian
  -- rather than straight to the vendor.
  amount_paise int check (amount_paise is null or amount_paise >= 0),
  idempotency_key uuid not null unique,
  created_by text not null check (created_by in ('app','voice_agent')),
  city_id uuid not null references public.cities(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A held row without a deadline would never be swept and would hold its seat
  -- for ever.
  constraint bookings_held_expiry_check check (
    status <> 'held' or hold_expires_at is not null
  )
);

create index if not exists bookings_family_created_idx
  on public.bookings (family_id, created_at desc);
create index if not exists bookings_slot_id_idx
  on public.bookings (slot_id);

-- The sweeper reads only the three waiting states, so it gets one partial index
-- each instead of scanning every completed booking ever made.
create index if not exists bookings_hold_expiry_idx
  on public.bookings (hold_expires_at) where status = 'held';
create index if not exists bookings_vendor_wait_idx
  on public.bookings (updated_at) where status = 'pending_vendor';
create index if not exists bookings_guardian_wait_idx
  on public.bookings (updated_at) where status = 'pending_guardian';

-- updated_at is not decoration here: it is the clock booking_release_expired
-- reads for both the guardian wait and the vendor wait, so leaving it to each
-- writer to remember is a seat that never comes back. The trigger makes every
-- update to a booking restart that clock, whatever wrote it - the confirm
-- function, the approve endpoint, a hand fix in the dashboard.
--
-- security invoker, like the migration 15 triggers: the row is already being
-- written by whoever fired this, so the function needs no privileges of its
-- own; search_path is still pinned because an empty one is the only search
-- path that cannot be pointed somewhere else.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- 3. FAMILY READ HELPER ------------------------------------------------------
-- A policy expression runs with the querying role's privileges, and
-- authenticated holds nothing on family_links, so the guardian check has to be
-- borrowed through a definer function. Mirrors requireFamilyLink() in
-- server/_lib/auth.js.
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_family_id is not null
    and (
      auth.uid() = p_family_id
      or exists (
        select 1 from public.family_links link
        where link.parent_id = p_family_id
          and link.guardian_id = auth.uid()
          and link.status = 'active'
      )
    );
$$;

revoke execute on function public.is_family_member(uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated, service_role;

-- 4. ROW LEVEL SECURITY ------------------------------------------------------
alter table public.vendor_slots enable row level security;
alter table public.bookings enable row level security;

-- Slots are catalog rows the API reads with the service-role key: RLS on, no
-- policies, no anon or authenticated grant, same stance as the activity tables.
revoke all on table public.vendor_slots from anon, authenticated;
grant select, insert, update, delete on table public.vendor_slots to service_role;

revoke all on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;
grant select, insert, update, delete on table public.bookings to service_role;

-- Read policy only, no insert/update/delete policy: every state change goes
-- through the booking_* functions. The app authenticates against user_accounts
-- rather than Supabase auth, so auth.uid() is null on today's traffic and this
-- is the backstop for any future client holding a real Supabase JWT.
drop policy if exists "bookings_family_read" on public.bookings;
create policy "bookings_family_read" on public.bookings for select using (
  auth.uid() = elder_id or public.is_family_member(family_id)
);

-- 5. BOOKING FUNCTIONS -------------------------------------------------------
-- Dropped before being replaced, not just replaced: re-running this file after
-- a signature edit would otherwise leave the old overload callable.
drop function if exists public.booking_hold(uuid, uuid, uuid, uuid, text);
create or replace function public.booking_hold(
  p_slot_id uuid,
  p_family_id uuid,
  p_elder_id uuid,
  p_idempotency_key uuid,
  p_created_by text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot public.vendor_slots%rowtype;
  v_booking public.bookings%rowtype;
begin
  if p_slot_id is null or p_family_id is null or p_elder_id is null
     or p_idempotency_key is null then
    raise exception using errcode = '22004', message = 'booking_arguments_required';
  end if;
  if p_created_by is null or p_created_by not in ('app','voice_agent') then
    raise exception using errcode = '22023', message = 'booking_created_by_invalid';
  end if;

  -- A retried request must never claim a second seat.
  select * into v_booking
  from public.bookings
  where idempotency_key = p_idempotency_key;
  if found then
    -- Same key against a different slot is a crossed request, not a retry.
    if v_booking.slot_id <> p_slot_id then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
    return to_jsonb(v_booking);
  end if;

  -- The capacity test is the update's own where clause, so there is no window
  -- between reading `booked` and writing it.
  update public.vendor_slots
  set booked = booked + 1
  where id = p_slot_id and booked < capacity
  returning * into v_slot;

  if not found then
    -- Before calling the slot full: a retry carrying the same key can have been
    -- the request that took the last seat. Its insert was still uncommitted
    -- when the select above looked, then this update blocked on its row lock,
    -- and by the time the lock cleared `booked < capacity` was false. The seat
    -- is ours, not a stranger's, so the key answers before the capacity does -
    -- read committed gives this select a fresh snapshot that includes the
    -- winner's committed row.
    select * into v_booking
    from public.bookings
    where idempotency_key = p_idempotency_key;
    if found then
      if v_booking.slot_id <> p_slot_id then
        raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
      end if;
      return to_jsonb(v_booking);
    end if;

    if exists (select 1 from public.vendor_slots where id = p_slot_id) then
      raise exception using errcode = 'P0001', message = 'slot_full',
        hint = 'This time is already taken. Please choose another.';
    end if;
    raise exception using errcode = 'P0002', message = 'slot_not_found';
  end if;

  insert into public.bookings (
    family_id,
    elder_id,
    vendor_id,
    slot_id,
    status,
    hold_expires_at,
    idempotency_key,
    created_by,
    city_id
  ) values (
    p_family_id,
    p_elder_id,
    v_slot.vendor_id,
    v_slot.id,
    'held',
    now() + interval '5 minutes',
    p_idempotency_key,
    p_created_by,
    v_slot.city_id
  )
  on conflict (idempotency_key) do nothing
  returning * into v_booking;

  -- Two retries of one request can both pass the select above; the loser
  -- inserts nothing and has to hand back the seat it just took.
  if not found then
    update public.vendor_slots
    set booked = greatest(booked - 1, 0)
    where id = v_slot.id;

    select * into v_booking
    from public.bookings
    where idempotency_key = p_idempotency_key;
    if not found then
      raise exception using errcode = 'P0001', message = 'booking_hold_conflict';
    end if;
    -- The same crossed-request check the fast path makes: two requests sharing
    -- a key but naming different slots must not hand the loser the winner's
    -- booking for a slot it never asked for. The decrement above rolls back
    -- with the exception, so the seat count is left exactly as found.
    if v_booking.slot_id <> p_slot_id then
      raise exception using errcode = 'P0001', message = 'idempotency_key_reused';
    end if;
  end if;

  return to_jsonb(v_booking);
end;
$$;

drop function if exists public.booking_confirm(uuid, uuid, int);
create or replace function public.booking_confirm(
  p_hold_id uuid,
  p_idempotency_key uuid,
  p_approval_threshold_paise int
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_next_status text;
begin
  if p_hold_id is null or p_idempotency_key is null then
    raise exception using errcode = '22004', message = 'booking_arguments_required';
  end if;
  if p_approval_threshold_paise is null or p_approval_threshold_paise < 0 then
    raise exception using errcode = '22023', message = 'approval_threshold_invalid';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_hold_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'booking_not_found';
  end if;

  -- The key travels with the booking, so confirming under a different one is a
  -- crossed request rather than a replay.
  if v_booking.idempotency_key <> p_idempotency_key then
    raise exception using errcode = 'P0001', message = 'idempotency_key_mismatch';
  end if;

  if v_booking.status <> 'held' then
    if v_booking.status in ('pending_guardian','pending_vendor','confirmed','completed') then
      return to_jsonb(v_booking);
    end if;
    raise exception using errcode = 'P0001', message = 'booking_not_confirmable';
  end if;

  if v_booking.hold_expires_at is null or v_booking.hold_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'hold_expired',
      hint = 'The five minute hold ran out. Please pick the time again.';
  end if;

  -- An unpriced booking goes to a person, never straight to the vendor.
  if v_booking.amount_paise is null
     or v_booking.amount_paise > p_approval_threshold_paise then
    v_next_status := 'pending_guardian';
  else
    v_next_status := 'pending_vendor';
  end if;

  -- hold_expires_at is cleared because the five minute hold is over; from here
  -- updated_at is the clock the sweeper reads - written explicitly for the
  -- reader's sake, though bookings_set_updated_at would set it anyway.
  update public.bookings
  set status = v_next_status,
      hold_expires_at = null,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  return to_jsonb(v_booking);
end;
$$;

-- Called by the cron that already prunes rate_events and alerts:
--   select public.booking_release_expired();
--
-- Returns the released bookings themselves, as a jsonb array of
--   {id, slot_id, status, elder_id, family_id, service_id}
-- and '[]' when nothing was due. Counts would be cheaper to build and useless
-- to the caller: the cron's real job is telling each family that their hold
-- expired or their provider never answered, and it cannot address a family it
-- was never given. service_id is bookings.vendor_id under the name the
-- notification helpers already look for, since that column points at
-- public.services.
--
-- Three waits are swept here:
--   held            - the five minute hold, keyed off hold_expires_at.
--   pending_guardian- 24 hours. Chosen over a tighter window because the payer
--                     is usually a child several time zones away: anything
--                     shorter cancels bookings while the family is asleep, and
--                     a day still frees the seat well before most slots come
--                     round. Released as 'expired' rather than a new status,
--                     so the app's existing terminal handling covers it.
--   pending_vendor  - 15 minutes, the provider's answer window.
drop function if exists public.booking_release_expired();
create or replace function public.booking_release_expired()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.bookings
    set status = case
          when status in ('held','pending_guardian') then 'expired'
          else 'cancelled_vendor_timeout'
        end,
        hold_expires_at = null,
        updated_at = now()
    where (status = 'held' and hold_expires_at <= now())
       or (status = 'pending_guardian' and updated_at <= now() - interval '24 hours')
       or (status = 'pending_vendor' and updated_at <= now() - interval '15 minutes')
    returning id, slot_id, status, elder_id, family_id, vendor_id as service_id
  ),
  freed as (
    -- greatest(..., 0) so a double sweep or a hand edit can never drive the
    -- counter below zero and break vendor_slots_capacity_check.
    update public.vendor_slots slot
    set booked = greatest(slot.booked - taken.n, 0)
    from (
      select slot_id, count(*)::int as n
      from released
      group by slot_id
    ) taken
    where slot.id = taken.slot_id
    returning slot.id
  )
  -- `freed` is not selected from, and still runs: a data-modifying CTE is
  -- executed once and to completion whether or not the main query reads it.
  -- Deleting it because it looks unused would stop the seats coming back.
  select coalesce(jsonb_agg(to_jsonb(released)), '[]'::jsonb)
  from released;
$$;

revoke execute on function public.booking_hold(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke execute on function public.booking_confirm(uuid, uuid, int)
  from public, anon, authenticated;
revoke execute on function public.booking_release_expired()
  from public, anon, authenticated;
grant execute on function public.booking_hold(uuid, uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.booking_confirm(uuid, uuid, int)
  to service_role;
grant execute on function public.booking_release_expired()
  to service_role;
