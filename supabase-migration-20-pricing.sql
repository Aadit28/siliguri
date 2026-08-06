-- Saathi migration 20: booking prices.
-- Run in Supabase dashboard -> SQL Editor, on BOTH projects, after migration 19.
--
-- bookings.amount_paise has existed since migration 17 and nothing has ever
-- written it, so booking_confirm's "an unpriced booking goes to a person"
-- branch caught EVERY booking: every family was pushed a guardian approval and
-- every elder was read "the shop will tell you" as the fee. The money was never
-- unknown - it was simply never recorded anywhere.
--
-- Two places can carry a price, and the order between them is the whole model:
--
--   vendor_slots.price_paise   - what THIS time costs. A Sunday visit, a home
--                                call, a longer consult. Overrides the base.
--   services.base_price_paise  - the vendor's standing rate. What almost every
--                                slot costs, set once per vendor.
--   neither                    - genuinely unquoted. amount_paise stays null,
--                                booking_confirm routes to pending_guardian and
--                                the app keeps saying the shop will tell you.
--                                This is a supported state, not a gap: a plumber
--                                cannot price a job they have not seen.
--
-- The price is stamped onto the booking at HOLD time, not read live at confirm
-- or at display. An elder who is read a fee in the readback must be charged
-- that fee even if the vendor edits their rate in the following minute, and the
-- booking row is the only record of what they agreed to.

-- 1. PRICE COLUMNS -----------------------------------------------------------
-- Paise, like every other amount in this schema (bookings.amount_paise,
-- entitlements.price_paise) - money is never a float here.
--
-- Nullable on purpose, and zero is legal and distinct from null: a free
-- government clinic slot priced at 0 confirms straight through, an unpriced one
-- goes to a guardian.
alter table public.services
  add column if not exists base_price_paise int check (base_price_paise >= 0);

alter table public.vendor_slots
  add column if not exists price_paise int check (price_paise >= 0);

-- 2. BOOKING_HOLD ------------------------------------------------------------
-- Replaced from migration 17 with ONE behavioural change: the resolved price is
-- written onto the booking row it inserts. Everything else below is migration
-- 17's body unchanged and must stay that way - the idempotency re-select, the
-- crossed-slot guard, the atomic capacity CAS and the seat hand-back on a lost
-- insert are each load-bearing and each was arrived at the hard way.
--
-- Signature is identical, so create or replace is enough and privileges carry
-- over; the grants are re-asserted at the foot of the file anyway so this file
-- leaves a correct function even if it is ever run before 17's grants exist.
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
  v_amount_paise int;
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
    -- Returned exactly as stored, price included: a replay must read back the
    -- amount the first attempt agreed, never today's rate.
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

  -- The price, resolved once, from the slot row this hold just won. coalesce
  -- rather than `case when ... is null`: the slot's own price wins whenever it
  -- is set, including when it is 0, because a free slot is a decision somebody
  -- made and not a missing value. No row back leaves v_amount_paise null, which
  -- is the safe direction anyway - unpriced asks a human rather than inventing
  -- a number.
  select coalesce(v_slot.price_paise, vendor.base_price_paise)
    into v_amount_paise
  from public.services vendor
  where vendor.id = v_slot.vendor_id;

  insert into public.bookings (
    family_id,
    elder_id,
    vendor_id,
    slot_id,
    status,
    hold_expires_at,
    amount_paise,
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
    v_amount_paise,
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

-- booking_confirm is deliberately NOT touched. Its fork already reads
-- amount_paise (null or over the family threshold -> pending_guardian), and
-- with the column finally populated that branch starts doing the job it was
-- written for instead of catching every booking in the system.

revoke execute on function public.booking_hold(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.booking_hold(uuid, uuid, uuid, uuid, text)
  to service_role;
