-- Makeup study (補習, M11, ADR-037). Three slacking days in a row (P1, P2, P5, P6) owe one
-- makeup session from the third day on (P9). A session is a study_logs row with is_makeup: the
-- same declare -> passphrase -> submit -> AI -> 「怪しい」 flow as a day, but at most one a day,
-- declared at any time, due 24 hours after it was declared, and with no penalties of its own.
-- What is owed lives in makeup_debts (append-only, no counters: ADR-005); what was paid back is
-- the passed/completed sessions, oldest debt first. Each weekly close gives a deadline one week
-- later; whatever is still unpaid at its deadline adds one more (P10).
-- Off until group_settings.makeup_since is set (when the screens ship): only study days from then
-- on count, so nobody owes anything for streaks from before the feature existed.

-- ---------------------------------------------------------------------------
-- Sessions are study_logs rows
-- ---------------------------------------------------------------------------

alter table public.study_logs add column is_makeup boolean not null default false;
comment on column public.study_logs.is_makeup is 'A makeup session (補習, F8b), not a study day.';

-- One study day per date as before, and at most one makeup session declared per date.
alter table public.study_logs drop constraint study_logs_user_id_date_key;
create unique index study_logs_one_day_per_date on public.study_logs (user_id, date) where not is_makeup;
create unique index study_logs_one_makeup_per_date on public.study_logs (user_id, date) where is_makeup;

alter table public.group_settings
  add column slack_streak_threshold int not null default 3 check (slack_streak_threshold between 2 and 30),
  add column makeup_per_streak int not null default 1 check (makeup_per_streak between 0 and 10),
  add column makeup_per_overdue int not null default 1 check (makeup_per_overdue between 0 and 10),
  add column makeup_hours int not null default 24 check (makeup_hours between 1 and 72),
  add column makeup_since date;
comment on column public.group_settings.makeup_since is 'P9 counts study days from this date; null = makeup study is off.';

-- ---------------------------------------------------------------------------
-- What is owed
-- ---------------------------------------------------------------------------

create table public.makeup_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  reason text not null check (reason in ('slack_streak', 'overdue')),
  study_log_id uuid references public.study_logs (id),
  period_end date,
  count int not null check (count > 0),
  waived text check (waived in ('trial')),
  due_at timestamptz not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  check ((reason = 'slack_streak') = (study_log_id is not null)),
  check ((reason = 'overdue') = (period_end is not null))
);
comment on table public.makeup_debts is 'Makeup sessions owed: P9 (slack_streak, one study day) and P10 (overdue, one weekly close).';
create index makeup_debts_user_idx on public.makeup_debts (user_id);

create trigger forbid_delete before delete on public.makeup_debts
  for each row execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.makeup_debts
  for each statement execute function private.forbid_delete();
create trigger restrict_update before update on public.makeup_debts
  for each row execute function private.restrict_update();

alter table public.makeup_debts enable row level security;
grant select on public.makeup_debts to authenticated;
create policy "members read group rows" on public.makeup_debts for select to authenticated
  using (private.in_my_group(user_id));

