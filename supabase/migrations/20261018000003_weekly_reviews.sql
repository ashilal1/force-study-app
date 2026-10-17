-- M8c: weekly reviews (requirements F12). At the settlement (Saturday 23:59, after the day has
-- closed) each member gets a review of the week with its numbers; the tick route then asks
-- Gemini for a summary, and the member can add a note.

create function public.create_weekly_reviews()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  period date := private.current_period_end();
  member record;
  created public.weekly_reviews;
begin
  -- Only weeks the group actually played (same rule as the weekly summary).
  if not exists (select 1 from public.study_logs where date between period - 6 and period) then
    return;
  end if;

  for member in
    select p.id from public.profiles p
    where p.deactivated_at is null and (p.created_at at time zone 'Asia/Tokyo')::date <= period
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
end;
$$;

-- The tick fills summaries that are still missing (a failed Gemini call is retried next tick).
create function public.record_weekly_summary(p_user_id uuid, p_week_end date, p_summary text, p_model text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.weekly_reviews
  set ai_summary = left(btrim(p_summary), 4000), ai_model = p_model
  where user_id = p_user_id and week_end = p_week_end and ai_summary is null;
$$;

-- The one thing a member may keep editing: their own note on the week.
create function public.save_weekly_note(p_user_id uuid, p_week_end date, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_member(p_user_id);
  if char_length(coalesce(p_note, '')) > 4000 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;
  update public.weekly_reviews
  set self_note = nullif(btrim(p_note), ''), self_note_updated_at = private.now()
  where user_id = p_user_id and week_end = p_week_end;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- tick: the weekly reviews come right after the settlement.
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
  return query select * from public.run_weekly_settlement();
  return query select * from public.create_weekly_reviews();
  return query select * from public.late_payment_reminders();
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.create_weekly_reviews()', 'public.record_weekly_summary(uuid, date, text, text)',
    'public.save_weekly_note(uuid, date, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
