-- Saathi migration 19: Razorpay subscriptions and the entitlement lookup.
-- Run in Supabase dashboard -> SQL Editor, on BOTH projects, after migration 18.
-- Depends on public.family_links (migration 7) and public.is_family_member
-- (migration 17).
--
-- BUILD_GUIDE B.2. Two rules shape this file:
--
--   1. Razorpay is the ledger, we are the mirror. Every status here is a status
--      Razorpay itself uses, so a row can be reconciled against their dashboard
--      by eye. Nothing in the API decides a status; only the webhook does,
--      through subscription_upsert_from_webhook.
--   2. A guardian abroad pays, an elder in Siliguri uses. The subscription row
--      records both: user_id is whoever's card it is, family_id is the
--      household it was bought for, so no caller has to know which of the two
--      paid and one guardian's card cannot quietly cover three households.

-- 1. SUBSCRIPTIONS -----------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- The payer, not the beneficiary.
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  -- The beneficiary household, fixed at purchase: the elder's own account, in
  -- the same sense bookings.family_id uses. A guardian linked to three parents
  -- buys three plans, one per household, instead of one plan that silently
  -- covers all three - which is what entitlement_for did while it walked
  -- family_links and asked only "did a guardian of this elder pay for
  -- anything". Set at purchase and not re-derived later, so revoking a link
  -- afterwards does not strip a cycle the family already paid for, matching
  -- how cancellation is handled below.
  family_id uuid not null references public.user_accounts(id) on delete cascade,
  plan text not null check (plan in ('care','care_plus','care_total')),
  -- Razorpay's own subscription states, minus 'pending' (their retry state):
  -- there is no local behaviour that differs between 'pending' and the 'halted'
  -- or 'active' it resolves into within a day, and a status we cannot act on is
  -- a status that only invites a wrong gate. The webhook records the pending
  -- event in the audit log and leaves the column alone.
  status text not null default 'created' check (status in (
    'created','authenticated','active','paused','halted','cancelled',
    'completed','expired'
  )),
  -- Unique because it is the webhook's only correlator: a second row carrying
  -- the same Razorpay id would make "which one do I update" unanswerable.
  razorpay_subscription_id text not null unique,
  razorpay_customer_id text,
  -- What the last successful payment bought. Cancelling mid-cycle does not take
  -- back the month already paid for, so entitlement_for reads this, not status
  -- alone.
  current_period_end timestamptz,
  -- When Razorpay first told us the mandate was authenticated. Stamped once by
  -- the webhook and never moved, because entitlement_for grants three free days
  -- of the plan from it while the first debit clears: anchored to updated_at
  -- instead, a redelivered event or a status flapping back to 'authenticated'
  -- would re-open the window, and a family could ride mandate after mandate
  -- without ever being charged.
  authenticated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- entitlement_for filters by beneficiary household and status; subscribe.js and
-- status.js read a payer's own rows. The unique constraint above already
-- indexes the webhook lookup.
create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status);
create index if not exists subscriptions_user_created_idx
  on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_family_status_idx
  on public.subscriptions (family_id, status);

-- Re-run safety. `create table if not exists` above leaves an existing table
-- alone, so a project that took an earlier copy of this file would otherwise
-- keep a subscriptions table with neither of the two columns the functions
-- below name, and every entitlement read would fail with 42703. Backfill rule
-- is the finding's: the payer's single active household when there is exactly
-- one, and the payer themselves otherwise.
alter table public.subscriptions
  add column if not exists family_id uuid references public.user_accounts(id) on delete cascade;
alter table public.subscriptions
  add column if not exists authenticated_at timestamptz;
update public.subscriptions sub
set family_id = case
      when (
        select count(*) from public.family_links link
        where link.guardian_id = sub.user_id and link.status = 'active'
      ) = 1 then (
        select link.parent_id from public.family_links link
        where link.guardian_id = sub.user_id and link.status = 'active'
      )
      else sub.user_id
    end
where sub.family_id is null;
alter table public.subscriptions alter column family_id set not null;

