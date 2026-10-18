-- M10: several groups (ADR-034). Anyone signed in who isn't in a group yet can create one (and
-- becomes its admin) or join one with an invite. One person belongs to one group, for good.
-- Every group has its own settings, invites, timeline and money; members see only their group.
--
-- Rollout (ADR-031): until a second group exists, the code still deployed on main keeps working
-- (it reads one settings row through RLS and signs people up with join_group as before).

-- ---------------------------------------------------------------------------
-- Groups and app-wide limits
-- ---------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create trigger forbid_delete before delete on public.groups
  for each row execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.groups
  for each statement execute function private.forbid_delete();
create trigger restrict_update before update on public.groups
  for each row execute function private.restrict_update('name');

-- The whole app shares one free tier (Supabase storage, Gemini quota), so the number of groups
-- and people is capped. Changed with SQL by the operator; no screen.
create table public.app_limits (
  id boolean primary key default true check (id),
  max_groups int not null default 10 check (max_groups >= 1),
  max_total_members int not null default 50 check (max_total_members >= 1)
);
insert into public.app_limits default values;
alter table public.app_limits enable row level security;

-- The existing members become the first group.
insert into public.groups (name, created_by)
select 'Commit or Treat', (select id from public.profiles order by is_admin desc, created_at limit 1)
where exists (select 1 from public.profiles);

alter table public.profiles add column group_id uuid references public.groups (id);
update public.profiles set group_id = (select id from public.groups order by created_at limit 1);
alter table public.profiles alter column group_id set not null;
create index profiles_group_idx on public.profiles (group_id);

-- Settings: one row per group (was a single row keyed by `id = true`).
alter table public.group_settings add column group_id uuid references public.groups (id);
update public.group_settings set group_id = (select id from public.groups order by created_at limit 1);
delete from public.group_settings where group_id is null;
alter table public.group_settings drop column id;
alter table public.group_settings alter column group_id set not null;
alter table public.group_settings add primary key (group_id);

-- Invites belong to the inviter's group.
alter table public.invites add column group_id uuid references public.groups (id);
alter table public.invites disable trigger restrict_update;
update public.invites i set group_id = p.group_id from public.profiles p where p.id = i.created_by;
alter table public.invites enable trigger restrict_update;
alter table public.invites alter column group_id set not null;

-- Events carry their group (filled from the actor; events without one say it themselves).
alter table public.activity_events add column group_id uuid references public.groups (id);
alter table public.activity_events disable trigger restrict_update;
update public.activity_events e set group_id = p.group_id from public.profiles p where p.id = e.actor_id;
update public.activity_events set group_id = (select id from public.groups order by created_at limit 1)
where group_id is null;
alter table public.activity_events enable trigger restrict_update;
alter table public.activity_events alter column group_id set not null;
create index activity_events_group_idx on public.activity_events (group_id, created_at desc);

create function private.event_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is null then
    new.group_id := (select group_id from public.profiles where id = new.actor_id);
  end if;
  return new;
end;
$$;
create trigger event_group before insert on public.activity_events
  for each row execute function private.event_group();

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function private.group_of(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.profiles where id = p_user_id;
$$;

create function private.settings_of(p_user_id uuid)
returns public.group_settings
language sql
stable
security definer
set search_path = ''
as $$
  select g.* from public.group_settings g join public.profiles p on p.group_id = g.group_id where p.id = p_user_id;
$$;

create function private.group_settings_for(p_group_id uuid)
returns public.group_settings
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.group_settings where group_id = p_group_id;
$$;

-- RLS: the signed-in member's group (null for people not in one).
create function private.my_group()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.profiles where id = (select auth.uid()) and deactivated_at is null;
$$;

create function private.in_my_group(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = p_user_id and group_id = private.my_group()
  );
$$;

create function private.log_in_my_group(p_study_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.study_logs l join public.profiles p on p.id = l.user_id
    where l.id = p_study_log_id and p.group_id = private.my_group()
  );
$$;

create function private.folder_in_my_group(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id::text = p_folder and group_id = private.my_group()
  );
$$;

-- Two people in the same group (both active).
create function private.same_group(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles a join public.profiles b on b.group_id = a.group_id
    where a.id = p_a and b.id = p_b and a.deactivated_at is null and b.deactivated_at is null
  );
$$;

create or replace function private.active_member_count()
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.profiles where deactivated_at is null;
$$;

create function private.group_member_count(p_group_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.profiles where group_id = p_group_id and deactivated_at is null;
$$;

-- Reviewers: every other active member of the same group not on leave today.
create or replace function private.reviewers_for(p_user_id uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.id <> p_user_id
    and p.group_id = private.group_of(p_user_id)
    and p.deactivated_at is null
    and not private.is_on_leave(p.id, private.jst_today())
  order by p.created_at;
$$;

-- Members of one group who still owe a declaration on p_date.
create function private.undeclared_members(p_group_id uuid, p_date date, p_cutoff timestamptz)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.group_id = p_group_id
    and p.deactivated_at is null
    and p.created_at < p_cutoff
    and not exists (select 1 from public.study_logs l where l.user_id = p.id and l.date = p_date)
    and not private.is_rest_day(p.id, p_date)
    and not private.is_on_leave(p.id, p_date);
$$;

create function private.report_due_for(p_user_id uuid, p_date date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    private.day_at(p_date + 1, (private.settings_of(p_user_id)).report_deadline),
    private.now() + interval '1 hour'
  );
$$;

create function private.current_period_end(p_group_id uuid)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  settings public.group_settings := private.group_settings_for(p_group_id);
  today date := private.jst_today();
  period date;
begin
  period := today - ((extract(dow from today)::int - settings.settlement_weekday + 7) % 7);
  if private.now() < private.day_at(period, settings.settlement_time) then
    period := period - 7;
  end if;
  return period;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating and joining groups
-- ---------------------------------------------------------------------------

-- Someone signed in and not in any group starts one and becomes its admin.
create function public.create_group(p_user_id uuid, p_display_name text, p_avatar_url text, p_group_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.app_limits;
  created public.groups;
  joined public.profiles;
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));
  select * into limits from public.app_limits;

  if exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'already_in_group' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_group_name, ''))) not between 1 and 40 then
    raise exception 'invalid_group_name' using errcode = 'P0001';
  end if;
  if (select count(*) from public.groups) >= limits.max_groups then
    raise exception 'app_full' using errcode = 'P0001';
  end if;
  if private.active_member_count() >= limits.max_total_members then
    raise exception 'app_full' using errcode = 'P0001';
  end if;

  insert into public.groups (name, created_by) values (btrim(p_group_name), p_user_id) returning * into created;
  insert into public.group_settings (group_id) values (created.id);

  insert into public.profiles (id, display_name, avatar_url, is_admin, trial_ends_at, group_id)
  values (p_user_id, btrim(p_display_name), p_avatar_url, true, private.trial_end_for(private.now()), created.id)
  returning * into joined;

  insert into public.activity_events (type, actor_id, payload)
  values ('group_created', p_user_id, jsonb_build_object('name', created.name));
  return joined;
end;
$$;

-- Joining with an invite puts the person in the inviter's group. The bootstrap code (INVITE_CODE)
-- only works while there are no groups at all (a fresh install); it creates the first one.
create or replace function public.join_group(
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text,
  p_invite_hash text,
  p_bootstrap boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.app_limits;
  joined public.profiles;
  invite public.invites;
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));
  select * into limits from public.app_limits;

  select * into joined from public.profiles where id = p_user_id;
  if found then
    return joined;
  end if;

  if p_bootstrap then
    if exists (select 1 from public.groups) then
      raise exception 'bootstrap_closed' using errcode = 'P0001';
    end if;
    return public.create_group(p_user_id, p_display_name, p_avatar_url, 'Commit or Treat');
  end if;

  -- Wrong, expired and already-used codes all look the same to the caller on purpose.
  select * into invite from public.invites
  where code_hash = p_invite_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  if private.group_member_count(invite.group_id) >= (private.group_settings_for(invite.group_id)).max_members then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  if private.active_member_count() >= limits.max_total_members then
    raise exception 'app_full' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, display_name, avatar_url, is_admin, trial_ends_at, group_id)
  values (p_user_id, btrim(p_display_name), p_avatar_url, false, private.trial_end_for(now()), invite.group_id)
  returning * into joined;

  update public.invites set used_by = p_user_id, used_at = now() where id = invite.id;

  insert into public.activity_events (type, actor_id, payload)
  values ('member_joined', p_user_id, jsonb_build_object('invited_by', invite.created_by));

  return joined;
