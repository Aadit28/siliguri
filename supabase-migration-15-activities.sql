-- Saathi migration 15: city-scoped activities, materialized sessions and
-- server-authoritative enrollment. Run after migration 14. Do not publish a
-- class until an operator has verified its provider, venue and schedule.
--
-- The bundled 30-item preview catalog is client-side, explicitly labelled as
-- preview and browse-only. This migration does not turn those fictional review
-- entries into providers or verified database records.

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null,
  description text,
  category text not null check (category in ('yoga','fitness','learning','social','creative','wellness')),
  instructor_name text,
  venue_name text,
  address text,
  town text not null,
  languages text[] not null default array['English']::text[],
  mobility_level text not null default 'gentle'
    check (mobility_level in ('seated','gentle','moderate','active')),
  wheelchair_accessible boolean not null default false,
  chair_available boolean not null default false,
  caregiver_welcome boolean not null default true,
  accessibility_notes text,
  image_url text,
  cost_paise integer not null default 0 check (cost_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  contact_phone text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified','source_linked','phone_confirmed','saathi_verified')),
  verified_at timestamptz,
  verified_by text,
  registration_open boolean not null default false,
  featured boolean not null default false,
  capacity integer check (capacity is null or capacity > 0),
  waitlist_capacity integer not null default 0 check (waitlist_capacity >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_verified_audit_check check (
    verification_status <> 'saathi_verified'
    or (verified_at is not null and nullif(btrim(verified_by), '') is not null)
  ),
  constraint activities_publish_verified_check check (
    status <> 'published'
    or (
      verification_status = 'saathi_verified'
      and verified_at is not null
      and nullif(btrim(verified_by), '') is not null
    )
  )
);

create table if not exists public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'scheduled'
    check (status in ('scheduled','cancelled','completed')),
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, starts_at),
  check (ends_at > starts_at)
);

create table if not exists public.activity_enrollments (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.cities(id) on delete restrict,
  activity_id uuid not null references public.activities(id) on delete cascade,
  participant_id uuid not null references public.user_accounts(id) on delete cascade,
  status text not null check (status in ('joined','waitlisted','cancelled')),
  waitlist_position integer check (waitlist_position is null or waitlist_position > 0),
  created_by uuid not null references public.user_accounts(id),
  updated_by uuid not null references public.user_accounts(id),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (activity_id, participant_id),
  check (
    (status = 'waitlisted' and waitlist_position is not null)
    or (status <> 'waitlisted' and waitlist_position is null)
  )
);

-- Compatibility for a database that received the earlier unnumbered activity
-- draft: add and backfill the city columns before making them mandatory.
alter table public.activities
  add column if not exists city_id uuid references public.cities(id) on delete restrict;
alter table public.activity_enrollments
  add column if not exists city_id uuid references public.cities(id) on delete restrict;

update public.activities
set city_id = (select id from public.cities where slug = 'siliguri')
where city_id is null;

update public.activity_enrollments enrollment
set city_id = account.city_id
from public.user_accounts account
where enrollment.participant_id = account.id
  and enrollment.city_id is null;

do $$
begin
  if exists (select 1 from public.activities where city_id is null) then
    raise exception 'Every activity needs a city_id. Ensure the Siliguri city exists before migration 15.';
  end if;
  if exists (select 1 from public.activity_enrollments where city_id is null) then
    raise exception 'Every enrolled participant needs a city_id before migration 15 can finish.';
  end if;
  if exists (
    select 1
    from public.activity_enrollments enrollment
    join public.activities activity on activity.id = enrollment.activity_id
    where enrollment.city_id <> activity.city_id
  ) then
    raise exception 'An existing activity enrollment belongs to a different city than its activity.';
  end if;
end;
$$;

alter table public.activities alter column city_id set not null;
alter table public.activities alter column town drop default;
alter table public.activities alter column registration_open set default false;
alter table public.activity_enrollments alter column city_id set not null;

