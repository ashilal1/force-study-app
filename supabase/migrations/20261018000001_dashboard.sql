-- M8a: dashboard ranking (trial members see "本番なら") and group settings for admins (F10, F11).

-- penalty_summary gains this week's trial points (appended column; the rest is unchanged).
create or replace view public.penalty_summary
with (security_invoker = true) as
select
  p.id as user_id,
  p.display_name,
  coalesce(sum(x.points) filter (where x.waived is null), 0)::int as total_points,
  coalesce(sum(x.points) filter (where x.waived is null and x.settlement_id is null), 0)::int as unsettled_points,
  -- This week = since Sunday (JST), like the settlement period.
  coalesce(sum(x.points) filter (
    where x.waived is null
      and (x.created_at at time zone 'Asia/Tokyo')::date
          >= (now() at time zone 'Asia/Tokyo')::date - extract(dow from (now() at time zone 'Asia/Tokyo'))::int
  ), 0)::int as this_week_points,
  coalesce(sum(x.points) filter (where x.waived = 'trial'), 0)::int as trial_points,
  (select s.id from public.settlements s
   where s.debtor_id = p.id and s.status <> 'completed'
   order by s.period_end desc limit 1) as open_settlement_id,
  coalesce(sum(x.points) filter (
    where x.waived = 'trial'
      and (x.created_at at time zone 'Asia/Tokyo')::date
          >= (now() at time zone 'Asia/Tokyo')::date - extract(dow from (now() at time zone 'Asia/Tokyo'))::int
  ), 0)::int as this_week_trial_points
from public.profiles p
left join public.penalties x on x.user_id = p.id
where p.deactivated_at is null
group by p.id, p.display_name;

-- Admins change group settings (F11). Only the listed keys; each value is checked by the table's
-- own constraints. Unlisted or malformed input raises; nothing is half-applied.
create function public.update_group_settings(p_admin_id uuid, p_changes jsonb)
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

  -- Keep the day's order sane: reminder before the cutoff, deadlines in their sequence.
  if not (after.last_declaration_reminder < after.declaration_cutoff
          and after.declaration_cutoff < after.submit_deadline_max
          and after.submit_deadline_max <= after.dispute_cutoff
          and after.dispute_cutoff <= after.resend_cutoff
          and after.resend_cutoff <= after.review_deadline
          and after.report_deadline <= after.review_deadline) then
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

revoke all on function public.update_group_settings(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.update_group_settings(uuid, jsonb) to service_role;