end;
$$;

create or replace function public.create_invite(p_user_id uuid, p_code_hash text)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  created public.invites;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and deactivated_at is null) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  settings := private.settings_of(p_user_id);
  if private.group_member_count(settings.group_id) >= settings.max_members then
    raise exception 'group_full' using errcode = 'P0001';
  end if;

  insert into public.invites (code_hash, created_by, expires_at, group_id)
  values (p_code_hash, p_user_id, now() + make_interval(mins => settings.invite_minutes), settings.group_id)
  returning * into created;

  return created;
end;
$$;

-- Admins: rename the group, and make others admins or step down (never leaving none).
create function public.rename_group(p_admin_id uuid, p_name text)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  event public.activity_events;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then
    raise exception 'invalid_group_name' using errcode = 'P0001';
  end if;
  update public.groups set name = btrim(p_name) where id = private.group_of(p_admin_id);
  insert into public.activity_events (type, actor_id, payload)
  values ('group_renamed', p_admin_id, jsonb_build_object('name', btrim(p_name)))
  returning * into event;
  return event;
end;
$$;

create function public.set_admin(p_admin_id uuid, p_user_id uuid, p_is_admin boolean)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  grp uuid := private.group_of(p_admin_id);
  event public.activity_events;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('admins:' || grp));
  if not private.same_group(p_admin_id, p_user_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if (select is_admin from public.profiles where id = p_user_id) = p_is_admin then
    raise exception 'unchanged' using errcode = 'P0001';
  end if;
  if not p_is_admin and (
    select count(*) from public.profiles where group_id = grp and is_admin and deactivated_at is null
  ) <= 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;

  update public.profiles set is_admin = p_is_admin where id = p_user_id;
  insert into public.activity_events (type, actor_id, payload)
  values ('admin_changed', p_admin_id, jsonb_build_object('user_id', p_user_id, 'is_admin', p_is_admin))
  returning * into event;
  return event;
end;
$$;

-- ---------------------------------------------------------------------------
-- Declarations, rest days, leave
-- ---------------------------------------------------------------------------

create or replace function public.declare_goal(p_user_id uuid, p_declaration text, p_end_time time, p_passphrase text)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.jst_today();
  settings public.group_settings;
  unfinished public.study_logs;
  log public.study_logs;
  event public.activity_events;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);

  if private.now() >= private.day_at(today, settings.declaration_cutoff) then
    raise exception 'declaration_closed' using errcode = 'P0001';
  end if;
  if private.is_rest_day(p_user_id, today) then
    raise exception 'rest_day' using errcode = 'P0001';
  end if;
  if private.is_on_leave(p_user_id, today) then
    raise exception 'on_leave' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.study_logs where user_id = p_user_id and date = today) then
    raise exception 'already_declared' using errcode = 'P0001';
  end if;
  unfinished := private.unfinished_day(p_user_id, today);
  if unfinished.id is not null then
    raise exception '%', case when unfinished.status = 'pending' then 'previous_day_open' else 'previous_report_due' end
      using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_declaration, ''))) not between 1 and 500 then
    raise exception 'invalid_declaration' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_passphrase, ''))) = 0 then
    raise exception 'invalid_passphrase' using errcode = 'P0001';
  end if;

  insert into public.study_logs (user_id, date, status, declaration, target_end_time, passphrase, declared_at)
  values (p_user_id, today, 'pending', btrim(p_declaration), private.day_at(today + 1, settings.declaration_cutoff),
          btrim(p_passphrase), private.now())
  returning * into log;

  insert into public.activity_events (type, actor_id, study_log_id, payload)
  values ('declared', p_user_id, log.id,
          jsonb_build_object('declaration', log.declaration, 'target_end_time', log.target_end_time))
  returning * into event;
  return event;
end;
$$;

create or replace function public.flag_declaration(p_flagger_id uuid, p_study_log_id uuid, p_comment text)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  event public.activity_events;
begin
  perform private.require_member(p_flagger_id);
  select * into log from public.study_logs where id = p_study_log_id for update;
  if not found or not private.same_group(p_flagger_id, log.user_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  settings := private.settings_of(log.user_id);
  if log.user_id = p_flagger_id then
    raise exception 'own_declaration' using errcode = 'P0001';
  end if;
  if log.revised_at is not null then
    raise exception 'already_revised' using errcode = 'P0001';
  end if;
  if log.status <> 'pending'
     or log.date <> private.jst_today()
     or private.now() > log.declared_at + make_interval(hours => settings.flag_window_hours)
     or private.now() >= log.target_end_time then
    raise exception 'flag_closed' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_comment, ''))) not between 1 and 300 then
    raise exception 'invalid_comment' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.declaration_flags where study_log_id = log.id and flagger_id = p_flagger_id) then
    raise exception 'already_flagged' using errcode = 'P0001';
  end if;

  insert into public.declaration_flags (study_log_id, flagger_id, comment)
  values (log.id, p_flagger_id, btrim(p_comment));

  if log.revision_due_at is null then
    update public.study_logs
    set revision_due_at = private.now() + make_interval(mins => settings.revision_minutes)
    where id = log.id
    returning * into log;
  end if;

  insert into public.activity_events (type, actor_id, study_log_id, payload)
  values ('declaration_flagged', p_flagger_id, log.id,
          jsonb_build_object('owner_id', log.user_id, 'comment', btrim(p_comment), 'revision_due_at', log.revision_due_at))
  returning * into event;
  return event;
end;
$$;

create or replace function public.expire_revisions()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
  penalty public.penalties;
begin
  return query
  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  select 'reminder_revision_due', l.user_id, l.id, jsonb_build_object('revision_due_at', l.revision_due_at),
         'reminder_revision_due:' || l.id
  from public.study_logs l
  where l.status = 'pending' and l.revised_at is null and l.revision_due_at is not null
    and private.now() between l.revision_due_at - interval '15 minutes' and l.revision_due_at
  on conflict (dedupe_key) do nothing
  returning *;

  for log in
    select * from public.study_logs
    where status = 'pending' and revised_at is null and revision_due_at < private.now()
    for update skip locked
  loop
    update public.study_logs set status = 'no_declaration' where id = log.id;
    update public.submissions set status = 'error', judge_error = 'cancelled: declaration not revised'
    where study_log_id = log.id and status in ('judging', 'error');
    penalty := private.add_penalty(log.user_id, log.id, 'unrevised', (private.settings_of(log.user_id)).penalty_unrevised);
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('revision_expired', log.user_id, log.id,
            jsonb_build_object('points', coalesce(penalty.points, 0), 'waived', penalty.waived),
            'revision_expired:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

create or replace function public.register_rest_day(p_user_id uuid, p_date date)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  event public.activity_events;
begin
  perform private.require_member(p_user_id);
  perform pg_advisory_xact_lock(hashtext('rest_day:' || p_user_id));
  settings := private.settings_of(p_user_id);

  if p_date <= private.jst_today() then
    raise exception 'rest_day_too_soon' using errcode = 'P0001';
  end if;
  if p_date > private.jst_today() + 60 then
    raise exception 'rest_day_too_far' using errcode = 'P0001';
  end if;
  if private.is_rest_day(p_user_id, p_date) then
    raise exception 'already_rest_day' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.leave_requests l
    where l.user_id = p_user_id and l.status in ('under_review', 'approved')
      and p_date between l.start_date and l.end_date
      and (l.cancelled_from is null or p_date < l.cancelled_from)
  ) then
    raise exception 'on_leave' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.rest_days
    where user_id = p_user_id and date between private.week_start(p_date) and private.week_start(p_date) + 6
  ) >= settings.rest_days_per_week then
    raise exception 'rest_day_limit' using errcode = 'P0001';
  end if;

  insert into public.rest_days (user_id, date) values (p_user_id, p_date);

  insert into public.activity_events (type, actor_id, payload)
  values ('rest_day_registered', p_user_id, jsonb_build_object('date', p_date))
  returning * into event;
  return event;