-- A member's makeup balance as of p_at. Paid back = sessions that passed by then and still count
-- (passed: in the 「怪しい」 window, completed: confirmed), applied to the oldest debts first.
-- Not security definer: members read it through the view below, under RLS.
create function private.makeup_balance(p_user_id uuid, p_at timestamptz)
returns table (
  owed int, trial_owed int, completed int, reviewing int, open int, remaining int,
  overdue int, next_due_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with sessions as (
    select
      count(*) filter (where l.status = 'completed' and l.passed_at <= p_at)::int as completed,
      count(*) filter (where l.status = 'passed' and l.passed_at <= p_at)::int as reviewing,
      count(*) filter (where l.status = 'pending')::int as open
    from public.study_logs l where l.user_id = p_user_id and l.is_makeup
  ),
  debts as (
    select d.count, d.due_at,
           sum(d.count) over (order by d.due_at, d.created_at, d.id) as running
    from public.makeup_debts d
    where d.user_id = p_user_id and d.waived is null and d.created_at <= p_at
  ),
  unpaid as (
    select d.due_at, least(d.count, greatest(d.running - (s.completed + s.reviewing), 0))::int as left_over
    from debts d cross join sessions s
  )
  select
    coalesce((select sum(count) from debts), 0)::int,
    coalesce((select sum(d.count) from public.makeup_debts d
              where d.user_id = p_user_id and d.waived = 'trial' and d.created_at <= p_at), 0)::int,
    s.completed, s.reviewing, s.open,
    coalesce((select sum(left_over) from unpaid), 0)::int,
    coalesce((select sum(left_over) from unpaid where due_at <= p_at), 0)::int,
    (select min(due_at) from unpaid where left_over > 0)
  from sessions s;
$$;

-- One row per member, for the dashboard and the makeup screen.
create view public.makeup_summary
with (security_invoker = true) as
select p.id as user_id, b.*
from public.profiles p
cross join lateral private.makeup_balance(p.id, private.now()) b
where p.deactivated_at is null;

grant select on public.makeup_summary to authenticated;

-- The deadline for a debt made now: the end of the week after this one.
create function private.makeup_due_after(p_group_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select private.day_at(private.current_period_end(p_group_id) + 14, (private.group_settings_for(p_group_id)).settlement_time);
$$;

-- ---------------------------------------------------------------------------
-- Study days ignore sessions
-- ---------------------------------------------------------------------------

create or replace function private.undeclared_members(p_group_id uuid, p_date date, p_cutoff timestamptz)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.group_id = p_group_id
    and p.deactivated_at is null
    and p.created_at < p_cutoff
    and not exists (select 1 from public.study_logs l where l.user_id = p.id and l.date = p_date and not l.is_makeup)
    and not private.is_rest_day(p.id, p_date)
    and not private.is_on_leave(p.id, p_date);
$$;

create or replace function private.unfinished_day(p_user_id uuid, p_before date)
returns public.study_logs
language sql
stable
set search_path = ''
as $$
  select l.* from public.study_logs l
  left join public.failure_reports r on r.study_log_id = l.id
  where l.user_id = p_user_id and l.date < p_before and not l.is_makeup
    and (l.status = 'pending' or (l.status = 'missed' and r.status = 'awaiting_report'))
  order by l.date desc
  limit 1;
$$;

create or replace function private.unrealistic_streak(p_study_log_id uuid)
returns int
language plpgsql
stable
set search_path = ''
as $$
declare
  target public.study_logs;
  previous record;
  streak int := 1;
begin
  select * into target from public.study_logs where id = p_study_log_id;
  for previous in
    select l.status, r.category, r.status as report_status
    from public.study_logs l
    left join public.failure_reports r on r.study_log_id = l.id
    where l.user_id = target.user_id and l.date < target.date and l.status <> 'no_declaration' and not l.is_makeup
    order by l.date desc
  loop
    exit when previous.status <> 'missed'
           or previous.report_status is distinct from 'resolved'
           or previous.category is distinct from 'unrealistic';
    streak := streak + 1;
  end loop;
  return streak;
end;
$$;

-- Sessions never carry a penalty (a failed or rejected session just doesn't pay anything back).
create or replace function private.add_penalty(p_user_id uuid, p_study_log_id uuid, p_reason text, p_points int)
returns public.penalties
language plpgsql
set search_path = ''
as $$
declare
  added public.penalties;
  day_start timestamptz;
begin
  if p_points <= 0 or not exists (select 1 from public.profiles where id = p_user_id and deactivated_at is null) then
    return null;
  end if;
  if exists (select 1 from public.study_logs where id = p_study_log_id and is_makeup) then
    return null;
  end if;
  select private.day_at(l.date, time '00:00') into day_start from public.study_logs l where l.id = p_study_log_id;
  insert into public.penalties (user_id, study_log_id, dedupe_key, points, reason, waived)
  select p_user_id, p_study_log_id, 'log:' || p_study_log_id, p_points, p_reason,
         case when p.trial_ends_at > coalesce(day_start, private.now()) then 'trial' end
  from public.profiles p where p.id = p_user_id
  on conflict (dedupe_key) do nothing
  returning * into added;
  return added;
end;
$$;

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
  if exists (select 1 from public.study_logs where user_id = p_user_id and date = today and not is_makeup) then
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
      on conflict (user_id, date) where not is_makeup do nothing
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

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

-- Declare a makeup session: something must still be owed (beyond the sessions already running
-- or done), and one session a day (JST). Rest days and leave don't matter.
create function public.declare_makeup(p_user_id uuid, p_declaration text, p_passphrase text)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.jst_today();
  settings public.group_settings;
  balance record;
  log public.study_logs;
  event public.activity_events;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);
  -- One declaration at a time per member.
  perform pg_advisory_xact_lock(hashtext('declare_makeup:' || p_user_id));

  select * into balance from private.makeup_balance(p_user_id, private.now());
  if balance.remaining - balance.open <= 0 then
    raise exception 'no_makeup_due' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.study_logs where user_id = p_user_id and date = today and is_makeup) then
    raise exception 'makeup_already_today' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_declaration, ''))) not between 1 and 500 then
    raise exception 'invalid_declaration' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_passphrase, ''))) = 0 then
    raise exception 'invalid_passphrase' using errcode = 'P0001';
  end if;

  insert into public.study_logs (user_id, date, status, declaration, target_end_time, passphrase, declared_at, is_makeup)
  values (p_user_id, today, 'pending', btrim(p_declaration), private.now() + make_interval(hours => settings.makeup_hours),
          btrim(p_passphrase), private.now(), true)
  returning * into log;

  insert into public.activity_events (type, actor_id, study_log_id, payload)
  values ('makeup_declared', p_user_id, log.id,
          jsonb_build_object('declaration', log.declaration, 'target_end_time', log.target_end_time,
                             'remaining', balance.remaining))
  returning * into event;
  return event;