-- Compatibility with the earlier unnumbered activity draft: recreate the
-- publication guard even when the table already existed before this migration.
alter table public.activities
  drop constraint if exists activities_publish_verified_check;
alter table public.activities
  add constraint activities_publish_verified_check check (
    status <> 'published'
    or (
      verification_status = 'saathi_verified'
      and verified_at is not null
      and nullif(btrim(verified_by), '') is not null
    )
  );

-- Slugs are URLs within a city, not global provider identities.
alter table public.activities drop constraint if exists activities_slug_key;
create unique index if not exists activities_city_slug_key
  on public.activities(city_id, slug);
create index if not exists activities_city_status_idx
  on public.activities(city_id, status, featured, title);
create index if not exists activity_sessions_activity_starts_idx
  on public.activity_sessions(activity_id, starts_at);
create index if not exists activity_sessions_upcoming_idx
  on public.activity_sessions(starts_at) where status = 'scheduled';
create index if not exists activity_enrollments_city_participant_idx
  on public.activity_enrollments(city_id, participant_id, status);
create index if not exists activity_enrollments_activity_status_idx
  on public.activity_enrollments(activity_id, status, enrolled_at);

alter table public.activities enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.activity_enrollments enable row level security;

-- No public policies: the dispatcher exposes only allowlisted catalog columns
-- and enrollment rows protected by the authenticated family-link check.
revoke all on table public.activities from anon, authenticated;
revoke all on table public.activity_sessions from anon, authenticated;
revoke all on table public.activity_enrollments from anon, authenticated;
grant select, update on table public.activities to service_role;
grant select, update on table public.activity_sessions to service_role;
grant select, insert, update, delete on table public.activity_enrollments to service_role;

-- Even a service-role caller cannot choose an enrollment city. Derive it from
-- the participant and reject a cross-city activity before the row is written.
create or replace function public.derive_activity_enrollment_city()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_participant_city_id uuid;
  v_activity_city_id uuid;
begin
  select city_id into v_participant_city_id
  from public.user_accounts
  where id = new.participant_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Participant not found.';
  end if;
  if v_participant_city_id is null then
    raise exception using errcode = 'P0001', message = 'Participant has no city assigned.';
  end if;

  select city_id into v_activity_city_id
  from public.activities
  where id = new.activity_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  if v_activity_city_id <> v_participant_city_id then
    raise exception using errcode = 'P0001', message = 'This activity is not available in the participant city.';
  end if;

  new.city_id := v_participant_city_id;
  return new;
end;
$$;

drop trigger if exists activity_enrollments_derive_city_trigger
  on public.activity_enrollments;
create trigger activity_enrollments_derive_city_trigger
before insert or update of activity_id, participant_id, city_id
on public.activity_enrollments
for each row execute function public.derive_activity_enrollment_city();

revoke execute on function public.derive_activity_enrollment_city()
  from public, anon, authenticated;
grant execute on function public.derive_activity_enrollment_city()
  to service_role;

-- Unpublishing is a lifecycle event: close registration and cancel future
-- sessions so the next authoritative calendar sync removes the commitment.
create or replace function public.cancel_sessions_when_activity_unpublished()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status <> 'published' then
    new.registration_open := false;
  end if;
  if old.status is distinct from new.status and new.status <> 'published' then
    update public.activity_sessions
    set status = 'cancelled', updated_at = now()
    where activity_id = new.id and status = 'scheduled' and ends_at >= now();
  end if;
  return new;
end;
$$;

drop trigger if exists activities_unpublish_sessions_trigger on public.activities;
create trigger activities_unpublish_sessions_trigger
before update of status on public.activities
for each row execute function public.cancel_sessions_when_activity_unpublished();

revoke execute on function public.cancel_sessions_when_activity_unpublished()
  from public, anon, authenticated;
grant execute on function public.cancel_sessions_when_activity_unpublished()
  to service_role;