end;
$$;

create or replace function public.request_leave(p_user_id uuid, p_start date, p_end date, p_reason text)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  today date := private.jst_today();
  request public.leave_requests;
  reviewer_ids uuid[];
begin
  perform private.require_member(p_user_id);
  perform pg_advisory_xact_lock(hashtext('leave:' || p_user_id));
  settings := private.settings_of(p_user_id);

  if p_start <= today then
    raise exception 'leave_too_soon' using errcode = 'P0001';
  end if;
  if p_end < p_start then
    raise exception 'invalid_period' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < settings.min_explanation_chars then
    raise exception 'reason_too_short' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.leave_requests l
    where l.user_id = p_user_id and l.status in ('under_review', 'approved')
      and l.start_date <= p_end and l.end_date >= p_start
      and (l.cancelled_from is null or l.cancelled_from > p_start)
  ) then
    raise exception 'leave_overlaps' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(r), '{}') into reviewer_ids from private.reviewers_for(p_user_id) r;

  insert into public.leave_requests (user_id, start_date, end_date, reason, review_due_at)
  values (p_user_id, p_start, p_end, btrim(p_reason), private.day_at(today, settings.review_deadline))
  returning * into request;

  insert into public.peer_reviews (subject_type, subject_id, reviewer_id)
  select 'leave', request.id, unnest(reviewer_ids);

  return query
  insert into public.activity_events (type, actor_id, leave_request_id, payload)
  values ('leave_requested', p_user_id, request.id, jsonb_build_object(
    'start_date', request.start_date, 'end_date', request.end_date, 'reason', request.reason,
    'review_due_at', request.review_due_at, 'reviewer_ids', to_jsonb(reviewer_ids)))
  returning *;

  if cardinality(reviewer_ids) = 0 then
    update public.leave_requests set status = 'approved', approved_at = private.now(), resolved_at = private.now()
    where id = request.id;
    return query
    insert into public.activity_events (type, actor_id, leave_request_id, payload)
    values ('leave_approved', p_user_id, request.id,
            jsonb_build_object('start_date', request.start_date, 'end_date', request.end_date))
    returning *;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Submissions and 「怪しい」
-- ---------------------------------------------------------------------------

create or replace function public.create_submission(
  p_user_id uuid,
  p_study_log_id uuid,
  p_image_paths text[],
  p_thumb_path text,
  p_learned text,
  p_struggled text,
  p_self_rating int
)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  used int;
  next_no int;
  created public.submissions;
  event public.activity_events;
  path text;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);
  select * into log from public.study_logs where id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if log.status = 'passed' or log.status = 'completed' then
    raise exception 'already_passed' using errcode = 'P0001';
  end if;
  if log.status <> 'pending' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if private.now() >= log.target_end_time then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.submissions where study_log_id = log.id and status = 'judging') then
    raise exception 'judging_in_progress' using errcode = 'P0001';
  end if;

  select count(*) filter (where status <> 'error'), coalesce(max(attempt_no), 0) + 1 into used, next_no
  from public.submissions where study_log_id = log.id and kind = 'regular';
  if used >= settings.max_attempts then
    raise exception 'no_attempts_left' using errcode = 'P0001';
  end if;

  if cardinality(p_image_paths) not between 1 and 3 then
    raise exception 'invalid_images' using errcode = 'P0001';
  end if;
  foreach path in array p_image_paths loop
    if not private.is_evidence_path(path, p_user_id, log.date, false) then
      raise exception 'invalid_images' using errcode = 'P0001';
    end if;
  end loop;
  if p_thumb_path is not null and not private.is_evidence_path(p_thumb_path, p_user_id, log.date, true) then
    raise exception 'invalid_images' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_learned, ''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_struggled, ''))) not between 1 and 2000 then
    raise exception 'invalid_reflection' using errcode = 'P0001';
  end if;
  if p_self_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;

  insert into public.submissions (
    study_log_id, user_id, kind, attempt_no, image_paths, thumb_path, learned_text, struggled_text,
    self_rating, status, elapsed_minutes, submitted_at
  ) values (
    log.id, p_user_id, 'regular', next_no, p_image_paths, p_thumb_path, btrim(p_learned), btrim(p_struggled),
    p_self_rating, 'judging', floor(extract(epoch from private.now() - log.declared_at) / 60)::int, private.now()
  ) returning * into created;

  insert into public.activity_events (type, actor_id, study_log_id, submission_id, payload)
  values ('submitted', p_user_id, log.id, created.id,
          jsonb_build_object('attempt_no', next_no, 'elapsed_minutes', created.elapsed_minutes))
  returning * into event;
  return event;
end;
$$;

create or replace function public.record_judgement(
  p_submission_id uuid,
  p_score int,
  p_passphrase_found boolean,
  p_feedback text,
  p_model text
)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  sub public.submissions;
  log public.study_logs;
  passed boolean;
  attempts_left int;
begin
  select * into sub from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  settings := private.settings_of(sub.user_id);
  if sub.status not in ('judging', 'error') then
    raise exception 'already_judged' using errcode = 'P0001';
  end if;
  if p_score not between 0 and 100 then
    raise exception 'invalid_score' using errcode = 'P0001';
  end if;
  select * into log from public.study_logs where id = sub.study_log_id for update;
  if sub.kind = 'regular' and log.status <> 'pending' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if log.revision_due_at is not null and log.revised_at is null and log.status = 'pending' then
    raise exception 'revision_pending' using errcode = 'P0001';
  end if;

  passed := p_score >= settings.passing_score and p_passphrase_found;

  update public.submissions set
    status = case when passed then 'passed' else 'rejected' end,
    reject_reason = case when passed then null when not p_passphrase_found then 'no_passphrase' else 'low_score' end,
    ai_score = p_score,
    ai_passphrase_found = p_passphrase_found,
    ai_feedback = btrim(p_feedback),
    ai_model = p_model,
    judge_error = null,
    judged_at = private.now()
  where id = sub.id;

  if sub.kind = 'resend' then
    return query
    insert into public.activity_events (type, actor_id, study_log_id, submission_id, payload)
    values ('evidence_resent', sub.user_id, log.id, sub.id, jsonb_build_object(
      'score', p_score, 'passphrase_found', p_passphrase_found,
      'flagger_ids', (select coalesce(jsonb_agg(flagger_id), '[]') from public.submission_flags
                      where study_log_id = log.id and withdrawn_at is null)))
    returning *;
    return;
  end if;

  select settings.max_attempts - count(*) into attempts_left
  from public.submissions where study_log_id = log.id and kind = 'regular' and status <> 'error';

  if passed then
    update public.study_logs set
      status = 'passed',
      passed_at = private.now(),
      dispute_window_ends_at = greatest(
        sub.submitted_at + make_interval(hours => settings.dispute_window_hours),
        private.now() + interval '1 minute'
      )
    where id = log.id
    returning * into log;
  end if;

  return query
  insert into public.activity_events (type, actor_id, study_log_id, submission_id, payload)
  values (
    case when passed then 'judged_passed' else 'judged_rejected' end,
    sub.user_id, log.id, sub.id,
    jsonb_build_object(
      'score', p_score, 'passphrase_found', p_passphrase_found, 'feedback', btrim(p_feedback),
      'attempts_left', greatest(attempts_left, 0), 'dispute_window_ends_at', log.dispute_window_ends_at,
      'deadline', log.target_end_time, 'kind', sub.kind
    )
  )
  returning *;
end;
$$;

create or replace function public.flag_submission(p_flagger_id uuid, p_study_log_id uuid, p_comment text)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  dispute public.submission_disputes;
  flags int;
  event public.activity_events;
