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
--      belongs to whoever's card it is, and entitlement_for walks family_links
--      to answer "is this person covered", so no caller has to know which of
--      the two paid.

-- 1. SUBSCRIPTIONS -----------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- The payer, not the beneficiary. entitlement_for maps one to the other.
  user_id uuid not null references public.user_accounts(id) on delete cascade,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- entitlement_for filters by payer and status; status.js reads the newest row
-- for one user. The unique constraint above already indexes the webhook lookup.
create index if not exists subscriptions_user_status_idx
  on public.subscriptions (user_id, status);
create index if not exists subscriptions_user_created_idx
  on public.subscriptions (user_id, created_at desc);

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

  -- Webhook deliveries are retried and can arrive out of order, so a late
  -- 'charged' must not resurrect a subscription the family has already ended.
  if v_row.status in ('cancelled','completed','expired')
     and v_status not in ('cancelled','completed','expired') then
    return jsonb_build_object(
      'matched', true,
      'ignored', true,
      'reason', 'terminal_status',
      'subscription', to_jsonb(v_row)
    );
  end if;

  update public.subscriptions
  set status = v_status,
      -- Events like 'cancelled' carry no period, and the period already paid
      -- for is exactly what decides how long access survives the cancellation.
      current_period_end = coalesce(p_current_period_end, current_period_end),
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
  with payers as (
    -- The person themselves...
    select p_user_id as payer_id
    where p_user_id is not null
    union
    -- ...and any guardian who pays on their behalf, which is the ordinary case:
    -- the child abroad holds the card, the parent in Siliguri holds the phone.
    -- Not symmetric on purpose - a guardian does not inherit an elder's plan,
    -- because one guardian can be linked to several households and the plan was
    -- bought for one elder's care.
    select link.guardian_id
    from public.family_links link
    where link.parent_id = p_user_id
      and link.status = 'active'
  )
  select coalesce((
    select sub.plan
    from public.subscriptions sub
    join payers on payers.payer_id = sub.user_id
    where sub.status = 'active'
      -- UPI autopay registers the mandate a day or more before the first debit
      -- lands, so a family that has just paid would otherwise read as free
      -- until the charge clears. Bounded by updated_at so a mandate that never
      -- charges falls out on its own instead of granting a free month.
      or (sub.status = 'authenticated' and sub.updated_at > now() - interval '3 days')
      -- Ending a subscription does not refund the cycle already bought.
      or (
        sub.status in ('paused','halted','cancelled')
        and sub.current_period_end is not null
        and sub.current_period_end > now()
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
grant execute on function public.subscription_upsert_from_webhook(text, text, timestamptz)
  to service_role;
grant execute on function public.entitlement_for(uuid)
  to service_role;