end;
$$;

-- 「軽すぎる」: a session is open for flags from its declaration, whatever the date.
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
     or (not log.is_makeup and log.date <> private.jst_today())
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
          jsonb_build_object('owner_id', log.user_id, 'comment', btrim(p_comment), 'revision_due_at', log.revision_due_at,
                             'makeup', log.is_makeup))
  returning * into event;
  return event;
end;
$$;

-- 「できなかった」: a session just ends (no reason to report).
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

  update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
  update public.submissions set judge_error = 'cancelled: gave up'
  where study_log_id = log.id and status = 'error';

  if log.is_makeup then
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('makeup_failed', log.user_id, log.id, jsonb_build_object('cause', 'gave_up'), 'makeup_failed:' || log.id)
    on conflict (dedupe_key) do nothing
    returning * into event;
    return event;
  end if;

  due := private.report_due_for(log.user_id, log.date);
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

-- Cron: past the deadline. A session ends without a report.
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
    update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
    if log.is_makeup then
      return query
      insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
      values ('makeup_failed', log.user_id, log.id, jsonb_build_object('cause', 'deadline'), 'makeup_failed:' || log.id)
      on conflict (dedupe_key) do nothing
      returning *;
      continue;
    end if;
    due := private.report_due_for(log.user_id, log.date);
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

-- Cron: 「軽すぎる」 not rewritten in time. A session is cancelled (no P6).
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
    update public.submissions set status = 'error', judge_error = 'cancelled: declaration not revised'
    where study_log_id = log.id and status in ('judging', 'error');
    if log.is_makeup then
      update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
      return query
      insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
      values ('makeup_failed', log.user_id, log.id, jsonb_build_object('cause', 'unrevised'), 'makeup_failed:' || log.id)
      on conflict (dedupe_key) do nothing
      returning *;
      continue;
    end if;
    update public.study_logs set status = 'no_declaration' where id = log.id;
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

