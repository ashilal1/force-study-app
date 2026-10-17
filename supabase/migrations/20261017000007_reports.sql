-- M7a: reason reports for missed days and their reviews (requirements F6, F7, P2-P5).
-- missed -> awaiting_report (by 23:00)
--   unrealistic: next plan; 0 yen, P3 from the threshold-th time in a row
--   slacked: P2
--   sudden_plan / other: everyone else reviews by 23:59; all accept -> 0 yen, one reject or
--     a missing vote at the deadline -> P4
--   no report by 23:00 -> P5

-- P3 streak for a missed day: how many of the member's previous declared days, newest first,
-- were also "unrealistic" misses, plus this one. An achieved day or a miss for another reason
-- resets it; days not yet settled (pending, passed, report open) stop the count; days without a
-- declaration, rest days and leave aren't study logs of this kind and are skipped.
create function private.unrealistic_streak(p_study_log_id uuid)
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
    where l.user_id = target.user_id and l.date < target.date and l.status <> 'no_declaration'
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

create function public.file_failure_report(p_user_id uuid, p_study_log_id uuid, p_category text, p_text text)
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
    due := private.day_at(log.date, settings.review_deadline);
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

-- Cron: no report by the deadline counts as slacking (P5).
create function public.expire_reports()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  report public.failure_reports;
  penalty public.penalties;
begin
  select * into settings from public.group_settings;
  for report in
    select * from public.failure_reports
    where status = 'awaiting_report' and report_due_at < private.now()
    for update skip locked
  loop
    penalty := private.add_penalty(report.user_id, report.study_log_id, 'not_reported', settings.penalty_slacked);
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

-- Settles an excuse review: approved (0 yen) or rejected / expired (P4).
create function private.resolve_excuse(p_study_log_id uuid, p_approved boolean, p_expired boolean)
returns public.activity_events
language plpgsql
set search_path = ''
as $$
declare
  settings public.group_settings;
  report public.failure_reports;
  penalty public.penalties;
  event public.activity_events;
begin
  select * into settings from public.group_settings;
  select * into report from public.failure_reports where study_log_id = p_study_log_id;
  if not p_approved then
    penalty := private.add_penalty(report.user_id, report.study_log_id,
      case when p_expired then 'excuse_expired' else 'excuse_rejected' end, settings.penalty_excuse_rejected);
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

-- ---------------------------------------------------------------------------
-- cast_review: leave (M4), dispute (M5), excuse (M7)
-- ---------------------------------------------------------------------------

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
  settings public.group_settings;
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
  select * into settings from public.group_settings;
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
      penalty := private.add_penalty(log.user_id, log.id, 'fake_evidence', settings.penalty_fake_evidence);
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

-- Cron: leave (M4) and excuse reviews still open at the deadline are rejected.
create or replace function public.expire_reviews()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.leave_requests;
  report public.failure_reports;
begin
  for request in
    select * from public.leave_requests
    where status = 'under_review' and review_due_at < private.now()
    for update skip locked
  loop
    update public.leave_requests set status = 'rejected', resolved_at = private.now() where id = request.id;
    return query
    insert into public.activity_events (type, actor_id, leave_request_id, payload, dedupe_key)
    values ('leave_rejected', request.user_id, request.id, jsonb_build_object(
      'start_date', request.start_date, 'end_date', request.end_date, 'expired', true),
      'leave_expired:' || request.id)
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;

  for report in
    select * from public.failure_reports
    where status = 'under_review' and review_due_at < private.now()
    for update skip locked
  loop
    return query select * from private.resolve_excuse(report.study_log_id, false, true);
  end loop;
end;
$$;

-- Evening reminders: reviews (leave, dispute, excuse) and reports still owed.
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

    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    select 'reminder_review_due', r.reviewer_id, f.study_log_id,
           jsonb_build_object('subject_type', 'excuse', 'owner_id', f.user_id, 'review_due_at', f.review_due_at),
           'reminder_review_due:excuse:' || f.study_log_id || ':' || r.reviewer_id || ':' || slot
    from public.failure_reports f
    join public.peer_reviews r on r.subject_type = 'excuse' and r.subject_id = f.study_log_id and r.verdict is null
    where f.status = 'under_review' and private.now() < f.review_due_at
      and (f.review_due_at at time zone 'Asia/Tokyo')::date = today
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- tick (M6) now also closes unreported misses.
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
  return query select * from public.close_overdue_logs();
  return query select * from public.confirm_passed_logs();
  return query select * from public.advance_disputes();
  return query select * from public.expire_reports();
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
    'private.unrealistic_streak(uuid)', 'private.resolve_excuse(uuid, boolean, boolean)',
    'public.file_failure_report(uuid, uuid, text, text)', 'public.expire_reports()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