begin
  perform private.require_member(p_flagger_id);
  select * into log from public.study_logs where id = p_study_log_id for update;
  if not found or not private.same_group(p_flagger_id, log.user_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  settings := private.settings_of(log.user_id);
  if log.user_id = p_flagger_id then
    raise exception 'own_submission' using errcode = 'P0001';
  end if;
  if log.status <> 'passed' or private.now() >= log.dispute_window_ends_at then
    raise exception 'flag_closed' using errcode = 'P0001';
  end if;
  select * into dispute from public.submission_disputes where study_log_id = log.id for update;
  if found and (dispute.status <> 'resending' or private.now() >= dispute.resend_due_at) then
    raise exception 'flag_closed' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_comment, ''))) not between 1 and 300 then
    raise exception 'invalid_comment' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.submission_flags where study_log_id = log.id and flagger_id = p_flagger_id) then
    raise exception 'already_flagged' using errcode = 'P0001';
  end if;

  insert into public.submission_flags (study_log_id, flagger_id, comment) values (log.id, p_flagger_id, btrim(p_comment));
  if dispute.study_log_id is null then
    insert into public.submission_disputes (study_log_id, status, first_flagged_at, resend_due_at)
    values (log.id, 'resending', private.now(), private.now() + make_interval(mins => settings.resend_minutes))
    returning * into dispute;
  end if;
  select count(*) into flags from public.submission_flags where study_log_id = log.id;

  insert into public.activity_events (type, actor_id, study_log_id, payload)
  values ('submission_flagged', p_flagger_id, log.id, jsonb_build_object(
    'owner_id', log.user_id, 'comment', btrim(p_comment), 'resend_due_at', dispute.resend_due_at, 'flag_count', flags))
  returning * into event;
  return event;
end;
$$;

create or replace function public.advance_disputes()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispute public.submission_disputes;
  log public.study_logs;
  reviewer_ids uuid[];
begin
  return query
  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  select 'reminder_resend_due', l.user_id, l.id, jsonb_build_object('resend_due_at', d.resend_due_at),
         'reminder_resend_due:' || l.id
  from public.submission_disputes d join public.study_logs l on l.id = d.study_log_id
  where d.status = 'resending'
    and private.now() between d.resend_due_at - interval '1 hour' and d.resend_due_at
  on conflict (dedupe_key) do nothing
  returning *;

  for dispute in
    select * from public.submission_disputes
    where status = 'resending' and resend_due_at < private.now()
    for update skip locked
  loop
    select * into log from public.study_logs where id = dispute.study_log_id;
    select coalesce(array_agg(r), '{}') into reviewer_ids from private.reviewers_for(log.user_id) r;
    if cardinality(reviewer_ids) = 0 then
      return query select * from private.uphold_dispute(dispute.study_log_id, true);
      continue;
    end if;

    update public.submission_disputes
    set status = 'final_review',
        review_due_at = private.now() + make_interval(hours => (private.settings_of(log.user_id)).review_hours)
    where study_log_id = dispute.study_log_id
    returning * into dispute;
    insert into public.peer_reviews (subject_type, subject_id, reviewer_id)
    select 'dispute', dispute.study_log_id, unnest(reviewer_ids)
    on conflict do nothing;

    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('dispute_final_review_started', log.user_id, log.id, jsonb_build_object(
      'review_due_at', dispute.review_due_at, 'reviewer_ids', to_jsonb(reviewer_ids)),
      'dispute_final_review:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;

  for dispute in
    select * from public.submission_disputes
    where status = 'final_review' and review_due_at < private.now()
    for update skip locked
  loop
    return query select * from private.uphold_dispute(dispute.study_log_id, true);
  end loop;
end;
$$;

create or replace function public.pass_unjudged()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  log public.study_logs;
begin
  for candidate in
    select distinct on (l.id) l.id as log_id, s.id as submission_id
    from public.study_logs l
    join public.submissions s on s.study_log_id = l.id
    join public.profiles p on p.id = l.user_id
    join public.group_settings g on g.group_id = p.group_id
    where l.status = 'pending'
      and not (l.revision_due_at is not null and l.revised_at is null)
      and s.kind = 'regular' and s.status in ('judging', 'error')
      and s.submitted_at < l.target_end_time
      and (s.submitted_at + make_interval(mins => g.ai_fallback_minutes) <= private.now()
           or l.target_end_time <= private.now())
    order by l.id, s.submitted_at
  loop
    select * into log from public.study_logs where id = candidate.log_id and status = 'pending' for update skip locked;
    continue when not found;

    update public.submissions set
      status = 'passed', unverified_at = private.now(), judged_at = private.now(),
      ai_feedback = 'AI が判定できなかったため、メンバーの確認で判定します'
    where id = candidate.submission_id;
    update public.study_logs set
      status = 'passed', passed_at = private.now(),
      dispute_window_ends_at = private.now() + make_interval(hours => (private.settings_of(log.user_id)).dispute_window_hours)
    where id = log.id
    returning * into log;

    return query
    insert into public.activity_events (type, actor_id, study_log_id, submission_id, payload, dedupe_key)
    values ('judged_unverified', log.user_id, log.id, candidate.submission_id,
            jsonb_build_object('dispute_window_ends_at', log.dispute_window_ends_at),
            'judged_unverified:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Missed days, reasons, reviews
-- ---------------------------------------------------------------------------

create or replace function public.give_up_day(p_user_id uuid, p_study_log_id uuid)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
  due timestamptz;
  event public.activity_events;
begin
  perform private.require_member(p_user_id);
  select * into log from public.study_logs where id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if log.status <> 'pending' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.submissions where study_log_id = log.id and status = 'judging') then
    raise exception 'judging_in_progress' using errcode = 'P0001';
  end if;

  due := private.report_due_for(log.user_id, log.date);
  update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
  update public.submissions set judge_error = 'cancelled: gave up'
  where study_log_id = log.id and status = 'error';
  insert into public.failure_reports (study_log_id, user_id, report_due_at)
  values (log.id, log.user_id, due)
  on conflict (study_log_id) do nothing;

  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  values ('missed', log.user_id, log.id, jsonb_build_object('report_due_at', due, 'gave_up', true), 'missed:' || log.id)
  on conflict (dedupe_key) do nothing
  returning * into event;
  return event;
end;
$$;

create or replace function public.close_overdue_logs()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
  due timestamptz;
begin
  for log in
    select l.* from public.study_logs l
    join public.profiles p on p.id = l.user_id
    join public.group_settings g on g.group_id = p.group_id
    where l.status = 'pending' and l.target_end_time <= private.now()
      and not exists (
        select 1 from public.submissions s
        where s.study_log_id = l.id and s.kind = 'regular' and s.status in ('judging', 'error')
          and s.submitted_at < l.target_end_time
          and private.now() < l.target_end_time + make_interval(mins => g.judge_grace_minutes)
      )
    for update of l skip locked
  loop
    due := private.report_due_for(log.user_id, log.date);
    update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
    insert into public.failure_reports (study_log_id, user_id, report_due_at)
    values (log.id, log.user_id, due)
    on conflict (study_log_id) do nothing;
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('missed', log.user_id, log.id, jsonb_build_object('report_due_at', due), 'missed:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

create or replace function public.file_failure_report(p_user_id uuid, p_study_log_id uuid, p_category text, p_text text)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  report public.failure_reports;
  log public.study_logs;
  body text := nullif(btrim(coalesce(p_text, '')), '');
  streak int;
  penalty public.penalties;
  reviewer_ids uuid[];
  due timestamptz;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);
  select * into report from public.failure_reports
  where study_log_id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if report.status <> 'awaiting_report' then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  if private.now() > report.report_due_at then
    raise exception 'report_closed' using errcode = 'P0001';
  end if;
  if p_category not in ('unrealistic', 'slacked', 'sudden_plan', 'other') then
    raise exception 'invalid_category' using errcode = 'P0001';
  end if;
  if p_category <> 'slacked' and char_length(coalesce(body, '')) < settings.min_explanation_chars then
    raise exception 'reason_too_short' using errcode = 'P0001';
  end if;
  if char_length(coalesce(body, '')) > 2000 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;
  select * into log from public.study_logs where id = p_study_log_id;

  if p_category = 'unrealistic' then
    streak := private.unrealistic_streak(log.id);
    if streak >= settings.unrealistic_streak_threshold then
      penalty := private.add_penalty(p_user_id, log.id, 'unrealistic_streak', settings.penalty_unrealistic_streak);
    end if;
    update public.failure_reports set
      status = 'resolved', category = 'unrealistic', next_plan_text = body, unrealistic_streak = streak,
      reported_at = private.now(), outcome = case when penalty.id is null then 'no_penalty' else 'penalized' end,
      resolved_at = private.now()
    where study_log_id = log.id;
  elsif p_category = 'slacked' then
    penalty := private.add_penalty(p_user_id, log.id, 'slacked', settings.penalty_slacked);
    update public.failure_reports set
      status = 'resolved', category = 'slacked', reason_text = body, reported_at = private.now(),
      outcome = 'penalized', resolved_at = private.now()
    where study_log_id = log.id;
  else
    select coalesce(array_agg(r), '{}') into reviewer_ids from private.reviewers_for(p_user_id) r;
    due := private.now() + make_interval(hours => settings.review_hours);
    update public.failure_reports set
      status = case when cardinality(reviewer_ids) = 0 then 'resolved' else 'under_review' end,
      category = p_category, reason_text = body, reported_at = private.now(), review_due_at = due,
      outcome = case when cardinality(reviewer_ids) = 0 then 'no_penalty' end,
      resolved_at = case when cardinality(reviewer_ids) = 0 then private.now() end
    where study_log_id = log.id;
    insert into public.peer_reviews (subject_type, subject_id, reviewer_id)
    select 'excuse', log.id, unnest(reviewer_ids);
  end if;

  return query
  insert into public.activity_events (type, actor_id, study_log_id, payload)
  values ('reported', p_user_id, log.id, jsonb_build_object(
    'category', p_category, 'text', body, 'streak', streak,
    'points', coalesce(penalty.points, 0), 'waived', penalty.waived))
  returning *;

  if cardinality(reviewer_ids) > 0 then
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload)
    values ('review_requested', p_user_id, log.id, jsonb_build_object(
      'category', p_category, 'text', body, 'review_due_at', due, 'reviewer_ids', to_jsonb(reviewer_ids)))
    returning *;
  end if;