-- Cron: the 「怪しい」 window closed. A confirmed session pays one back.
create or replace function public.confirm_passed_logs()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
begin
  for log in
    select l.* from public.study_logs l
    where l.status = 'passed' and l.dispute_window_ends_at <= private.now()
      and not exists (select 1 from public.submission_disputes d where d.study_log_id = l.id)
    for update skip locked
  loop
    update public.study_logs set status = 'completed', completed_at = private.now() where id = log.id;
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values (case when log.is_makeup then 'makeup_completed' else 'completion_confirmed' end, log.user_id, log.id,
            '{}'::jsonb, 'completion_confirmed:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- P9 and P10
-- ---------------------------------------------------------------------------

-- Cron: P9. Walks each member's study days since makeup_since in date order and counts slacking days in a row
-- (P1, P6: no declaration; P2, P5: missed and reported, or not reported, as slacking). A
-- completed day resets the run, and so does a day not settled yet (it is counted again once it
-- is, which may give a later day its P9). Other days (P3, P4, P8, excused) neither count nor
-- reset. Trial days run on their own and owe nothing (waived, shown as 「本番なら」).
create function public.award_makeups()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  settings public.group_settings;
  log record;
  streak int;
  in_trial boolean;
  was_trial boolean;
  added public.makeup_debts;
begin
  for member in select p.id, p.group_id, p.trial_ends_at from public.profiles p where p.deactivated_at is null loop
    settings := private.group_settings_for(member.group_id);
    continue when settings.makeup_since is null or settings.makeup_per_streak = 0;
    streak := 0;
    was_trial := null;
    for log in
      select l.id, l.date, l.status, r.status as report_status, r.category
      from public.study_logs l
      left join public.failure_reports r on r.study_log_id = l.id
      where l.user_id = member.id and not l.is_makeup and l.date >= settings.makeup_since
      order by l.date
    loop
      in_trial := member.trial_ends_at > private.day_at(log.date, time '00:00');
      if was_trial is distinct from in_trial then
        streak := 0;
      end if;
      was_trial := in_trial;

      if log.status = 'no_declaration'
         or (log.status = 'missed' and log.report_status = 'resolved' and log.category in ('slacked', 'not_reported')) then
        streak := streak + 1;
        continue when streak < settings.slack_streak_threshold;
        insert into public.makeup_debts (user_id, reason, study_log_id, count, waived, due_at, dedupe_key, created_at)
        values (member.id, 'slack_streak', log.id, settings.makeup_per_streak, case when in_trial then 'trial' end,
                private.makeup_due_after(member.group_id), 'streak:' || log.id, private.now())
        on conflict (dedupe_key) do nothing
        returning * into added;
        if added.id is not null then
          return query
          insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
          values ('makeup_assigned', member.id, log.id,
                  jsonb_build_object('reason', 'slack_streak', 'count', added.count, 'streak', streak,
                                     'waived', added.waived, 'due_at', added.due_at),
                  'makeup_assigned:' || added.id)
          on conflict (dedupe_key) do nothing
          returning *;
        end if;
        added := null;
      elsif log.status in ('completed', 'pending', 'passed')
            or (log.status = 'missed' and log.report_status is distinct from 'resolved') then
        streak := 0;
      end if;
    end loop;
  end loop;
end;
$$;

-- Cron: the weekly close (after the settlement). Whatever was due by the close and is still
-- unpaid adds one more, due a week later (P10). Skipped while on leave (the deadline waits).
-- Everyone who still owes something hears where they stand.
create function public.close_makeup_week()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  period date;
  close_at timestamptz;
  member record;
  balance record;
  added public.makeup_debts;
begin
  for settings in select * from public.group_settings loop
    period := private.current_period_end(settings.group_id);
    close_at := private.day_at(period, settings.settlement_time);
    for member in
      select p.id, p.trial_ends_at from public.profiles p
      where p.group_id = settings.group_id and p.deactivated_at is null
        and exists (select 1 from public.makeup_debts d where d.user_id = p.id and d.created_at <= close_at)
    loop
      select * into balance from private.makeup_balance(member.id, close_at);
      if balance.overdue > 0 and settings.makeup_per_overdue > 0 and not private.is_on_leave(member.id, period) then
        insert into public.makeup_debts (user_id, reason, period_end, count, waived, due_at, dedupe_key, created_at)
        values (member.id, 'overdue', period, settings.makeup_per_overdue,
                case when member.trial_ends_at > close_at then 'trial' end,
                private.day_at(period + 7, settings.settlement_time), 'overdue:' || member.id || ':' || period, close_at)
        on conflict (dedupe_key) do nothing
        returning * into added;
        if added.id is not null then
          return query
          insert into public.activity_events (type, actor_id, payload, dedupe_key)
          values ('makeup_overdue', member.id,
                  jsonb_build_object('count', added.count, 'overdue', balance.overdue, 'period_end', period,
                                     'waived', added.waived, 'due_at', added.due_at),
                  'makeup_overdue:' || added.id)
          on conflict (dedupe_key) do nothing
          returning *;
        end if;
        added := null;
      end if;

      select * into balance from private.makeup_balance(member.id, close_at);
      continue when balance.remaining = 0;
      return query
      insert into public.activity_events (type, actor_id, payload, dedupe_key)
      values ('makeup_due', member.id,
              jsonb_build_object('remaining', balance.remaining, 'overdue', balance.overdue,
                                 'next_due_at', balance.next_due_at, 'period_end', period),
              'makeup_due:' || member.id || ':' || period)
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;
  end loop;
end;
$$;

-- Cron: 24 hours before a deadline with something still unpaid.
create function public.due_makeup_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  balance record;
begin
  for member in
    select p.id from public.profiles p
    where p.deactivated_at is null
      and exists (select 1 from public.makeup_debts d where d.user_id = p.id and d.waived is null)
  loop
    select * into balance from private.makeup_balance(member.id, private.now());
    continue when balance.next_due_at is null
      or private.now() not between balance.next_due_at - interval '24 hours' and balance.next_due_at;
    return query
    insert into public.activity_events (type, actor_id, payload, dedupe_key)
    values ('reminder_makeup_due', member.id,
            jsonb_build_object('remaining', balance.remaining, 'due_at', balance.next_due_at),
            'reminder_makeup_due:' || member.id || ':' || balance.next_due_at)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

create or replace function public.tick()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('tick')) then
    return;
  end if;
  return query select * from public.run_declaration_reminders();
  return query select * from public.close_declarations();
  return query select * from public.expire_revisions();
  return query select * from public.due_submit_reminders();
  return query select * from public.pass_unjudged();
  return query select * from public.close_overdue_logs();
  return query select * from public.confirm_passed_logs();
  return query select * from public.advance_disputes();
  return query select * from public.expire_reports();
  return query select * from public.expire_reviews();
  return query select * from public.due_deadline_reminders();
  return query select * from public.trial_ending_reminders();
  return query select * from public.award_makeups();
  return query select * from public.run_weekly_settlement();
  return query select * from public.close_makeup_week();
  return query select * from public.create_weekly_reviews();
  return query select * from public.late_payment_reminders();
  return query select * from public.due_makeup_reminders();
