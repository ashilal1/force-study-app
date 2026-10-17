-- Flexible submission deadline (ADR-032). A study day no longer has to be settled the same day:
--   - the submission deadline is the next day's declaration cutoff (12:00), so studying late at
--     night counts; the member doesn't pick a deadline any more
--   - the next declaration needs the previous day finished: passed, or (after 「できなかった」)
--     the reason reported. So the day can't be left hanging
--   - the reason report is due at report_deadline (23:00) on the day after the study day
--   - 「怪しい」 is open for dispute_window_hours (24) after the passing submission, the evidence
--     can be resent for resend_minutes (24h) after the first flag, and reviews (reasons, final
--     reviews of disputes) get review_hours (24) from when they open
--   - the trial waiver follows the study day, not the time the penalty is decided
-- Earlier signatures stay, so the code still deployed on main keeps working (ADR-031).

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------

alter table public.group_settings
  add column review_hours int not null default 24 check (review_hours between 1 and 72);

alter table public.group_settings alter column dispute_window_hours set default 24;
alter table public.group_settings alter column resend_minutes set default 1440;
update public.group_settings set dispute_window_hours = 24 where dispute_window_hours = 3;
update public.group_settings set resend_minutes = 1440 where resend_minutes = 60;

comment on column public.group_settings.submit_deadline_max is 'Unused since ADR-032 (the deadline is the next day''s declaration cutoff).';
comment on column public.group_settings.dispute_cutoff is 'Unused since ADR-032.';
comment on column public.group_settings.resend_cutoff is 'Unused since ADR-032.';
comment on column public.group_settings.review_deadline is 'Leave reviews only (same day). Reasons and disputes use review_hours (ADR-032).';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Penalties are waived for study days inside the trial week, even when they are decided later
-- (a Saturday miss is settled on Sunday). Penalties without a day (P7) use the current time.
create or replace function private.add_penalty(p_user_id uuid, p_study_log_id uuid, p_reason text, p_points int)
returns public.penalties
language plpgsql
set search_path = ''
as $$
declare
  added public.penalties;
  day_start timestamptz;
begin
  if p_points <= 0 then
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

-- The member's earlier day that still blocks a new declaration: not yet passed (still open for
-- submissions), or missed with the reason not reported yet. Null when nothing is left.
create function private.unfinished_day(p_user_id uuid, p_before date)
returns public.study_logs
language sql
stable
set search_path = ''
as $$
  select l.* from public.study_logs l
  left join public.failure_reports r on r.study_log_id = l.id
  where l.user_id = p_user_id and l.date < p_before
    and (l.status = 'pending' or (l.status = 'missed' and r.status = 'awaiting_report'))
  order by l.date desc
  limit 1;
$$;

