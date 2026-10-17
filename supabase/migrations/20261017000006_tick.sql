-- M6: the scheduled steps (requirements F9, docs/architecture.md §2.5) and pg_cron.
-- pg_cron calls POST /api/cron/tick every 5 minutes; the route runs public.tick(), dispatches
-- the events it returns, and re-judges submissions stuck in error. Every step is idempotent
-- (dedupe keys, status checks), so a late, missed or doubled tick catches up safely.

-- ---------------------------------------------------------------------------
-- Declarations: reminders (0:00, 11:00) and "no declaration" at the cutoff (P1)
-- ---------------------------------------------------------------------------

-- Members who still owe a declaration today: active, joined before the cutoff, no log, not
-- resting, not on leave.
create function private.undeclared_members(p_date date, p_cutoff timestamptz)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select p.id from public.profiles p
  where p.deactivated_at is null
    and p.created_at < p_cutoff
    and not exists (select 1 from public.study_logs l where l.user_id = p.id and l.date = p_date)
    and not private.is_rest_day(p.id, p_date)
    and not private.is_on_leave(p.id, p_date);
$$;

create function public.run_declaration_reminders()
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
  select * into settings from public.group_settings;
  cutoff := private.day_at(today, settings.declaration_cutoff);
  if private.now() >= cutoff then
    return;
  end if;

  return query
  insert into public.activity_events (type, actor_id, payload, dedupe_key)
  select 'reminder_declare_midnight', m, jsonb_build_object('cutoff', cutoff),
         'reminder_declare_midnight:' || m || ':' || today
  from private.undeclared_members(today, cutoff) m
  on conflict (dedupe_key) do nothing
  returning *;

  if private.now() >= private.day_at(today, settings.last_declaration_reminder) then
    return query
    insert into public.activity_events (type, actor_id, payload, dedupe_key)
    select 'reminder_declare_last_call', m,
           jsonb_build_object('cutoff', cutoff, 'points', settings.penalty_no_declaration),
           'reminder_declare_last_call:' || m || ':' || today
    from private.undeclared_members(today, cutoff) m
    on conflict (dedupe_key) do nothing
    returning *;
  end if;
end;
$$;

create function public.close_declarations()
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
  select * into settings from public.group_settings;
  cutoff := private.day_at(today, settings.declaration_cutoff);
  if private.now() < cutoff then
    return;
  end if;

  for member in select * from private.undeclared_members(today, cutoff) loop
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
end;
$$;

-- ---------------------------------------------------------------------------
-- Submissions: 1-hour reminder, missed at the deadline, confirmation after the dispute window
-- ---------------------------------------------------------------------------

create function public.due_submit_reminders()
returns setof public.activity_events
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  select 'reminder_submit', l.user_id, l.id, jsonb_build_object('deadline', l.target_end_time),
         'reminder_submit:' || l.id
  from public.study_logs l
  where l.status = 'pending'
    and private.now() between l.target_end_time - interval '1 hour' and l.target_end_time
  on conflict (dedupe_key) do nothing
  returning *;
$$;

-- Past the deadline without passing. A submission sent before the deadline that is still being
-- judged (or errored) gets judge_grace_minutes before the day is closed (ADR-007).
create function public.close_overdue_logs()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  due timestamptz;
begin
  select * into settings from public.group_settings;
  for log in
    select l.* from public.study_logs l
    where l.status = 'pending' and l.target_end_time <= private.now()
      and not exists (
        select 1 from public.submissions s
        where s.study_log_id = l.id and s.kind = 'regular' and s.status in ('judging', 'error')
          and s.submitted_at < l.target_end_time
          and private.now() < l.target_end_time + make_interval(mins => settings.judge_grace_minutes)
      )
    for update skip locked
  loop
    due := private.day_at(log.date, settings.report_deadline);
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

-- Passed and nobody said 「怪しい」 in time: the day is achieved.
create function public.confirm_passed_logs()
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
    values ('completion_confirmed', log.user_id, log.id, '{}'::jsonb, 'completion_confirmed:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Evening reminders for reviews still open (leave, dispute final review). Excuse reports and
-- their reviews join in M7.
-- ---------------------------------------------------------------------------

create function public.due_deadline_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := private.jst_today();
  settings public.group_settings;
  slot time;
begin
  select * into settings from public.group_settings;
  foreach slot in array settings.review_reminder_times loop
    continue when private.now() < private.day_at(today, slot);

    return query
    insert into public.activity_events (type, actor_id, leave_request_id, payload, dedupe_key)
    select 'reminder_review_due', r.reviewer_id, l.id,
           jsonb_build_object('subject_type', 'leave', 'owner_id', l.user_id, 'review_due_at', l.review_due_at),
           'reminder_review_due:leave:' || l.id || ':' || r.reviewer_id || ':' || slot
    from public.leave_requests l
    join public.peer_reviews r on r.subject_type = 'leave' and r.subject_id = l.id and r.verdict is null
    where l.status = 'under_review' and private.now() < l.review_due_at
      and (l.review_due_at at time zone 'Asia/Tokyo')::date = today
    on conflict (dedupe_key) do nothing
    returning *;

    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    select 'reminder_review_due', r.reviewer_id, d.study_log_id,
           jsonb_build_object('subject_type', 'dispute', 'owner_id', lg.user_id, 'review_due_at', d.review_due_at),
           'reminder_review_due:dispute:' || d.study_log_id || ':' || r.reviewer_id || ':' || slot
    from public.submission_disputes d
    join public.study_logs lg on lg.id = d.study_log_id
    join public.peer_reviews r on r.subject_type = 'dispute' and r.subject_id = d.study_log_id and r.verdict is null
    where d.status = 'final_review' and private.now() < d.review_due_at and lg.date = today
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- The last day of the trial week: "from tomorrow 0:00, penalties are real".
create function public.trial_ending_reminders()
returns setof public.activity_events
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_events (type, actor_id, payload, dedupe_key)
  select 'trial_ending', p.id, jsonb_build_object('trial_ends_at', p.trial_ends_at), 'trial_ending:' || p.id
  from public.profiles p
  where p.deactivated_at is null
    and private.jst_today() = (p.trial_ends_at at time zone 'Asia/Tokyo')::date - 1
  on conflict (dedupe_key) do nothing
  returning *;
$$;

-- ---------------------------------------------------------------------------
-- tick(): every step in order. Concurrent ticks don't overlap (the second one does nothing).
-- Later milestones add report expiry and reminders (M7) and the weekly settlement (M7).
-- ---------------------------------------------------------------------------

create function public.tick()
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
  return query select * from public.close_overdue_logs();
  return query select * from public.confirm_passed_logs();
  return query select * from public.advance_disputes();
  return query select * from public.expire_reviews();
  return query select * from public.due_deadline_reminders();
  return query select * from public.trial_ending_reminders();
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.undeclared_members(date, timestamptz)',
    'public.run_declaration_reminders()', 'public.close_declarations()', 'public.due_submit_reminders()',
    'public.close_overdue_logs()', 'public.confirm_passed_logs()', 'public.due_deadline_reminders()',
    'public.trial_ending_reminders()', 'public.tick()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- pg_cron: POST the tick every 5 minutes (ADR-003). The URL and the shared secret live in
-- Supabase Vault, set once per project (README): each project calls its own deployment.
-- Skipped where the extensions don't exist (the PGlite test database).
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net with schema extensions;
    perform cron.schedule('tick', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'tick_url'),
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'tick_url');
    $job$);
  end if;
end;
$$;