end;
$$;

-- ---------------------------------------------------------------------------
-- History ignores sessions
-- ---------------------------------------------------------------------------

create or replace view public.daily_history
with (security_invoker = true) as
with days as (
  select p.id as user_id, d::date as date, p.trial_ends_at
  from public.profiles p
  cross join lateral generate_series(
    (p.created_at at time zone 'Asia/Tokyo')::date,
    private.jst_today(),
    interval '1 day'
  ) d
  where p.deactivated_at is null
)
select
  days.user_id,
  days.date,
  case
    when l.status = 'completed' then 'completed'
    when l.status in ('pending', 'passed') then 'pending'
    when l.status is not null then l.status
    when exists (select 1 from public.rest_days r where r.user_id = days.user_id and r.date = days.date) then 'rest'
    when exists (
      select 1 from public.leave_requests lr
      where lr.user_id = days.user_id and lr.approved_at is not null
        and lr.approved_at < (days.date + time '00:00') at time zone 'Asia/Tokyo'
        and days.date between lr.start_date and lr.end_date
        and (lr.cancelled_from is null or days.date < lr.cancelled_from)
    ) then 'leave'
    when days.date = private.jst_today() then 'pending'
    else 'none'
  end as kind,
  l.id as study_log_id,
  l.declaration,
  passed.ai_score as final_score,
  (select count(*)::int from public.submissions s
   where s.study_log_id = l.id and s.kind = 'regular' and s.status <> 'error') as attempts,
  coalesce(passed.elapsed_minutes, latest.elapsed_minutes) as elapsed_minutes,
  extract(hour from coalesce(passed.submitted_at, latest.submitted_at) at time zone 'Asia/Tokyo')::int as submitted_hour,
  coalesce(pen.points, 0)::int as penalty_points,
  coalesce(pen.trial_points, 0)::int as trial_points,
  pen.reason as penalty_reason,
  r.category as failure_category,
  days.date < (days.trial_ends_at at time zone 'Asia/Tokyo')::date as in_trial
from days
left join public.study_logs l on l.user_id = days.user_id and l.date = days.date and not l.is_makeup
left join lateral (
  select s.ai_score, s.elapsed_minutes, s.submitted_at from public.submissions s
  where s.study_log_id = l.id and s.kind = 'regular' and s.status = 'passed'
  order by s.submitted_at limit 1
) passed on true
left join lateral (
  select s.elapsed_minutes, s.submitted_at from public.submissions s
  where s.study_log_id = l.id and s.kind = 'regular'
  order by s.submitted_at desc limit 1
) latest on true
left join lateral (
  select sum(x.points) filter (where x.waived is null) as points,
         sum(x.points) filter (where x.waived = 'trial') as trial_points,
         min(x.reason) as reason
  from public.penalties x where x.study_log_id = l.id
) pen on true
left join public.failure_reports r on r.study_log_id = l.id;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

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
    'invite_minutes',
    'slack_streak_threshold', 'makeup_per_streak', 'makeup_per_overdue', 'makeup_hours'
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
      slack_streak_threshold = coalesce((p_changes->>'slack_streak_threshold')::int, g.slack_streak_threshold),
      makeup_per_streak = coalesce((p_changes->>'makeup_per_streak')::int, g.makeup_per_streak),
      makeup_per_overdue = coalesce((p_changes->>'makeup_per_overdue')::int, g.makeup_per_overdue),
      makeup_hours = coalesce((p_changes->>'makeup_hours')::int, g.makeup_hours),
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

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.makeup_due_after(uuid)',
    'public.declare_makeup(uuid, text, text)', 'public.award_makeups()', 'public.close_makeup_week()',
    'public.due_makeup_reminders()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
-- Read under the caller's RLS (the makeup_summary view).
revoke all on function private.makeup_balance(uuid, timestamptz) from public, anon;
grant execute on function private.makeup_balance(uuid, timestamptz) to authenticated, service_role;