end;
$$;

create or replace function public.expire_reports()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  report public.failure_reports;
  penalty public.penalties;
begin
  for report in
    select * from public.failure_reports
    where status = 'awaiting_report' and report_due_at < private.now()
    for update skip locked
  loop
    penalty := private.add_penalty(report.user_id, report.study_log_id, 'not_reported',
                                   (private.settings_of(report.user_id)).penalty_slacked);
    update public.failure_reports set
      status = 'resolved', category = 'not_reported', outcome = 'penalized', resolved_at = private.now()
    where study_log_id = report.study_log_id;
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('report_expired', report.user_id, report.study_log_id,
            jsonb_build_object('points', coalesce(penalty.points, 0), 'waived', penalty.waived),
            'report_expired:' || report.study_log_id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

create or replace function private.resolve_excuse(p_study_log_id uuid, p_approved boolean, p_expired boolean)
returns public.activity_events
language plpgsql
set search_path = ''
as $$
declare
  report public.failure_reports;
  penalty public.penalties;
  event public.activity_events;
begin
  select * into report from public.failure_reports where study_log_id = p_study_log_id;
  if not p_approved then
    penalty := private.add_penalty(report.user_id, report.study_log_id,
      case when p_expired then 'excuse_expired' else 'excuse_rejected' end,
      (private.settings_of(report.user_id)).penalty_excuse_rejected);
  end if;
  update public.failure_reports set
    status = 'resolved', outcome = case when p_approved then 'no_penalty' else 'penalized' end, resolved_at = private.now()
  where study_log_id = p_study_log_id;
  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  values (case when p_approved then 'review_approved' else 'review_rejected' end, report.user_id, p_study_log_id,
          jsonb_build_object('expired', p_expired, 'points', coalesce(penalty.points, 0), 'waived', penalty.waived),
          'excuse_resolved:' || p_study_log_id)
  on conflict (dedupe_key) do nothing
  returning * into event;
  return event;
end;
$$;

create or replace function public.cast_review(
  p_reviewer_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_verdict text,
  p_comment text
)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  review public.peer_reviews;
  request public.leave_requests;
  dispute public.submission_disputes;
  report public.failure_reports;
  log public.study_logs;
  penalty public.penalties;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  accepted int;
  total int;
  owner uuid;
begin
  perform private.require_member(p_reviewer_id);
  if p_verdict not in ('accept', 'reject') then
    raise exception 'invalid_verdict' using errcode = 'P0001';
  end if;

  if p_subject_type = 'leave' then
    select * into request from public.leave_requests where id = p_subject_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    owner := request.user_id;
  elsif p_subject_type = 'dispute' then
    select * into dispute from public.submission_disputes where study_log_id = p_subject_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    select * into log from public.study_logs where id = p_subject_id for update;
    owner := log.user_id;
    if p_verdict = 'reject' and v_comment is null then
      raise exception 'comment_required' using errcode = 'P0001';
    end if;
  elsif p_subject_type = 'excuse' then
    select * into report from public.failure_reports where study_log_id = p_subject_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    owner := report.user_id;
  else
    raise exception 'not_supported' using errcode = 'P0001';
  end if;

  -- Reviewers were fixed from the owner's group when the review opened (reviewers_for).
  select * into review from public.peer_reviews
  where subject_type = p_subject_type and subject_id = p_subject_id and reviewer_id = p_reviewer_id
  for update;
  if not found then
    raise exception 'not_a_reviewer' using errcode = 'P0001';
  end if;
  if review.verdict is not null then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;
  if (p_subject_type = 'leave' and (request.status <> 'under_review' or private.now() > request.review_due_at))
     or (p_subject_type = 'dispute' and (dispute.status <> 'final_review' or private.now() > dispute.review_due_at))
     or (p_subject_type = 'excuse' and (report.status <> 'under_review' or private.now() > report.review_due_at)) then
    raise exception 'review_closed' using errcode = 'P0001';
  end if;

  update public.peer_reviews set verdict = p_verdict, comment = v_comment, decided_at = private.now() where id = review.id;

  select count(*) filter (where verdict = 'accept'), count(*) into accepted, total
  from public.peer_reviews where subject_type = p_subject_type and subject_id = p_subject_id;

  return query
  insert into public.activity_events (type, actor_id, leave_request_id, study_log_id, payload)
  values ('review_vote_cast', p_reviewer_id,
          case when p_subject_type = 'leave' then p_subject_id end,
          case when p_subject_type <> 'leave' then p_subject_id end,
          jsonb_build_object('subject_type', p_subject_type, 'owner_id', owner, 'verdict', p_verdict,
                             'comment', v_comment, 'accepted', accepted, 'total', total))
  returning *;

  if p_subject_type = 'leave' then
    if p_verdict = 'reject' then
      update public.leave_requests set status = 'rejected', resolved_at = private.now() where id = request.id;
      return query
      insert into public.activity_events (type, actor_id, leave_request_id, payload)
      values ('leave_rejected', request.user_id, request.id, jsonb_build_object(
        'start_date', request.start_date, 'end_date', request.end_date, 'rejected_by', p_reviewer_id))
      returning *;
    elsif accepted = total then
      update public.leave_requests set status = 'approved', approved_at = private.now(), resolved_at = private.now()
      where id = request.id;
      return query
      insert into public.activity_events (type, actor_id, leave_request_id, payload)
      values ('leave_approved', request.user_id, request.id,
              jsonb_build_object('start_date', request.start_date, 'end_date', request.end_date))
      returning *;
    end if;
  elsif p_subject_type = 'dispute' then
    if p_verdict = 'reject' then
      update public.submission_disputes set status = 'invalidated', resolved_at = private.now() where study_log_id = log.id;
      update public.study_logs set status = 'invalidated', invalidated_at = private.now() where id = log.id;
      penalty := private.add_penalty(log.user_id, log.id, 'fake_evidence', (private.settings_of(log.user_id)).penalty_fake_evidence);
      return query
      insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
      values ('dispute_invalidated', log.user_id, log.id, jsonb_build_object(
        'rejected_by', p_reviewer_id, 'comment', v_comment,
        'points', coalesce(penalty.points, 0), 'waived', penalty.waived),
        'dispute_resolved:' || log.id)
      on conflict (dedupe_key) do nothing
      returning *;
    elsif accepted = total then
      return query select * from private.uphold_dispute(log.id, false);
    end if;
  else
    if p_verdict = 'reject' then
      return query select * from private.resolve_excuse(report.study_log_id, false, false);
    elsif accepted = total then
      return query select * from private.resolve_excuse(report.study_log_id, true, false);
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scheduled steps that work on clock times: once per group
-- ---------------------------------------------------------------------------

create or replace function public.run_declaration_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.jst_today();
  settings public.group_settings;
  cutoff timestamptz;
begin
  for settings in select * from public.group_settings loop
    cutoff := private.day_at(today, settings.declaration_cutoff);
    continue when private.now() >= cutoff;

    return query
    insert into public.activity_events (type, actor_id, payload, dedupe_key)
    select 'reminder_declare_midnight', m,
           jsonb_build_object('cutoff', cutoff, 'previous_open', (private.unfinished_day(m, today)).status),
           'reminder_declare_midnight:' || m || ':' || today
    from private.undeclared_members(settings.group_id, today, cutoff) m
    on conflict (dedupe_key) do nothing
    returning *;

    if private.now() >= private.day_at(today, settings.last_declaration_reminder) then
      return query
      insert into public.activity_events (type, actor_id, payload, dedupe_key)
      select 'reminder_declare_last_call', m,
             jsonb_build_object('cutoff', cutoff, 'points', settings.penalty_no_declaration,
                                'previous_open', (private.unfinished_day(m, today)).status),
             'reminder_declare_last_call:' || m || ':' || today
      from private.undeclared_members(settings.group_id, today, cutoff) m
      on conflict (dedupe_key) do nothing
      returning *;
    end if;
  end loop;
end;
$$;

create or replace function public.close_declarations()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.jst_today();
  settings public.group_settings;
  cutoff timestamptz;
  member uuid;
  log public.study_logs;
  penalty public.penalties;
begin
  for settings in select * from public.group_settings loop
    cutoff := private.day_at(today, settings.declaration_cutoff);
    continue when private.now() < cutoff;

    for member in select * from private.undeclared_members(settings.group_id, today, cutoff) loop
      insert into public.study_logs (user_id, date, status)
      values (member, today, 'no_declaration')
      on conflict (user_id, date) do nothing
      returning * into log;
      continue when log.id is null;
      penalty := private.add_penalty(member, log.id, 'no_declaration', settings.penalty_no_declaration);
      return query
      insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
      values ('no_declaration', member, log.id,
              jsonb_build_object('points', coalesce(penalty.points, 0), 'waived', penalty.waived),
              'no_declaration:' || log.id)
      on conflict (dedupe_key) do nothing
      returning *;
      log := null;
    end loop;
  end loop;
end;
$$;

create or replace function public.due_deadline_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.jst_today();
  settings public.group_settings;
  slot time;
  lead interval;
begin
  for settings in select * from public.group_settings loop
    foreach slot in array settings.report_reminder_times loop
      continue when private.now() < private.day_at(today, slot);
      return query
      insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
      select 'reminder_report_due', r.user_id, r.study_log_id,
             jsonb_build_object('report_due_at', r.report_due_at, 'points', settings.penalty_slacked),
             'reminder_report_due:' || r.study_log_id || ':' || slot
      from public.failure_reports r
      join public.profiles p on p.id = r.user_id
      where p.group_id = settings.group_id
        and r.status = 'awaiting_report' and private.now() < r.report_due_at
        and (r.report_due_at at time zone 'Asia/Tokyo')::date = today
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;

    foreach slot in array settings.review_reminder_times loop
      continue when private.now() < private.day_at(today, slot);
      return query
      insert into public.activity_events (type, actor_id, leave_request_id, payload, dedupe_key)
      select 'reminder_review_due', r.reviewer_id, l.id,
             jsonb_build_object('subject_type', 'leave', 'owner_id', l.user_id, 'review_due_at', l.review_due_at),
             'reminder_review_due:leave:' || l.id || ':' || r.reviewer_id || ':' || slot
      from public.leave_requests l
      join public.profiles p on p.id = l.user_id
      join public.peer_reviews r on r.subject_type = 'leave' and r.subject_id = l.id and r.verdict is null
      where p.group_id = settings.group_id
        and l.status = 'under_review' and private.now() < l.review_due_at
        and (l.review_due_at at time zone 'Asia/Tokyo')::date = today
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;
  end loop;

  foreach lead in array array[interval '3 hours', interval '1 hour'] loop
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    select 'reminder_review_due', r.reviewer_id, d.study_log_id,
           jsonb_build_object('subject_type', 'dispute', 'owner_id', lg.user_id, 'review_due_at', d.review_due_at),
           'reminder_review_due:dispute:' || d.study_log_id || ':' || r.reviewer_id || ':' || extract(epoch from lead)::int
    from public.submission_disputes d
    join public.study_logs lg on lg.id = d.study_log_id
    join public.peer_reviews r on r.subject_type = 'dispute' and r.subject_id = d.study_log_id and r.verdict is null
    where d.status = 'final_review' and private.now() between d.review_due_at - lead and d.review_due_at
    on conflict (dedupe_key) do nothing
    returning *;

    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    select 'reminder_review_due', r.reviewer_id, f.study_log_id,
           jsonb_build_object('subject_type', 'excuse', 'owner_id', f.user_id, 'review_due_at', f.review_due_at),
           'reminder_review_due:excuse:' || f.study_log_id || ':' || r.reviewer_id || ':' || extract(epoch from lead)::int
    from public.failure_reports f
    join public.peer_reviews r on r.subject_type = 'excuse' and r.subject_id = f.study_log_id and r.verdict is null
    where f.status = 'under_review' and private.now() between f.review_due_at - lead and f.review_due_at
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Money and the weekly run: per group
-- ---------------------------------------------------------------------------

create or replace function public.assign_payee(p_admin_id uuid, p_user_id uuid, p_payee_id uuid)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous uuid;
  event public.activity_events;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if not private.same_group(p_admin_id, p_user_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select payee_id into previous from public.profiles where id = p_user_id and deactivated_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_payee_id = p_user_id or not private.same_group(p_user_id, p_payee_id) then
    raise exception 'invalid_payee' using errcode = 'P0001';
  end if;
  if previous is not distinct from p_payee_id then
    raise exception 'unchanged' using errcode = 'P0001';
  end if;

  update public.profiles set payee_id = p_payee_id where id = p_user_id;
  insert into public.activity_events (type, actor_id, payload)
  values ('payee_assigned', p_admin_id,
          jsonb_build_object('user_id', p_user_id, 'payee_id', p_payee_id, 'previous_payee_id', previous))
  returning * into event;
  return event;
end;
$$;

create or replace function public.run_weekly_settlement()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  period date;
  late public.settlements;
  member record;
  created public.settlements;
  admins uuid[];
begin
  for settings in select * from public.group_settings loop
    period := private.current_period_end(settings.group_id);

    -- P7 first, so it goes into this settlement: anything still 'open' from an earlier week.
    for late in
      select s.* from public.settlements s join public.profiles p on p.id = s.debtor_id
      where p.group_id = settings.group_id and s.status = 'open' and s.period_end < period
    loop
      return query
      with added as (
        insert into public.penalties (user_id, late_settlement_id, dedupe_key, points, reason, waived)
        select late.debtor_id, late.id, 'late:' || late.id || ':' || period, settings.penalty_late_payment, 'late_payment',
               case when p.trial_ends_at > private.now() then 'trial' end
        from public.profiles p where p.id = late.debtor_id and settings.penalty_late_payment > 0
        on conflict (dedupe_key) do nothing
        returning *
      )
      insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
      select 'late_payment', added.user_id, late.id,
             jsonb_build_object('points', added.points, 'waived', added.waived, 'period_end', period),
             'late_payment:' || late.id || ':' || period
      from added
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;

    -- Bundle each member's unsettled penalties up to the period end (by study day; P7 by creation).
    select coalesce(array_agg(id), '{}') into admins
    from public.profiles where group_id = settings.group_id and is_admin and deactivated_at is null;
    for member in
      select p.id, p.payee_id, sum(x.points)::int as amount
      from public.profiles p
      join public.penalties x on x.user_id = p.id and x.settlement_id is null and x.waived is null
      left join public.study_logs l on l.id = x.study_log_id
      where p.group_id = settings.group_id and p.deactivated_at is null
        and (l.date <= period or (x.study_log_id is null and x.created_at <= private.now()))
      group by p.id, p.payee_id
    loop
      if member.payee_id is null then
        return query
        insert into public.activity_events (type, actor_id, payload, dedupe_key)
        values ('payee_missing', member.id, jsonb_build_object('admin_ids', to_jsonb(admins), 'period_end', period),
                'payee_missing:' || member.id || ':' || period)
        on conflict (dedupe_key) do nothing
        returning *;
        continue;
      end if;

      insert into public.settlements (debtor_id, payee_id, period_end, amount_yen)
      values (member.id, member.payee_id, period, member.amount)
      on conflict (debtor_id, period_end) do nothing
      returning * into created;
      continue when created.id is null;

      update public.penalties x set settlement_id = created.id
      where x.user_id = member.id and x.settlement_id is null and x.waived is null
        and (
          (x.study_log_id is null and x.created_at <= private.now())
          or exists (select 1 from public.study_logs l where l.id = x.study_log_id and l.date <= period)
        );

      return query
      insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
      values ('settlement_created', member.id, created.id,
              jsonb_build_object('payee_id', created.payee_id, 'amount', created.amount_yen, 'period_end', period),
              'settlement_created:' || created.id)
      on conflict (dedupe_key) do nothing
      returning *;
      created := null;
    end loop;

    -- The week's results for the group (once per period), for weeks the group actually played.
    continue when not exists (
      select 1 from public.study_logs l join public.profiles p on p.id = l.user_id
      where p.group_id = settings.group_id and l.date between period - 6 and period
    );
    return query
    insert into public.activity_events (type, group_id, payload, dedupe_key)
    select 'weekly_summary', settings.group_id, jsonb_build_object('period_end', period, 'ranking', coalesce(jsonb_agg(
             jsonb_build_object('user_id', s.debtor_id, 'amount', s.amount_yen) order by s.amount_yen desc), '[]')),
           'weekly_summary:' || settings.group_id || ':' || period
    from public.settlements s
    join public.profiles p on p.id = s.debtor_id
    where s.period_end = period and p.group_id = settings.group_id
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

create or replace function public.late_payment_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  period date;
  next_run timestamptz;
begin
  for settings in select * from public.group_settings loop
    period := private.current_period_end(settings.group_id);
    next_run := private.day_at(period + 7, settings.settlement_time);
    continue when private.now() < next_run - interval '24 hours';
    return query
    insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
    select 'reminder_late_payment', s.debtor_id, s.id,
           jsonb_build_object('amount', s.amount_yen, 'payee_id', s.payee_id, 'due_at', next_run,
                              'points', settings.penalty_late_payment),
           'reminder_late_payment:' || s.id || ':' || (period + 7)
    from public.settlements s
    join public.profiles p on p.id = s.debtor_id
    where p.group_id = settings.group_id and s.status = 'open'
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

create or replace function public.create_weekly_reviews()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  grp uuid;
  period date;
  member record;
  created public.weekly_reviews;
begin
  for grp in select group_id from public.group_settings loop
    period := private.current_period_end(grp);
    continue when not exists (
      select 1 from public.study_logs l join public.profiles p on p.id = l.user_id
      where p.group_id = grp and l.date between period - 6 and period
    );

    for member in
      select p.id from public.profiles p
      where p.group_id = grp and p.deactivated_at is null and (p.created_at at time zone 'Asia/Tokyo')::date <= period
    loop
      insert into public.weekly_reviews (user_id, week_end, stats)
      select member.id, period, jsonb_build_object(
        'completed', count(*) filter (where h.kind = 'completed'),
        'counted', count(*) filter (where h.kind in ('completed', 'missed', 'invalidated', 'no_declaration')),
        'rest', count(*) filter (where h.kind in ('rest', 'leave')),
        'rate', round(100.0 * count(*) filter (where h.kind = 'completed')
                      / nullif(count(*) filter (where h.kind in ('completed', 'missed', 'invalidated', 'no_declaration')), 0)),
        'avg_score', round(avg(h.final_score)),
        'avg_elapsed_minutes', round(avg(h.elapsed_minutes) filter (where h.kind = 'completed')),
        'penalty', coalesce(sum(h.penalty_points), 0),
        'trial_penalty', coalesce(sum(h.trial_points), 0),
        'penalty_by_reason', coalesce(jsonb_object_agg(h.penalty_reason, h.penalty_points)
                                      filter (where h.penalty_reason is not null and h.penalty_points > 0), '{}'),
        'failure_by_category', coalesce(jsonb_object_agg(h.failure_category, 1)
                                        filter (where h.failure_category is not null), '{}')
      )
      from public.daily_history h
      where h.user_id = member.id and h.date between period - 6 and period
      on conflict (user_id, week_end) do nothing
      returning * into created;
      continue when created.user_id is null;

      return query
      insert into public.activity_events (type, actor_id, payload, dedupe_key)
      values ('weekly_review_created', member.id,
              jsonb_build_object('week_end', period, 'rate', created.stats->'rate',
                                 'completed', created.stats->'completed', 'counted', created.stats->'counted'),
              'weekly_review:' || member.id || ':' || period)
      on conflict (dedupe_key) do nothing
      returning *;
      created := null;
    end loop;
  end loop;
end;
$$;

-- Photos past each group's retention, or the oldest while the whole bucket is over budget.
create or replace function public.due_image_purges(p_limit int default 100)
returns table (submission_id uuid, image_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  budget bigint := 800::bigint * 1024 * 1024;
  used bigint;
begin
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into used
  from storage.objects o
  where o.bucket_id = 'study-evidence';

  return query
  with stored as (
    select s.id, s.image_paths, s.submitted_at, g.image_retention_days,
           (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
            where o.bucket_id = 'study-evidence' and o.name = any(s.image_paths)) as bytes
    from public.submissions s
    join public.study_logs l on l.id = s.study_log_id
    join public.profiles p on p.id = s.user_id
    join public.group_settings g on g.group_id = p.group_id
    where s.images_purged_at is null and s.status <> 'judging' and l.status not in ('pending', 'passed')
  ),
  ranked as (
    select stored.*, sum(stored.bytes) over (order by stored.submitted_at, stored.id) - stored.bytes as freed_before
    from stored
  )
  select r.id, r.image_paths from ranked r
  where r.submitted_at < private.now() - make_interval(days => r.image_retention_days)
     or (used > budget and r.freed_before < used - budget)
  order by r.submitted_at
  limit greatest(p_limit, 0);
end;
$$;

create or replace function public.update_group_settings(p_admin_id uuid, p_changes jsonb)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array[
    'declaration_cutoff', 'last_declaration_reminder', 'submit_deadline_max', 'dispute_cutoff', 'resend_cutoff',
    'report_deadline', 'review_deadline', 'rest_days_per_week', 'passing_score', 'max_attempts',
    'judge_grace_minutes', 'flag_window_hours', 'revision_minutes', 'dispute_window_hours', 'resend_minutes',
    'review_hours', 'ai_fallback_minutes',
    'penalty_no_declaration', 'penalty_slacked', 'penalty_unrealistic_streak', 'unrealistic_streak_threshold',
    'penalty_excuse_rejected', 'penalty_unrevised', 'penalty_late_payment', 'penalty_fake_evidence',
    'min_explanation_chars', 'settlement_weekday', 'settlement_time', 'image_retention_days', 'max_members',
    'invite_minutes'
  ];
  grp uuid;
  unknown text;
  before public.group_settings;
  after public.group_settings;
  event public.activity_events;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  grp := private.group_of(p_admin_id);
  select key into unknown from jsonb_object_keys(p_changes) key where key <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'invalid_setting' using errcode = 'P0001';
  end if;

  select * into before from public.group_settings where group_id = grp for update;
  begin
    update public.group_settings g set
      declaration_cutoff = coalesce((p_changes->>'declaration_cutoff')::time, g.declaration_cutoff),
      last_declaration_reminder = coalesce((p_changes->>'last_declaration_reminder')::time, g.last_declaration_reminder),
      submit_deadline_max = coalesce((p_changes->>'submit_deadline_max')::time, g.submit_deadline_max),
      dispute_cutoff = coalesce((p_changes->>'dispute_cutoff')::time, g.dispute_cutoff),
      resend_cutoff = coalesce((p_changes->>'resend_cutoff')::time, g.resend_cutoff),
      report_deadline = coalesce((p_changes->>'report_deadline')::time, g.report_deadline),
      review_deadline = coalesce((p_changes->>'review_deadline')::time, g.review_deadline),
      rest_days_per_week = coalesce((p_changes->>'rest_days_per_week')::int, g.rest_days_per_week),
      passing_score = coalesce((p_changes->>'passing_score')::int, g.passing_score),
      max_attempts = coalesce((p_changes->>'max_attempts')::int, g.max_attempts),
      judge_grace_minutes = coalesce((p_changes->>'judge_grace_minutes')::int, g.judge_grace_minutes),
      flag_window_hours = coalesce((p_changes->>'flag_window_hours')::int, g.flag_window_hours),
      revision_minutes = coalesce((p_changes->>'revision_minutes')::int, g.revision_minutes),
      dispute_window_hours = coalesce((p_changes->>'dispute_window_hours')::int, g.dispute_window_hours),
      resend_minutes = coalesce((p_changes->>'resend_minutes')::int, g.resend_minutes),
      review_hours = coalesce((p_changes->>'review_hours')::int, g.review_hours),
      ai_fallback_minutes = coalesce((p_changes->>'ai_fallback_minutes')::int, g.ai_fallback_minutes),
      penalty_no_declaration = coalesce((p_changes->>'penalty_no_declaration')::int, g.penalty_no_declaration),
      penalty_slacked = coalesce((p_changes->>'penalty_slacked')::int, g.penalty_slacked),
      penalty_unrealistic_streak = coalesce((p_changes->>'penalty_unrealistic_streak')::int, g.penalty_unrealistic_streak),
      unrealistic_streak_threshold = coalesce((p_changes->>'unrealistic_streak_threshold')::int, g.unrealistic_streak_threshold),
      penalty_excuse_rejected = coalesce((p_changes->>'penalty_excuse_rejected')::int, g.penalty_excuse_rejected),
      penalty_unrevised = coalesce((p_changes->>'penalty_unrevised')::int, g.penalty_unrevised),
      penalty_late_payment = coalesce((p_changes->>'penalty_late_payment')::int, g.penalty_late_payment),
      penalty_fake_evidence = coalesce((p_changes->>'penalty_fake_evidence')::int, g.penalty_fake_evidence),
      min_explanation_chars = coalesce((p_changes->>'min_explanation_chars')::int, g.min_explanation_chars),
      settlement_weekday = coalesce((p_changes->>'settlement_weekday')::int, g.settlement_weekday),
      settlement_time = coalesce((p_changes->>'settlement_time')::time, g.settlement_time),
      image_retention_days = coalesce((p_changes->>'image_retention_days')::int, g.image_retention_days),
      max_members = coalesce((p_changes->>'max_members')::int, g.max_members),
      invite_minutes = coalesce((p_changes->>'invite_minutes')::int, g.invite_minutes),
      updated_at = private.now()
    where g.group_id = grp
    returning * into after;
  exception
    when invalid_text_representation or invalid_datetime_format or check_violation or numeric_value_out_of_range then
      raise exception 'invalid_setting' using errcode = 'P0001';
  end;

  if not (after.last_declaration_reminder < after.declaration_cutoff
          and after.declaration_cutoff < after.report_deadline) then
    raise exception 'invalid_schedule' using errcode = 'P0001';
  end if;

  insert into public.activity_events (type, actor_id, payload)
  values ('settings_changed', p_admin_id, jsonb_build_object(
    'changes', (select coalesce(jsonb_object_agg(n.key, n.value), '{}')
                from jsonb_each(to_jsonb(after)) n
                join jsonb_each(to_jsonb(before)) o using (key)
                where n.value is distinct from o.value and n.key <> 'updated_at')))
  returning * into event;
  return event;
end;
$$;

create or replace function public.withdraw_flag(p_flagger_id uuid, p_study_log_id uuid)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
  dispute public.submission_disputes;
  withdrawn int;
  total int;
begin
  perform private.require_member(p_flagger_id);
  select * into log from public.study_logs where id = p_study_log_id for update;
  select * into dispute from public.submission_disputes where study_log_id = p_study_log_id for update;
  if not found or dispute.status <> 'resending' then
    raise exception 'withdraw_closed' using errcode = 'P0001';
  end if;
  update public.submission_flags set withdrawn_at = private.now()
  where study_log_id = p_study_log_id and flagger_id = p_flagger_id and withdrawn_at is null;
  if not found then
    raise exception 'not_flagged' using errcode = 'P0001';
  end if;

  select count(*) filter (where withdrawn_at is not null), count(*) into withdrawn, total
  from public.submission_flags where study_log_id = p_study_log_id;

  return query
  insert into public.activity_events (type, actor_id, study_log_id, payload)
  values ('flag_withdrawn', p_flagger_id, p_study_log_id,
          jsonb_build_object('owner_id', log.user_id, 'withdrawn', withdrawn, 'total', total))
  returning *;

  if withdrawn = total then
    return query select * from private.uphold_dispute(p_study_log_id, false);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: members read only their own group
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'group_settings', 'profiles', 'rest_days', 'leave_requests', 'study_logs', 'declaration_flags',
    'submissions', 'submission_flags', 'submission_disputes', 'failure_reports', 'peer_reviews',
    'settlements', 'penalties', 'activity_events', 'weekly_reviews'
  ] loop
    execute format('drop policy "members can read" on public.%I', t);
  end loop;
end;
$$;

alter table public.groups enable row level security;
grant select on public.groups to authenticated;
create policy "members read own group" on public.groups for select to authenticated
  using (id = (select private.my_group()));

create policy "members read group settings" on public.group_settings for select to authenticated
  using (group_id = (select private.my_group()));
create policy "members read group profiles" on public.profiles for select to authenticated
  using (group_id = (select private.my_group()));
create policy "members read group events" on public.activity_events for select to authenticated
  using (group_id = (select private.my_group()));

do $$
declare
  t text;
begin
  foreach t in array array['rest_days', 'leave_requests', 'study_logs', 'submissions', 'failure_reports', 'penalties', 'weekly_reviews'] loop
    execute format(
      'create policy "members read group rows" on public.%I for select to authenticated using (private.in_my_group(user_id))', t);
  end loop;
  foreach t in array array['declaration_flags', 'submission_flags', 'submission_disputes'] loop
    execute format(
      'create policy "members read group rows" on public.%I for select to authenticated using (private.log_in_my_group(study_log_id))', t);
  end loop;
end;
$$;
create policy "members read group rows" on public.peer_reviews for select to authenticated
  using (private.in_my_group(reviewer_id));
create policy "members read group rows" on public.settlements for select to authenticated
  using (private.in_my_group(debtor_id));

-- Storage: evidence of your own group only (the first folder is the owner's user id).
drop policy "members read evidence" on storage.objects;
create policy "members read evidence" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-evidence' and private.folder_in_my_group((storage.foldername(name))[1]));

-- Notifications only ever reach members of the event's group (the dispatcher also asks only
-- them; this is the backstop).
create or replace function public.create_notifications(p_event_id uuid, p_items jsonb)
returns setof public.notifications
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, event_id, title, body, url, requires_action)
  select item.recipient_id, p_event_id, item.title, coalesce(item.body, ''), item.url, coalesce(item.requires_action, false)
  from jsonb_to_recordset(p_items)
    as item(recipient_id uuid, title text, body text, url text, requires_action boolean)
  join public.profiles p on p.id = item.recipient_id and p.deactivated_at is null
  join public.activity_events e on e.id = p_event_id and e.group_id = p.group_id
  on conflict (recipient_id, event_id) do nothing
  returning *;
$$;

-- Single-group versions replaced above.
drop function private.undeclared_members(date, timestamptz);
drop function private.report_due_for(date);
drop function private.current_period_end();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.event_group()', 'private.group_of(uuid)', 'private.settings_of(uuid)', 'private.group_settings_for(uuid)',
    'private.same_group(uuid, uuid)', 'private.group_member_count(uuid)',
    'private.undeclared_members(uuid, date, timestamptz)', 'private.report_due_for(uuid, date)',
    'private.current_period_end(uuid)',
    'public.create_group(uuid, text, text, text)', 'public.rename_group(uuid, text)', 'public.set_admin(uuid, uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  -- RLS policies call these as the signed-in user.
  foreach fn in array array[
    'private.my_group()', 'private.in_my_group(uuid)', 'private.log_in_my_group(uuid)', 'private.folder_in_my_group(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end;
$$;
