-- Saathi migration 18: append-only audit log, consent ledger, durable limiter.
-- Run in Supabase dashboard -> SQL Editor, on BOTH projects, after migration 17
-- (the read policies reuse public.is_family_member from that file).
--
-- Once a voice agent can spend a family's money, "what did it do and who said
-- yes" has to be answerable months later, by a family that does not trust us
-- yet. So both tables here are append-only in the strong sense: no role holds
-- update or delete, service_role included, and rows arrive only through the
-- definer functions below. A compromised service key can then write history but
-- not edit it.

-- 1. AUDIT LOG ---------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  args jsonb not null,
  result jsonb,
  idempotency_key uuid,
  -- No foreign key on purpose: the log has to outlive the account it describes,
  -- and an on-delete action would be a way to mutate rows around the revoked
  -- update and delete privileges.
  family_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_family_created_idx
  on public.audit_log (family_id, created_at desc);
create index if not exists audit_log_idempotency_key_idx
  on public.audit_log (idempotency_key) where idempotency_key is not null;

-- 2. CONSENTS ----------------------------------------------------------------
-- One row per consent event, never an update: a grant row carries granted_at, a
-- withdrawal row carries withdrawn_at, and the current state of a purpose is
-- the highest id for that (user, purpose).
create table if not exists public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  purpose text not null,
  version text not null,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  constraint consents_single_event_check check (
    (granted_at is not null and withdrawn_at is null)
    or (granted_at is null and withdrawn_at is not null)
  )
);

create index if not exists consents_user_purpose_idx
  on public.consents (user_id, purpose, id desc);

-- 3. ROW LEVEL SECURITY ------------------------------------------------------
alter table public.audit_log enable row level security;
alter table public.consents enable row level security;

-- Nobody holds insert, update or delete, service_role included: rows arrive
-- only through audit_write and consent_set, which run as the table owner. RLS
-- is deliberately not forced - forcing it would apply to the owner too and
-- block those same two functions.
revoke all on table public.audit_log from public, anon, authenticated, service_role;
revoke all on table public.consents from public, anon, authenticated, service_role;
grant select on table public.audit_log to authenticated, service_role;
grant select on table public.consents to authenticated, service_role;

drop policy if exists "audit_log_family_read" on public.audit_log;
create policy "audit_log_family_read" on public.audit_log for select using (
  public.is_family_member(family_id)
);

drop policy if exists "consents_family_read" on public.consents;
create policy "consents_family_read" on public.consents for select using (
  public.is_family_member(user_id)
);

-- 4. WRITE FUNCTIONS ---------------------------------------------------------
-- Dropped before being replaced, not just replaced: re-running this file after
-- a signature edit would otherwise leave the old overload callable.
drop function if exists public.audit_write(text, text, jsonb, jsonb, uuid, uuid);
create or replace function public.audit_write(
  p_actor text,
  p_action text,
  p_args jsonb,
  p_result jsonb default null,
  p_idempotency_key uuid default null,
  p_family_id uuid default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if nullif(btrim(p_actor), '') is null or nullif(btrim(p_action), '') is null then
    raise exception using errcode = '22004', message = 'audit_actor_and_action_required';
  end if;

  insert into public.audit_log (
    actor,
    action,
    args,
    result,
    idempotency_key,
    family_id
  ) values (
    btrim(p_actor),
    btrim(p_action),
    coalesce(p_args, '{}'::jsonb),
    p_result,
    p_idempotency_key,
    p_family_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.consent_set(uuid, text, text, boolean);
create or replace function public.consent_set(
  p_user_id uuid,
  p_purpose text,
  p_version text,
  p_granted boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent public.consents%rowtype;
begin
  if p_user_id is null or p_granted is null
     or nullif(btrim(p_purpose), '') is null
     or nullif(btrim(p_version), '') is null then
    raise exception using errcode = '22004', message = 'consent_arguments_required';
  end if;

  insert into public.consents (user_id, purpose, version, granted_at, withdrawn_at)
  values (
    p_user_id,
    btrim(p_purpose),
    btrim(p_version),
    case when p_granted then now() end,
    case when p_granted then null else now() end
  )
  returning * into v_consent;

  return to_jsonb(v_consent);
end;
$$;

-- 5. DURABLE RATE LIMIT ------------------------------------------------------
-- Collapses the allowDurable / recordDurable pair in server/_lib/auth.js into
-- one call over the migration 12 rate_events table: true means the event was
-- under the cap and has been recorded, false means nothing was written.
drop function if exists public.check_rate_limit(text, int, interval);
create or replace function public.check_rate_limit(
  p_key text,
  p_max int,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := btrim(p_key);
  v_allowed boolean;
begin
  if nullif(v_key, '') is null or p_max is null or p_max < 1 or p_window is null then
    raise exception using errcode = '22004', message = 'rate_limit_arguments_required';
  end if;

  -- The lock is what removes the race, not the single statement below. A
  -- count-then-insert statement fixes its snapshot before it can take any lock,
  -- so two callers at max-1 would both count the pre-lock rows and both insert.
  -- Locking first and counting in the next statement's fresh snapshot
  -- serialises only the callers sharing a bucket; other buckets never wait.
  perform pg_advisory_xact_lock(hashtext(v_key));

  with under_limit as (
    select count(*) < p_max as ok
    from public.rate_events
    where bucket = v_key
      and created_at > now() - p_window
  ),
  recorded as (
    insert into public.rate_events (bucket)
    select v_key from under_limit where ok
    returning id
  )
  select exists (select 1 from recorded) into v_allowed;

  return v_allowed;
end;
$$;

revoke execute on function public.audit_write(text, text, jsonb, jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.consent_set(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, int, interval)
  from public, anon, authenticated;
grant execute on function public.audit_write(text, text, jsonb, jsonb, uuid, uuid)
  to service_role;
grant execute on function public.consent_set(uuid, text, text, boolean)
  to service_role;
grant execute on function public.check_rate_limit(text, int, interval)
  to service_role;