-- subscribe.js names the payer on every insert; naming the household is newer
-- than the endpoint. A row that arrives without one is read as the payer buying
-- for themselves, which is the conservative direction - it can only fail to
-- cover an elder whose household was never named, never cover one that was not
-- paid for. security invoker for the same reason as migration 15's triggers:
-- the insert is already the caller's own.
create or replace function public.subscriptions_default_family_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.family_id is null then
    new.family_id := new.user_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.subscriptions_default_family_id()
  from public, anon, authenticated;

drop trigger if exists subscriptions_default_family_id_trigger on public.subscriptions;
create trigger subscriptions_default_family_id_trigger
before insert on public.subscriptions
for each row execute function public.subscriptions_default_family_id();

-- Deliberately no unique-active-subscription-per-user constraint: an upgrade
-- overlaps the old plan with the new one for as long as the old cycle has left
-- to run, and entitlement_for already resolves the overlap by taking the
-- highest plan rather than the newest row.

-- 2. ROW LEVEL SECURITY ------------------------------------------------------
alter table public.subscriptions enable row level security;

-- Same stance as bookings: reads are policy-gated, every write goes through the
-- service key (subscribe.js) or the definer function below.
revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.subscriptions to service_role;

-- is_family_member already returns true for the row's owner, so one call covers
-- both "the payer reads their own" and "the guardian reads the parent's". The
-- app authenticates against user_accounts rather than Supabase auth, so
-- auth.uid() is null on today's traffic and this is the backstop for any future
-- client holding a real Supabase JWT.
drop policy if exists "subscriptions_family_read" on public.subscriptions;
create policy "subscriptions_family_read" on public.subscriptions for select using (
  public.is_family_member(user_id)
);

-- 3. WEBHOOK WRITE -----------------------------------------------------------
-- How far along its life a subscription is, as one number, so the webhook can
-- tell news from a late delivery. Razorpay walks setup -> live -> ended and
-- never walks back:
--
--   1 created        the checkout exists, nothing signed
--   2 authenticated  mandate signed, nothing charged
--   3 active/paused/halted   live. One rank on purpose: a halted subscription
--                    goes back to active the moment a retry clears and a paused
--                    one on resume, so these three interleave legitimately and
--                    none of them is ever stale news about the others.
--   4 cancelled/completed/expired   ended, and endings do not un-end.
--
-- Pure arithmetic on a string, so no privileges of its own and no table to
-- reach; search_path is pinned anyway, in line with the rest of the file.
drop function if exists public.subscription_status_rank(text);
create or replace function public.subscription_status_rank(p_status text)
returns int
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_status
           when 'created' then 1
           when 'authenticated' then 2
           when 'active' then 3
           when 'paused' then 3
           when 'halted' then 3
           when 'cancelled' then 4
           when 'completed' then 4
           when 'expired' then 4
           else 0
         end;
$$;

