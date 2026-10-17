-- The app keeps working when the AI can't judge (ADR-033). A regular submission that still has
-- no verdict ai_fallback_minutes after it was sent (or when the day's deadline comes) passes
-- provisionally, without a score: the day counts, the next declaration opens, and the members
-- check the photos during the usual 「怪しい」 window instead. A late AI answer doesn't change it.

alter table public.submissions add column unverified_at timestamptz;
comment on column public.submissions.unverified_at is 'Passed without an AI verdict (ADR-033); members check it.';

drop trigger restrict_update on public.submissions;
create trigger restrict_update before update on public.submissions
  for each row execute function private.restrict_update(
    'status', 'reject_reason', 'ai_score', 'ai_passphrase_found', 'ai_feedback', 'ai_model',
    'judge_error', 'judged_at', 'image_paths', 'images_purged_at', 'unverified_at'
  );

alter table public.group_settings
  add column ai_fallback_minutes int not null default 30 check (ai_fallback_minutes between 5 and 240);

-- Cron: provisional passes. One per day (the earliest unjudged attempt), skipped while a rewrite
-- of the declaration is pending (the verdict would be against the old declaration).
create function public.pass_unjudged()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  candidate record;
  log public.study_logs;
begin
  select * into settings from public.group_settings;
  for candidate in
    select distinct on (l.id) l.id as log_id, s.id as submission_id
    from public.study_logs l
    join public.submissions s on s.study_log_id = l.id
    where l.status = 'pending'
      and not (l.revision_due_at is not null and l.revised_at is null)
      and s.kind = 'regular' and s.status in ('judging', 'error')
      and s.submitted_at < l.target_end_time
      and (s.submitted_at + make_interval(mins => settings.ai_fallback_minutes) <= private.now()
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
      dispute_window_ends_at = private.now() + make_interval(hours => settings.dispute_window_hours)
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

-- tick: provisional passes come before the deadline check, so a day with an unjudged
-- submission is never closed as missed.
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
  return query select * from public.run_weekly_settlement();
  return query select * from public.create_weekly_reviews();
  return query select * from public.late_payment_reminders();
end;
$$;

-- Group settings: ai_fallback_minutes joins the whitelist.
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

revoke all on function public.pass_unjudged() from public, anon, authenticated;
grant execute on function public.pass_unjudged() to service_role;
