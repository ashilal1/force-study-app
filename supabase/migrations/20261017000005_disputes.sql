-- M5b: 「怪しい」 on a passed submission (requirements F5b, ADR-016).
-- passed --(怪しい)--> dispute resending (1 hour, by 23:00) --(all flags withdrawn)--> upheld
--                                             \--(not all withdrawn)--> final_review (by 23:59)
-- final_review: one reasoned reject -> invalidated (P8); all accept, or no reject by the
-- deadline -> upheld. Upheld disputes complete the day.

-- ---------------------------------------------------------------------------
-- Flag, resend, withdraw
-- ---------------------------------------------------------------------------

create function public.flag_submission(p_flagger_id uuid, p_study_log_id uuid, p_comment text)
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
    values (log.id, 'resending', private.now(), least(
      private.now() + make_interval(mins => settings.resend_minutes),
      private.day_at(log.date, settings.resend_cutoff)
    ))
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

-- The owner sends more evidence while the dispute is open; any number of times. The AI checks it
-- (record_judgement with kind 'resend') and the flaggers are told the result.
create function public.resend_evidence(
  p_user_id uuid,
  p_study_log_id uuid,
  p_image_paths text[],
  p_thumb_path text,
  p_explanation text
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
  dispute public.submission_disputes;
  created public.submissions;
  path text;
begin
  perform private.require_member(p_user_id);
  select * into log from public.study_logs where id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into dispute from public.submission_disputes where study_log_id = log.id;
  if not found or dispute.status <> 'resending' or private.now() >= dispute.resend_due_at then
    raise exception 'resend_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.submissions where study_log_id = log.id and status = 'judging') then
    raise exception 'judging_in_progress' using errcode = 'P0001';
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
  if char_length(btrim(coalesce(p_explanation, ''))) not between 1 and 1000 then
    raise exception 'invalid_explanation' using errcode = 'P0001';
  end if;

  insert into public.submissions (study_log_id, user_id, kind, image_paths, thumb_path, explanation, status, elapsed_minutes, submitted_at)
  values (log.id, p_user_id, 'resend', p_image_paths, p_thumb_path, btrim(p_explanation), 'judging',
          floor(extract(epoch from private.now() - log.declared_at) / 60)::int, private.now())
  returning * into created;
  return created;
end;
$$;

-- Closes a dispute in the owner's favour: the day is achieved.
create function private.uphold_dispute(p_study_log_id uuid, p_expired boolean)
returns public.activity_events
language plpgsql
set search_path = ''
as $$
declare
  owner uuid;
  event public.activity_events;
begin
  select user_id into owner from public.study_logs where id = p_study_log_id;
  update public.submission_disputes set status = 'upheld', resolved_at = private.now() where study_log_id = p_study_log_id;
  update public.study_logs set status = 'completed', completed_at = private.now()
  where id = p_study_log_id and status = 'passed';
  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  values ('dispute_upheld', owner, p_study_log_id, jsonb_build_object('expired', p_expired),
          'dispute_resolved:' || p_study_log_id)
  on conflict (dedupe_key) do nothing
  returning * into event;
  return event;
end;
$$;

create function public.withdraw_flag(p_flagger_id uuid, p_study_log_id uuid)
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
-- Resent evidence: record_judgement now tells the flaggers what the AI saw
-- ---------------------------------------------------------------------------

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
      dispute_window_ends_at = least(
        private.now() + make_interval(hours => settings.dispute_window_hours),
        private.day_at(log.date, settings.dispute_cutoff)
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
-- Cron (M6 schedules it; idempotent): resend window over -> final review; review over -> upheld
-- ---------------------------------------------------------------------------

create function public.advance_disputes()
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
    and private.now() between d.resend_due_at - interval '15 minutes' and d.resend_due_at
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
    set status = 'final_review', review_due_at = private.day_at(log.date, settings.review_deadline)
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

  -- No reasoned reject by the deadline: not rejected, so the day stands (ADR-016).
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
-- cast_review: leave (M4) + dispute final review
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
     or (p_subject_type = 'dispute' and (dispute.status <> 'final_review' or private.now() > dispute.review_due_at)) then
    raise exception 'review_closed' using errcode = 'P0001';
  end if;

  update public.peer_reviews set verdict = p_verdict, comment = v_comment, decided_at = private.now() where id = review.id;

  select count(*) filter (where verdict = 'accept'), count(*) into accepted, total
  from public.peer_reviews where subject_type = p_subject_type and subject_id = p_subject_id;

  return query
  insert into public.activity_events (type, actor_id, leave_request_id, study_log_id, payload)
  values ('review_vote_cast', p_reviewer_id,
          case when p_subject_type = 'leave' then p_subject_id end,
          case when p_subject_type = 'dispute' then p_subject_id end,
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
  else
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
  end if;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.flag_submission(uuid, uuid, text)',
    'public.resend_evidence(uuid, uuid, text[], text, text)',
    'private.uphold_dispute(uuid, boolean)',
    'public.withdraw_flag(uuid, uuid)',
    'public.advance_disputes()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