-- Lock the activity row while assigning the final place or waitlist position.
create or replace function public.join_activity(
  p_activity_id uuid,
  p_participant_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_activity public.activities%rowtype;
  v_enrollment public.activity_enrollments%rowtype;
  v_participant_city_id uuid;
  v_joined_count integer;
  v_session_capacity integer;
  v_effective_capacity integer;
  v_waitlisted_count integer;
  v_status text;
  v_position integer;
begin
  if p_activity_id is null or p_participant_id is null or p_actor_id is null then
    raise exception using errcode = '22004', message = 'Activity, participant and actor are required.';
  end if;

  select city_id into v_participant_city_id
  from public.user_accounts
  where id = p_participant_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Participant not found.';
  end if;
  if v_participant_city_id is null then
    raise exception using errcode = 'P0001', message = 'Participant has no city assigned.';
  end if;

  select * into v_activity
  from public.activities
  where id = p_activity_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  if v_activity.city_id <> v_participant_city_id then
    raise exception using errcode = 'P0001', message = 'This activity is not available in the participant city.';
  end if;

  select * into v_enrollment
  from public.activity_enrollments
  where activity_id = p_activity_id and participant_id = p_participant_id
  for update;
  if found and v_enrollment.status in ('joined','waitlisted') then
    return to_jsonb(v_enrollment);
  end if;

  if v_activity.status <> 'published' then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  if v_activity.verification_status <> 'saathi_verified'
    or v_activity.verified_at is null
    or nullif(btrim(v_activity.verified_by), '') is null then
    raise exception using errcode = 'P0001', message = 'This activity has not completed Saathi verification.';
  end if;
  if not v_activity.registration_open then
    raise exception using errcode = 'P0001', message = 'Registration is closed.';
  end if;
  if not exists (
    select 1 from public.activity_sessions
    where activity_id = p_activity_id
      and status = 'scheduled'
      and ends_at >= now()
  ) then
    raise exception using errcode = 'P0001', message = 'This activity has no upcoming sessions.';
  end if;

  select min(capacity) into v_session_capacity
  from public.activity_sessions
  where activity_id = p_activity_id
    and status = 'scheduled'
    and ends_at >= now()
    and capacity is not null;

  if v_activity.capacity is null then
    v_effective_capacity := v_session_capacity;
  elsif v_session_capacity is null then
    v_effective_capacity := v_activity.capacity;
  else
    v_effective_capacity := least(v_activity.capacity, v_session_capacity);
  end if;

  select count(*)::integer into v_joined_count
  from public.activity_enrollments
  where activity_id = p_activity_id and status = 'joined';

  if v_effective_capacity is null or v_joined_count < v_effective_capacity then
    v_status := 'joined';
    v_position := null;
  else
    select count(*)::integer into v_waitlisted_count
    from public.activity_enrollments
    where activity_id = p_activity_id and status = 'waitlisted';

    if v_activity.waitlist_capacity = 0 or v_waitlisted_count >= v_activity.waitlist_capacity then
      raise exception using errcode = 'P0001', message = 'This activity and its waitlist are full.';
    end if;
    v_status := 'waitlisted';
    v_position := v_waitlisted_count + 1;
  end if;

  insert into public.activity_enrollments (
    city_id,
    activity_id,
    participant_id,
    status,
    waitlist_position,
    created_by,
    updated_by,
    enrolled_at,
    updated_at
  ) values (
    v_participant_city_id,
    p_activity_id,
    p_participant_id,
    v_status,
    v_position,
    p_actor_id,
    p_actor_id,
    now(),
    now()
  )
  on conflict (activity_id, participant_id) do update set
    city_id = excluded.city_id,
    status = excluded.status,
    waitlist_position = excluded.waitlist_position,
    updated_by = excluded.updated_by,
    enrolled_at = excluded.enrolled_at,
    updated_at = excluded.updated_at
  returning * into v_enrollment;

  return to_jsonb(v_enrollment);
end;
$$;

-- Leaving is idempotent for an existing enrollment. When a joined participant
-- leaves, promote the first waitlisted participant under the same activity lock.
create or replace function public.leave_activity(
  p_activity_id uuid,
  p_participant_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_activity public.activities%rowtype;
  v_enrollment public.activity_enrollments%rowtype;
  v_participant_city_id uuid;
  v_previous_status text;
  v_promote_id uuid;
  v_joined_count integer;
  v_session_capacity integer;
  v_effective_capacity integer;
begin
  if p_activity_id is null or p_participant_id is null or p_actor_id is null then
    raise exception using errcode = '22004', message = 'Activity, participant and actor are required.';
  end if;

  select city_id into v_participant_city_id
  from public.user_accounts
  where id = p_participant_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Participant not found.';
  end if;
  if v_participant_city_id is null then
    raise exception using errcode = 'P0001', message = 'Participant has no city assigned.';
  end if;

  select * into v_activity
  from public.activities
  where id = p_activity_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Activity not found.';
  end if;
  if v_activity.city_id <> v_participant_city_id then
    raise exception using errcode = 'P0001', message = 'This activity is not available in the participant city.';
  end if;

  select * into v_enrollment
  from public.activity_enrollments
  where activity_id = p_activity_id
    and participant_id = p_participant_id
    and city_id = v_participant_city_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Enrollment not found.';
  end if;
  if v_enrollment.status = 'cancelled' then
    return to_jsonb(v_enrollment);
  end if;

  v_previous_status := v_enrollment.status;
  update public.activity_enrollments
  set status = 'cancelled',
      waitlist_position = null,
      updated_by = p_actor_id,
      updated_at = now()
  where id = v_enrollment.id
  returning * into v_enrollment;

  select min(capacity) into v_session_capacity
  from public.activity_sessions
  where activity_id = p_activity_id
    and status = 'scheduled'
    and ends_at >= now()
    and capacity is not null;

  if v_activity.capacity is null then
    v_effective_capacity := v_session_capacity;
  elsif v_session_capacity is null then
    v_effective_capacity := v_activity.capacity;
  else
    v_effective_capacity := least(v_activity.capacity, v_session_capacity);
  end if;

  select count(*)::integer into v_joined_count
  from public.activity_enrollments
  where activity_id = p_activity_id and status = 'joined';

  if v_previous_status = 'joined'
     and v_activity.status = 'published'
     and v_activity.registration_open
     and (v_effective_capacity is null or v_joined_count < v_effective_capacity)
     and exists (
       select 1 from public.activity_sessions
       where activity_id = p_activity_id and status = 'scheduled' and ends_at >= now()
     ) then
    select id into v_promote_id
    from public.activity_enrollments
    where activity_id = p_activity_id and status = 'waitlisted'
    order by waitlist_position asc, enrolled_at asc, id asc
    limit 1
    for update;

    if v_promote_id is not null then
      update public.activity_enrollments
      set status = 'joined',
          waitlist_position = null,
          updated_by = p_actor_id,
          updated_at = now()
      where id = v_promote_id;
    end if;
  end if;

  with ranked as (
    select
      id,
      row_number() over (
        order by waitlist_position asc, enrolled_at asc, id asc
      )::integer as new_position
    from public.activity_enrollments
    where activity_id = p_activity_id and status = 'waitlisted'
  )
  update public.activity_enrollments enrollment
  set waitlist_position = ranked.new_position,
      updated_at = case
        when enrollment.waitlist_position <> ranked.new_position then now()
        else enrollment.updated_at
      end
  from ranked
  where enrollment.id = ranked.id
    and enrollment.waitlist_position <> ranked.new_position;

  return to_jsonb(v_enrollment);
end;
$$;

revoke execute on function public.join_activity(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.leave_activity(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.join_activity(uuid, uuid, uuid)
  to service_role;
grant execute on function public.leave_activity(uuid, uuid, uuid)
  to service_role;