-- Dropped before being replaced, not just replaced: re-running this file after
-- a signature edit would otherwise leave the old overload callable.
drop function if exists public.subscription_upsert_from_webhook(text, text, timestamptz);
create or replace function public.subscription_upsert_from_webhook(
  p_razorpay_subscription_id text,
  p_status text,
  p_current_period_end timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subscriptions%rowtype;
  v_id text := nullif(btrim(coalesce(p_razorpay_subscription_id, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
begin
  if v_id is null or v_status is null then
    raise exception using errcode = '22004', message = 'subscription_webhook_arguments_required';
  end if;
  if v_status not in (
    'created','authenticated','active','paused','halted','cancelled',
    'completed','expired'
  ) then
    raise exception using errcode = '22023', message = 'subscription_status_invalid';
  end if;

  -- Named "upsert" for the caller's sake, but it never inserts: user_id and
  -- plan are ours, not Razorpay's, and inventing them from a webhook would
  -- create an unowned subscription that entitlement_for could never resolve.
  -- An unmatched id is reported, not guessed at.
  select * into v_row
  from public.subscriptions
  where razorpay_subscription_id = v_id
  for update;
  if not found then
    return jsonb_build_object('matched', false);
  end if;

  -- Webhook deliveries are retried and can arrive out of order, so anything
  -- belonging to an earlier stage of the life than the row has already reached
  -- is a late delivery, not news: a late 'charged' must not resurrect a
  -- subscription the family has already ended, and a retried 'authenticated'
  -- landing after 'active' must not knock a paying family back onto the three
  -- day mandate grace and then off it into 'free' on the fourth day. Equal rank
  -- still writes, because active/paused/halted move among themselves for real.
  if public.subscription_status_rank(v_status)
     < public.subscription_status_rank(v_row.status) then
    return jsonb_build_object(
      'matched', true,
      'ignored', true,
      -- Terminal keeps its own reason: it is the one the family caused, and
      -- the audit trail reads better for saying so.
      'reason', case
                  when v_row.status in ('cancelled','completed','expired')
                    then 'terminal_status'
                  else 'stale_status'
                end,
      'subscription', to_jsonb(v_row)
    );
  end if;

  update public.subscriptions
  set status = v_status,
      -- Events like 'cancelled' carry no period, and the period already paid
      -- for is exactly what decides how long access survives the cancellation.
      current_period_end = coalesce(p_current_period_end, current_period_end),
      -- Stamped on the first 'authenticated' for this Razorpay id and never
      -- again: coalesce keeps the original instant, so a redelivered event or a
      -- second trip through 'authenticated' cannot slide entitlement_for's
      -- three day window forward. The window is per subscription, not per
      -- event, which is what makes it unrepeatable.
      authenticated_at = coalesce(
        authenticated_at,
        case when v_status = 'authenticated' then now() end
      ),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return jsonb_build_object(
    'matched', true,
    'ignored', false,
    'subscription', to_jsonb(v_row)
  );
end;
$$;

-- 4. ENTITLEMENT -------------------------------------------------------------
-- The single answer to "what has this person paid for", consumed by
-- server/_lib/entitlements.js and (later) by the booking and voice gates.
drop function if exists public.entitlement_for(uuid);
create or replace function public.entitlement_for(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select sub.plan
    from public.subscriptions sub
    -- One subscription, one household. family_id is the household the plan was
    -- bought for, so the child abroad holding the card and the parent in
    -- Siliguri holding the phone are both served by the same row without
    -- walking family_links here at all. That walk was the bug: it asked only
    -- "has any active guardian of this elder paid for anything", so a guardian
    -- linked to three households covered all three with one card. Guardianship
    -- is checked once, by subscribe.js, at the moment the plan is bought.
    --
    -- Still not symmetric: a guardian who bought a plan for their parent is not
    -- themselves covered by it, which is the stance this file already took.
    where p_user_id is not null
      and sub.family_id = p_user_id
      and (
        sub.status = 'active'
        -- UPI autopay registers the mandate a day or more before the first
        -- debit lands, so a family that has just paid would otherwise read as
        -- free until the charge clears. Bounded by authenticated_at, the
        -- instant of the FIRST authentication of this Razorpay subscription, so
        -- the three days are spent once: a mandate that never charges falls out
        -- on its own, and re-authenticating cannot buy a fourth day.
        or (
          sub.status = 'authenticated'
          and sub.authenticated_at is not null
          and sub.authenticated_at > now() - interval '3 days'
        )
        -- Ending a subscription does not refund the cycle already bought.
        or (
          sub.status in ('paused','halted','cancelled')
          and sub.current_period_end is not null
          and sub.current_period_end > now()
        )
      )
    order by case sub.plan
               when 'care_total' then 3
               when 'care_plus' then 2
               when 'care' then 1
               else 0
             end desc
    limit 1
  ), 'free');
$$;

-- Service role only, like every other definer function here. entitlement_for
-- takes the user id as an argument rather than reading auth.uid(), so granting
-- it to authenticated would let any signed-in client probe another family's
-- plan; an RLS-side variant would have to close over auth.uid() instead.
revoke execute on function public.subscription_upsert_from_webhook(text, text, timestamptz)
  from public, anon, authenticated;
revoke execute on function public.entitlement_for(uuid)
  from public, anon, authenticated;
-- The rank helper reaches no table and could be left open, but the webhook
-- function calls it as its own owner, so nothing is lost by holding it to the
-- same line as everything else here.
revoke execute on function public.subscription_status_rank(text)
  from public, anon, authenticated;
grant execute on function public.subscription_upsert_from_webhook(text, text, timestamptz)
  to service_role;
grant execute on function public.entitlement_for(uuid)
  to service_role;
grant execute on function public.subscription_status_rank(text)
  to service_role;
