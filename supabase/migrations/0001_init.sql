-- Ringly: schema, RLS, RPCs
create extension if not exists pgcrypto with schema extensions;

create type group_role as enum ('owner','admin','member');
create type event_category as enum ('lecture','meeting','deadline','study','service','other');
create type event_priority as enum ('normal','important');
create type event_status as enum ('proposed','scheduled','cancelled');
create type occ_status as enum ('scheduled','cancelled','completed');
create type job_kind as enum ('reminder','announcement','urgent','event_change','snooze','test');
create type job_status as enum ('pending','processing','completed','failed','cancelled');
create type delivery_status as enum ('sent','failed','expired');
create type ann_kind as enum ('normal','urgent');

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member',
  avatar_url text,
  timezone text not null default 'Africa/Lagos',
  is_platform_admin boolean not null default false,
  suspended_at timestamptz,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name',''), nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────── groups
create function public.gen_invite_code() returns text language plpgsql as $$
declare chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; out text := ''; i int;
begin
  for i in 1..8 loop
    out := out || substr(chars, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(chars)), 1);
  end loop;
  return out;
end $$;

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text,
  timezone text not null default 'Africa/Lagos',
  invite_code text not null unique default public.gen_invite_code(),
  invite_code_enabled boolean not null default true,
  members_can_propose_events boolean not null default false,
  created_by uuid not null references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger groups_touch before update on public.groups for each row execute function public.touch_updated_at();

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role group_role not null default 'member',
  can_send_urgent boolean not null default false,
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index on public.group_members(user_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  max_uses int,
  use_count int not null default 0,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.join_attempts (
  id bigserial primary key,
  user_id uuid not null,
  at timestamptz not null default now()
);

-- ───────────── events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  location text,
  meeting_url text,
  category event_category not null default 'other',
  priority event_priority not null default 'normal',
  starts_at timestamptz not null,
  duration_minutes int,
  timezone text not null default 'Africa/Lagos',
  recurrence jsonb,
  reminder_offsets int[] not null default '{15,0}',
  require_ack boolean not null default false,
  ack_deadline_offset_minutes int,
  allow_snooze boolean not null default true,
  status event_status not null default 'scheduled',
  cancelled_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.events(group_id);
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

create table public.event_occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  occurrence_start timestamptz not null,
  occurrence_end timestamptz,
  status occ_status not null default 'scheduled',
  override_title text,
  override_location text,
  unique (event_id, occurrence_start)
);
create index on public.event_occurrences(occurrence_start);

create table public.event_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  occurrence_id uuid,
  changed_by uuid not null references public.profiles(id),
  change_type text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '',
  kind ann_kind not null default 'normal',
  linked_event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.announcements_rate_limit() returns trigger language plpgsql security definer set search_path = '' as $$
declare lim int := case when new.kind = 'urgent' then 2 else 5 end;
begin
  if (select count(*) from public.announcements where group_id = new.group_id and kind = new.kind and created_at > now() - interval '1 hour') >= lim then
    raise exception 'Rate limit reached: too many % messages in the last hour', new.kind;
  end if;
  return new;
end $$;
create trigger announcements_rl before insert on public.announcements for each row execute function public.announcements_rate_limit();

-- ───────────── notifications
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  kind job_kind not null,
  group_id uuid not null references public.groups(id) on delete cascade,
  occurrence_id uuid references public.event_occurrences(id) on delete cascade,
  announcement_id uuid references public.announcements(id) on delete cascade,
  target_user_id uuid,
  offset_minutes int,
  run_at timestamptz not null,
  status job_status not null default 'pending',
  attempts int not null default 0,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.notification_jobs(status, run_at);
create unique index uq_reminder_job on public.notification_jobs(occurrence_id, offset_minutes) where kind = 'reminder';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  platform text,
  device_label text,
  is_active boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.push_subscriptions(user_id) where is_active;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notification_jobs(id) on delete cascade,
  user_id uuid not null,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status delivery_status not null,
  http_status int,
  error text,
  attempted_at timestamptz not null default now(),
  unique (job_id, subscription_id)
);