-- When the reason report for a missed day is due: report_deadline on the day after the study
-- day, and never less than an hour away (a late tick shouldn't leave no time at all).
create function private.report_due_for(p_date date)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select greatest(
    private.day_at(p_date + 1, (select g.report_deadline from public.group_settings g)),
    private.now() + interval '1 hour'
  );
$$;

-- ---------------------------------------------------------------------------
-- Declarations
-- ---------------------------------------------------------------------------

-- p_end_time is ignored (kept for the deployed code): the deadline is tomorrow's cutoff.
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
  select * into settings from public.group_settings;

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

-- 「できなかった」: the member closes their open day as missed before the deadline, so they can
-- report the reason and declare the next day.
create function public.give_up_day(p_user_id uuid, p_study_log_id uuid)
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

  due := private.report_due_for(log.date);
  update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
  -- Errored attempts can't be judged any more (the day is closed).
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

-- ---------------------------------------------------------------------------
-- Submissions: yesterday's open day can still be submitted until its deadline
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
  select * into settings from public.group_settings;
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

-- 「怪しい」 is open for dispute_window_hours after the passing submission was sent.
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
  select * into settings from public.group_settings;
  select * into sub from public.submissions where id = p_submission_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
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
      -- A late re-judge still leaves a moment to look (and keeps the window after passed_at).
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

-- ---------------------------------------------------------------------------
-- 「怪しい」: resend for resend_minutes after the first flag, final review for review_hours
-- ---------------------------------------------------------------------------

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
  select * into settings from public.group_settings;
  select * into log from public.study_logs where id = p_study_log_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
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
  settings public.group_settings;
  dispute public.submission_disputes;
  log public.study_logs;
  reviewer_ids uuid[];
begin
  select * into settings from public.group_settings;

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
    set status = 'final_review', review_due_at = private.now() + make_interval(hours => settings.review_hours)
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

-- ---------------------------------------------------------------------------
-- Missed days and their reasons
-- ---------------------------------------------------------------------------

create or replace function public.close_overdue_logs()
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
    due := private.report_due_for(log.date);
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

-- Same as before, except the reason review lasts review_hours from the report.
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
  select * into settings from public.group_settings;
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

-- ---------------------------------------------------------------------------
-- Reminders
-- ---------------------------------------------------------------------------

-- Declaration reminders now say whether yesterday is still open (it has to be finished first).
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
  select * into settings from public.group_settings;
  cutoff := private.day_at(today, settings.declaration_cutoff);
  if private.now() >= cutoff then
    return;
  end if;

  return query
  insert into public.activity_events (type, actor_id, payload, dedupe_key)
  select 'reminder_declare_midnight', m,
         jsonb_build_object('cutoff', cutoff, 'previous_open', (private.unfinished_day(m, today)).status),
         'reminder_declare_midnight:' || m || ':' || today
  from private.undeclared_members(today, cutoff) m
  on conflict (dedupe_key) do nothing
  returning *;

  if private.now() >= private.day_at(today, settings.last_declaration_reminder) then
    return query
    insert into public.activity_events (type, actor_id, payload, dedupe_key)
    select 'reminder_declare_last_call', m,
           jsonb_build_object('cutoff', cutoff, 'points', settings.penalty_no_declaration,
                              'previous_open', (private.unfinished_day(m, today)).status),
           'reminder_declare_last_call:' || m || ':' || today
    from private.undeclared_members(today, cutoff) m
    on conflict (dedupe_key) do nothing
    returning *;
  end if;
end;
$$;

-- Report reminders keep their clock times on the day the report is due. Leave reviews keep
-- theirs too (same-day deadline). Reason and dispute reviews, which now end at any hour, are
-- reminded 3 hours and 1 hour before their deadline.
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
  select * into settings from public.group_settings;

  foreach slot in array settings.report_reminder_times loop
    continue when private.now() < private.day_at(today, slot);
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    select 'reminder_report_due', r.user_id, r.study_log_id,
           jsonb_build_object('report_due_at', r.report_due_at, 'points', settings.penalty_slacked),
           'reminder_report_due:' || r.study_log_id || ':' || slot
    from public.failure_reports r
    where r.status = 'awaiting_report' and private.now() < r.report_due_at
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
    join public.peer_reviews r on r.subject_type = 'leave' and r.subject_id = l.id and r.verdict is null
    where l.status = 'under_review' and private.now() < l.review_due_at
      and (l.review_due_at at time zone 'Asia/Tokyo')::date = today
    on conflict (dedupe_key) do nothing
    returning *;
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
-- Group settings: review_hours, and the order check without the retired clock times
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
    'review_hours',
    'penalty_no_declaration', 'penalty_slacked', 'penalty_unrealistic_streak', 'unrealistic_streak_threshold',
    'penalty_excuse_rejected', 'penalty_unrevised', 'penalty_late_payment', 'penalty_fake_evidence',
    'min_explanation_chars', 'settlement_weekday', 'settlement_time', 'image_retention_days', 'max_members',
    'invite_minutes'
  ];
  unknown text;
  before public.group_settings;
  after public.group_settings;
  event public.activity_events;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select key into unknown from jsonb_object_keys(p_changes) key where key <> all (allowed) limit 1;
  if unknown is not null then
    raise exception 'invalid_setting' using errcode = 'P0001';
  end if;

  select * into before from public.group_settings for update;
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
    returning * into after;
  exception
    when invalid_text_representation or invalid_datetime_format or check_violation or numeric_value_out_of_range then
      raise exception 'invalid_setting' using errcode = 'P0001';
  end;

  -- The reminder comes before the cutoff; a day missed at the next day's cutoff still has time
  -- to report before report_deadline.
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

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.unfinished_day(uuid, date)', 'private.report_due_for(date)', 'public.give_up_day(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
