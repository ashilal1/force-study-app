-- Reminders for the day's declaration at 7:00 and 11:00, and the others an hour before (ADR-047).
--   - The 0:00 "declare today" reminder moves to first_declaration_reminder (7:00): at 0:00 it
--     landed while everyone was asleep and was forgotten by morning. The last call
--     (last_declaration_reminder, 11:00 = an hour before the 12:00 cutoff) stays.
--     The morning one keeps the type reminder_declare_midnight so the code already deployed renders
--     it; its dedupe_key is new (reminder_declare_morning:...), so a day whose 0:00 reminder went
--     out still gets the 7:00 one.
--   - Late payment and makeup keep their 24-hour notice and add one an hour before.

alter table public.group_settings
  add column first_declaration_reminder time not null default '07:00';

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
    continue when private.now() >= cutoff
      or private.now() < private.day_at(today, settings.first_declaration_reminder);

    -- Skipped once the last call is due, so a member never gets both at once.
    if private.now() < private.day_at(today, settings.last_declaration_reminder) then
      return query
      insert into public.activity_events (type, actor_id, payload, dedupe_key)
      select 'reminder_declare_midnight', m,
             jsonb_build_object('cutoff', cutoff, 'previous_open', (private.unfinished_day(m, today)).status),
             'reminder_declare_morning:' || m || ':' || today
      from private.undeclared_members(settings.group_id, today, cutoff) m
      on conflict (dedupe_key) do nothing
      returning *;
    else
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

-- Settings: first_declaration_reminder can be changed, and has to come before the last call.
create or replace function public.update_group_settings(p_admin_id uuid, p_changes jsonb)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text[] := array[
    'declaration_cutoff', 'first_declaration_reminder', 'last_declaration_reminder', 'submit_deadline_max', 'dispute_cutoff', 'resend_cutoff',
    'report_deadline', 'review_deadline', 'rest_days_per_week', 'passing_score', 'max_attempts',
    'judge_grace_minutes', 'flag_window_hours', 'revision_minutes', 'dispute_window_hours', 'resend_minutes',
    'review_hours', 'ai_fallback_minutes',
    'penalty_no_declaration', 'penalty_slacked', 'penalty_unrealistic_streak', 'unrealistic_streak_threshold',
    'penalty_excuse_rejected', 'penalty_unrevised', 'penalty_late_payment', 'penalty_fake_evidence',
    'min_explanation_chars', 'settlement_weekday', 'settlement_time', 'image_retention_days', 'max_members',
    'invite_minutes',
    'slack_streak_threshold', 'makeup_per_streak', 'makeup_per_overdue', 'makeup_hours', 'makeup_enabled'
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
      first_declaration_reminder = coalesce((p_changes->>'first_declaration_reminder')::time, g.first_declaration_reminder),
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
      -- Turning makeup study on counts study days from today (nothing retroactive); off clears it.
      makeup_since = case
        when not p_changes ? 'makeup_enabled' then g.makeup_since
        when (p_changes->>'makeup_enabled')::boolean then coalesce(g.makeup_since, private.jst_today())
      end,
      updated_at = private.now()
    where g.group_id = grp
    returning * into after;
  exception
    when invalid_text_representation or invalid_datetime_format or check_violation or numeric_value_out_of_range then
      raise exception 'invalid_setting' using errcode = 'P0001';
  end;

  if not (after.first_declaration_reminder < after.last_declaration_reminder
          and after.last_declaration_reminder < after.declaration_cutoff
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

-- The 24-hour key stays as it was, so a reminder already sent isn't sent again.
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
  lead interval;
begin
  for settings in select * from public.group_settings loop
    period := private.current_period_end(settings.group_id);
    next_run := private.day_at(period + 7, settings.settlement_time);
    foreach lead in array array[interval '24 hours', interval '1 hour'] loop
      -- Inside the last hour only the 1-hour one is sent, never both at once.
      continue when private.now() < next_run - lead
        or (lead > interval '1 hour' and private.now() >= next_run - interval '1 hour');
      return query
      insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
      select 'reminder_late_payment', s.debtor_id, s.id,
             jsonb_build_object('amount', s.amount_yen, 'payee_id', s.payee_id, 'due_at', next_run,
                                'points', settings.penalty_late_payment),
             'reminder_late_payment:' || s.id || ':' || (period + 7)
               || case when lead = interval '1 hour' then ':1h' else '' end
      from public.settlements s
      join public.profiles p on p.id = s.debtor_id
      where p.group_id = settings.group_id and s.status = 'open'
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;
  end loop;
end;
$$;

-- payload.hours_left tells the notification which one it is (missing = 24, as before).
create or replace function public.due_makeup_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  member record;
  balance record;
  lead interval;
begin
  for member in
    select p.id from public.profiles p
    where p.deactivated_at is null
      and exists (select 1 from public.makeup_debts d where d.user_id = p.id and d.waived is null)
  loop
    select * into balance from private.makeup_balance(member.id, private.now());
    continue when balance.next_due_at is null;
    foreach lead in array array[interval '24 hours', interval '1 hour'] loop
      continue when private.now() not between balance.next_due_at - lead and balance.next_due_at
        or (lead > interval '1 hour' and private.now() >= balance.next_due_at - interval '1 hour');
      return query
      insert into public.activity_events (type, actor_id, payload, dedupe_key)
      values ('reminder_makeup_due', member.id,
              jsonb_build_object('remaining', balance.remaining, 'due_at', balance.next_due_at,
                                 'hours_left', extract(epoch from lead)::int / 3600),
              'reminder_makeup_due:' || member.id || ':' || balance.next_due_at
                || case when lead = interval '1 hour' then ':1h' else '' end)
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;
  end loop;
end;
$$;
