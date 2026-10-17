-- M5a: submissions and AI judgement (requirements F4b, F5). Passing = score >= passing_score
-- and the passphrase found in a photo; the server decides, never the model.
-- Disputes (「怪しい」) come in a later migration.

-- Storage paths are "{user_id}/{date}/{uuid}.webp" (thumbnail: "{uuid}_thumb.webp").
create function private.is_evidence_path(p_path text, p_user_id uuid, p_date date, p_thumb boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path ~ ('^' || p_user_id::text || '/' || to_char(p_date, 'YYYY-MM-DD')
                   || '/[0-9a-f-]{36}' || case when p_thumb then '_thumb' else '' end || '\.webp$');
$$;

-- A regular submission for today's declaration. The deadline is checked against the submission
-- time (ADR-007): judging may finish later. Gemini errors don't use up an attempt.
create function public.create_submission(
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
  if log.status <> 'pending' or log.date <> private.jst_today() then
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

-- The AI's verdict for a submission that is judging (or failed to judge before).
create function public.record_judgement(
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
  -- Judge against the rewritten declaration (F3b): wait while a rewrite is pending.
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

  select settings.max_attempts - count(*) into attempts_left
  from public.submissions where study_log_id = log.id and kind = 'regular' and status <> 'error';

  if passed and sub.kind = 'regular' and log.status = 'pending' then
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

-- Gemini failed (rate limit, outage, bad response). The attempt isn't used; it can be judged again.
create function public.record_judge_error(p_submission_id uuid, p_message text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.submissions
  set status = 'error', judge_error = left(coalesce(p_message, 'unknown'), 500)
  where id = p_submission_id and status in ('judging', 'error');
$$;

-- expire_revisions (M4) now also cancels submissions still waiting for a verdict on the day
-- that became "no declaration" (they stay as errors and can't be judged: the log is closed).
create or replace function public.expire_revisions()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  penalty public.penalties;
begin
  select * into settings from public.group_settings;

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
    penalty := private.add_penalty(log.user_id, log.id, 'unrevised', settings.penalty_unrevised);
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

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.is_evidence_path(text, uuid, date, boolean)',
    'public.create_submission(uuid, uuid, text[], text, text, text, int)',
    'public.record_judgement(uuid, int, boolean, text, text)',
    'public.record_judge_error(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
