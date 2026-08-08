-- Migration 22: one open checkout per household.
--
-- server/billing/subscribe.js:460 already recovers from a 23505 on this insert,
-- and its comment says "a concurrent POST (a double tap, two devices) already
-- owns this account's only payable link" — the loser is supposed to hand back
-- the winner's link instead of minting a second one. That branch has never been
-- reachable. The only unique constraint on subscriptions is
-- razorpay_subscription_id (migration 19 line 43), and the value inserted there
-- is an id Razorpay minted seconds earlier, so it is unique by construction.
--
-- Without this index a guardian who double-taps Subscribe, or opens the plans
-- screen on a phone and a laptop, gets TWO live Razorpay checkout links. Both
-- complete. Both mandates bill ₹499 a month. Neither is ever retired, because
-- retirement only happens on a later subscribe call the family has no reason to
-- make. retireCheckout's own comment at line 198 admits the gap in the future
-- tense: "once one-open-checkout-per-user is enforced".
--
-- Partial, so it constrains only rows still at 'created'. An account may hold
-- any number of settled subscriptions over time; what it may not hold is two
-- payable links at once.
--
-- Keyed on (user_id, family_id) rather than user_id alone, matching the
-- `existing` filter at subscribe.js:314: a guardian may legitimately hold one
-- open checkout per household they pay for.
--
-- Idempotent, and safe to run against a project that already has open checkout
-- rows only if no account currently holds two. The check below reports them
-- rather than failing silently on index creation.

-- Report any account that would violate the new index, before creating it.
-- Postgres raises here rather than leaving a half-applied migration: clear the
-- duplicates (retire all but the newest 'created' row per account) and re-run.
do $$
declare
  offender record;
  found_any boolean := false;
begin
  for offender in
    select user_id, family_id, count(*) as open_count
    from public.subscriptions
    where status = 'created'
    group by user_id, family_id
    having count(*) > 1
  loop
    found_any := true;
    raise warning 'account % (family %) already holds % open checkouts',
      offender.user_id, offender.family_id, offender.open_count;
  end loop;

  if found_any then
    raise exception
      'Cannot add the one-open-checkout guard: existing duplicate rows (see warnings above). '
      'Retire all but the newest status=''created'' row per account, then re-run this migration.';
  end if;
end $$;

create unique index if not exists subscriptions_one_open_checkout_idx
  on public.subscriptions (user_id, family_id)
  where status = 'created';

comment on index public.subscriptions_one_open_checkout_idx is
  'Makes the 23505 recovery branch in server/billing/subscribe.js real: a second concurrent checkout for the same account fails the insert instead of minting a second payable Razorpay link.';