create table public.acknowledgements (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.event_occurrences(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (occurrence_id, user_id)
);

create table public.system_state (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table public.audit_log (
  id bigserial primary key, actor_id uuid, action text not null, entity text, entity_id text, meta jsonb, created_at timestamptz not null default now()
);

-- ───────────── helper functions (security definer, used by policies)
create function public.is_group_member(gid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid()) $$;
create function public.is_group_admin(gid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role in ('owner','admin')) $$;
create function public.is_group_owner(gid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and role = 'owner') $$;
create function public.can_send_urgent(gid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid() and (role = 'owner' or (role = 'admin' and can_send_urgent))) $$;
create function public.event_group(eid uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select group_id from public.events where id = eid $$;
create function public.occurrence_group(oid uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select e.group_id from public.event_occurrences o join public.events e on e.id = o.event_id where o.id = oid $$;

-- ───────────── RLS
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.join_attempts enable row level security;
alter table public.events enable row level security;
alter table public.event_occurrences enable row level security;
alter table public.event_changes enable row level security;
alter table public.announcements enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.acknowledgements enable row level security;
alter table public.system_state enable row level security;
alter table public.audit_log enable row level security;

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, avatar_url, timezone) on public.profiles to authenticated;

create policy groups_select on public.groups for select using (public.is_group_member(id));
create policy groups_update on public.groups for update using (public.is_group_owner(id)) with check (public.is_group_owner(id));
create policy groups_delete on public.groups for delete using (public.is_group_owner(id));
revoke update on public.groups from authenticated, anon;
grant update (name, description, timezone, invite_code_enabled, members_can_propose_events) on public.groups to authenticated;

create policy gm_select on public.group_members for select using (public.is_group_member(group_id));
create policy gm_update_own on public.group_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy gm_leave on public.group_members for delete using (user_id = auth.uid() and role <> 'owner');
revoke update on public.group_members from authenticated, anon;
grant update (muted) on public.group_members to authenticated;

create policy gi_select on public.group_invites for select using (public.is_group_admin(group_id));
create policy gi_insert on public.group_invites for insert with check (public.is_group_admin(group_id) and created_by = auth.uid());
create policy gi_update on public.group_invites for update using (public.is_group_admin(group_id));

create policy ev_select on public.events for select using (public.is_group_member(group_id));
create policy occ_select on public.event_occurrences for select using (public.is_group_member(public.event_group(event_id)));
create policy chg_select on public.event_changes for select using (public.is_group_member(public.event_group(event_id)));

create policy ann_select on public.announcements for select using (public.is_group_member(group_id));
create policy ann_insert on public.announcements for insert with check (
  created_by = auth.uid() and (
    (kind = 'normal' and public.is_group_admin(group_id)) or
    (kind = 'urgent' and public.can_send_urgent(group_id))));

create policy ps_own on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ack_select on public.acknowledgements for select using (
  user_id = auth.uid() or public.is_group_admin(public.occurrence_group(occurrence_id)));
create policy ack_insert on public.acknowledgements for insert with check (
  user_id = auth.uid() and public.is_group_member(public.occurrence_group(occurrence_id)));

-- jobs, deliveries, system_state, audit_log, join_attempts: no policies = service role only

-- ───────────── membership RPCs
create function public.create_group(p_name text, p_description text, p_timezone text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare gid uuid; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  insert into public.groups(name, description, timezone, created_by) values (trim(p_name), nullif(trim(p_description), ''), p_timezone, uid) returning id into gid;
  insert into public.group_members(group_id, user_id, role, can_send_urgent) values (gid, uid, 'owner', true);
  return gid;
end $$;

create function public.join_group_by_code(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare g public.groups; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and suspended_at is not null) then raise exception 'Account suspended'; end if;
  if (select count(*) from public.join_attempts where user_id = uid and at > now() - interval '10 minutes') >= 10 then
    raise exception 'Too many attempts. Try again in a few minutes.';
  end if;
  insert into public.join_attempts(user_id) values (uid);
  select * into g from public.groups where invite_code = upper(trim(p_code)) and invite_code_enabled and archived_at is null;
  if not found then raise exception 'Invalid or disabled invite code'; end if;
  insert into public.group_members(group_id, user_id, role) values (g.id, uid, 'member') on conflict do nothing;
  return g.id;
end $$;

create function public.join_group_by_token(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.group_invites; uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.profiles where id = uid and suspended_at is not null) then raise exception 'Account suspended'; end if;
  select * into inv from public.group_invites where token = p_token for update;
  if not found or inv.revoked_at is not null then raise exception 'This invite link is no longer valid'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception 'This invite link has expired'; end if;
  if inv.max_uses is not null and inv.use_count >= inv.max_uses then raise exception 'This invite link has reached its usage limit'; end if;
  insert into public.group_members(group_id, user_id, role) values (inv.group_id, uid, 'member') on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.group_invites set use_count = use_count + 1 where id = inv.id; end if;
  return inv.group_id;
end $$;

create function public.regenerate_invite_code(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not public.is_group_admin(p_group) then raise exception 'Not allowed'; end if;
  update public.groups set invite_code = public.gen_invite_code() where id = p_group returning invite_code into c;
  return c;
end $$;

create function public.set_member_role(p_group uuid, p_user uuid, p_role group_role, p_urgent boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_owner(p_group) then raise exception 'Only the owner can change roles'; end if;
  if p_role = 'owner' then raise exception 'Ownership transfer is not supported yet'; end if;
  update public.group_members set role = p_role, can_send_urgent = (p_role = 'admin' and p_urgent)
  where group_id = p_group and user_id = p_user and role <> 'owner';
end $$;

create function public.remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target public.group_members;
begin
  if not public.is_group_admin(p_group) then raise exception 'Not allowed'; end if;
  select * into target from public.group_members where group_id = p_group and user_id = p_user;
  if not found then return; end if;
  if target.role = 'owner' then raise exception 'The owner cannot be removed'; end if;
  if target.role = 'admin' and not public.is_group_owner(p_group) then raise exception 'Only the owner can remove admins'; end if;
  delete from public.group_members where id = target.id;
end $$;

-- ───────────── event RPCs
create function public.generate_jobs(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events;
begin
  select * into e from public.events where id = p_event;
  if not found or e.status <> 'scheduled' then return; end if;
  insert into public.notification_jobs(kind, group_id, occurrence_id, offset_minutes, run_at)
  select 'reminder'::public.job_kind, e.group_id, o.id, t.off_min, o.occurrence_start - make_interval(mins => t.off_min)
  from public.event_occurrences o cross join unnest(e.reminder_offsets) as t(off_min)
  where o.event_id = e.id and o.status = 'scheduled' and o.occurrence_start > now()
    and (o.occurrence_start - make_interval(mins => t.off_min)) > now() - interval '2 minutes'
  on conflict (occurrence_id, offset_minutes) where kind = 'reminder'
  do update set status = 'pending', run_at = excluded.run_at, attempts = 0
  where public.notification_jobs.status in ('cancelled', 'pending');
end $$;
revoke all on function public.generate_jobs(uuid) from public, anon, authenticated;

create function public.upsert_event(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  gid uuid := (p->>'group_id')::uuid;
  eid uuid := nullif(p->>'id', '')::uuid;
  old public.events;
  is_new boolean := (nullif(p->>'id', '') is null);
  starts timestamptz := (p->>'starts_at')::timestamptz;
  tz text := p->>'timezone';
  offsets int[] := array(select jsonb_array_elements_text(p->'reminder_offsets')::int);
  occs timestamptz[] := array(select (jsonb_array_elements_text(p->'occurrences'))::timestamptz);
  rec jsonb := case when jsonb_typeof(p->'recurrence') = 'object' then p->'recurrence' else null end;
  dur int := nullif(p->>'duration_minutes', '')::int;
  v_title text := p->>'title';
  do_notify boolean := coalesce((p->>'notify')::boolean, true);
  changed boolean := false;
  grp_name text; first_occ uuid; url text;
begin
  if uid is null or not public.is_group_admin(gid) then raise exception 'Not allowed'; end if;
  select name into grp_name from public.groups where id = gid;

  if is_new then
    if (select count(*) from public.events where group_id = gid and created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Rate limit: too many events created in the last hour';
    end if;
    insert into public.events(group_id, created_by, title, description, location, meeting_url, category, priority, starts_at,
      duration_minutes, timezone, recurrence, reminder_offsets, require_ack, allow_snooze, status)
    values (gid, uid, v_title, coalesce(p->>'description', ''), nullif(p->>'location', ''), nullif(p->>'meeting_url', ''),
      (p->>'category')::public.event_category, (p->>'priority')::public.event_priority, starts, dur, tz, rec, offsets,
      coalesce((p->>'require_ack')::boolean, false), coalesce((p->>'allow_snooze')::boolean, true), 'scheduled')
    returning id into eid;
    changed := true;
    insert into public.event_changes(event_id, changed_by, change_type, after) values (eid, uid, 'created', p);
  else
    select * into old from public.events where id = eid and group_id = gid for update;
    if not found then raise exception 'Event not found'; end if;
    if old.status = 'cancelled' then raise exception 'This event is cancelled and cannot be edited'; end if;
    changed := old.starts_at is distinct from starts or old.reminder_offsets is distinct from offsets
      or old.recurrence is distinct from rec or old.timezone is distinct from tz or old.duration_minutes is distinct from dur;
    update public.events set title = v_title, description = coalesce(p->>'description', ''), location = nullif(p->>'location', ''),
      meeting_url = nullif(p->>'meeting_url', ''), category = (p->>'category')::public.event_category,
      priority = (p->>'priority')::public.event_priority, starts_at = starts, duration_minutes = dur, timezone = tz,
      recurrence = rec, reminder_offsets = offsets, require_ack = coalesce((p->>'require_ack')::boolean, false),
      allow_snooze = coalesce((p->>'allow_snooze')::boolean, true), version = old.version + 1
    where id = eid;
    insert into public.event_changes(event_id, changed_by, change_type, before, after)
    values (eid, uid, case when changed then 'rescheduled' else 'edited' end, to_jsonb(old), p);
  end if;

  if changed then
    update public.notification_jobs set status = 'cancelled'
    where status = 'pending' and kind = 'reminder'
      and occurrence_id in (select id from public.event_occurrences where event_id = eid and occurrence_start > now());
    update public.event_occurrences set status = 'cancelled'
    where event_id = eid and status = 'scheduled' and occurrence_start > now() and occurrence_start <> all (occs);
    insert into public.event_occurrences(event_id, occurrence_start, occurrence_end)
    select eid, o, case when dur is not null then o + make_interval(mins => dur) end from unnest(occs) as o
    on conflict (event_id, occurrence_start) do update set status = 'scheduled', occurrence_end = excluded.occurrence_end;
    perform public.generate_jobs(eid);
  end if;

  select id into first_occ from public.event_occurrences where event_id = eid and status = 'scheduled' and occurrence_start > now() order by occurrence_start limit 1;
  url := case when first_occ is null then '/app/groups/' || gid::text else '/app/events/' || first_occ::text end;

  if do_notify then
    insert into public.notification_jobs(kind, group_id, run_at, payload)
    values ('event_change', gid, now(), jsonb_build_object(
      'title', grp_name || ' · ' || case when is_new then 'New event' when changed then 'Rescheduled' else 'Updated' end || ': ' || v_title,
      'body', case when changed then to_char(starts at time zone tz, 'Dy DD Mon, HH12:MI AM') else 'Details were updated' end,
      'url', url, 'priority', 'normal'));
  end if;
  return eid;
end $$;

create function public.cancel_event(p_event uuid, p_occurrence uuid default null, p_notify boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.events; uid uuid := auth.uid(); grp_name text; occ_start timestamptz;
begin
  select * into e from public.events where id = p_event;
  if not found or not public.is_group_admin(e.group_id) then raise exception 'Not allowed'; end if;
  select name into grp_name from public.groups where id = e.group_id;
  if p_occurrence is null then
    update public.events set status = 'cancelled', cancelled_at = now() where id = e.id;
    update public.event_occurrences set status = 'cancelled' where event_id = e.id and status = 'scheduled' and occurrence_start > now();
    update public.notification_jobs set status = 'cancelled' where status = 'pending' and kind in ('reminder','snooze')
      and occurrence_id in (select id from public.event_occurrences where event_id = e.id);
    insert into public.event_changes(event_id, changed_by, change_type) values (e.id, uid, 'cancelled');
  else
    update public.event_occurrences set status = 'cancelled' where id = p_occurrence and event_id = e.id returning occurrence_start into occ_start;
    update public.notification_jobs set status = 'cancelled' where status = 'pending' and occurrence_id = p_occurrence;
    insert into public.event_changes(event_id, occurrence_id, changed_by, change_type) values (e.id, p_occurrence, uid, 'cancelled');
  end if;
  if p_notify then
    insert into public.notification_jobs(kind, group_id, run_at, payload) values ('event_change', e.group_id, now(), jsonb_build_object(
      'title', grp_name || ' · Cancelled: ' || e.title,
      'body', 'This ' || case when p_occurrence is null then 'event' else 'session' end || ' has been cancelled.',
      'url', '/app/groups/' || e.group_id::text, 'priority', 'normal'));
  end if;
end $$;

create function public.occurrence_summary(p_occ uuid) returns table(members int, acked int, push_sent int, push_failed int, no_device int)
language plpgsql security definer set search_path = '' as $$
declare gid uuid := public.occurrence_group(p_occ);
begin
  if not public.is_group_admin(gid) then raise exception 'Not allowed'; end if;
  return query
  with m as (select user_id from public.group_members where group_id = gid),
  sent as (select distinct d.user_id from public.notification_deliveries d join public.notification_jobs j on j.id = d.job_id
           where j.occurrence_id = p_occ and j.kind = 'reminder' and d.status = 'sent'),
  bad as (select distinct d.user_id from public.notification_deliveries d join public.notification_jobs j on j.id = d.job_id
          where j.occurrence_id = p_occ and j.kind = 'reminder' and d.status <> 'sent' and d.user_id not in (select user_id from sent))
  select (select count(*) from m)::int,
         (select count(*) from public.acknowledgements a where a.occurrence_id = p_occ)::int,
         (select count(*) from sent)::int,
         (select count(*) from bad)::int,
         (select count(*) from m where not exists (select 1 from public.push_subscriptions s where s.user_id = m.user_id and s.is_active))::int;
end $$;

-- ───────────── worker RPC
create function public.claim_due_jobs(batch_size int, worker_id text) returns setof public.notification_jobs
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.notification_jobs j set status = 'processing', locked_at = now(), locked_by = worker_id, attempts = j.attempts + 1
  where j.id in (
    select id from public.notification_jobs
    where (status = 'pending' and run_at <= now()) or (status = 'processing' and locked_at < now() - interval '5 minutes')
    order by run_at limit batch_size for update skip locked)
  returning j.*;
end $$;
revoke all on function public.claim_due_jobs(int, text) from public, anon, authenticated;
