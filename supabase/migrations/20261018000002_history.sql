-- M8b: views behind the retrospective screens (requirements F12, docs/database.md §2 views).
-- All are security_invoker, so members read them through the RLS of the underlying tables.
-- "Today" comes from private.jst_today() (the rules' clock, ADR-029), which members may call.

grant execute on function private.now() to authenticated;
grant execute on function private.jst_today() to authenticated;

-- One row per member per day, from the day they joined to today (JST).
-- kind: completed / missed / no_declaration / invalidated / pending (today or awaiting
-- confirmation) / rest / leave / none (no record: before the scheduler, or joined after the cutoff)
create view public.daily_history
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
left join public.study_logs l on l.user_id = days.user_id and l.date = days.date
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

-- One row per member per week (Sunday-Saturday, keyed by the Saturday). The achievement rate
-- counts days that had to be studied: completed / (completed + missed + invalidated + no declaration).
create view public.weekly_stats
with (security_invoker = true) as
select
  user_id,
  (date + (6 - extract(dow from date)::int))::date as week_end,
  count(*) filter (where kind in ('completed', 'missed', 'invalidated', 'no_declaration'))::int as counted_days,
  count(*) filter (where kind = 'completed')::int as completed_days,
  round(100.0 * count(*) filter (where kind = 'completed')
        / nullif(count(*) filter (where kind in ('completed', 'missed', 'invalidated', 'no_declaration')), 0))::int
    as achievement_rate,
  round(avg(final_score))::int as avg_score,
  round(avg(elapsed_minutes) filter (where kind = 'completed'))::int as avg_elapsed_minutes,
  sum(penalty_points)::int as penalty_points,
  sum(trial_points)::int as trial_points
from public.daily_history
group by 1, 2;

-- Everything a member was challenged on, in one shape (G9): 軽すぎる, 怪しい, 納得できない
-- (excuse), 却下 (final review), 休会の却下, and AI rejections.
create view public.received_objections
with (security_invoker = true) as
select l.user_id, f.created_at as occurred_at, 'too_light'::text as kind, f.flagger_id as by_user_id,
       f.comment as reason, l.id as study_log_id
from public.declaration_flags f join public.study_logs l on l.id = f.study_log_id
union all
select l.user_id, f.created_at, 'suspicious', f.flagger_id, f.comment, l.id
from public.submission_flags f join public.study_logs l on l.id = f.study_log_id
union all
select r.user_id, v.decided_at, 'excuse_rejected', v.reviewer_id, v.comment, r.study_log_id
from public.peer_reviews v join public.failure_reports r on v.subject_type = 'excuse' and r.study_log_id = v.subject_id
where v.verdict = 'reject'
union all
select l.user_id, v.decided_at, 'dispute_rejected', v.reviewer_id, v.comment, l.id
from public.peer_reviews v join public.study_logs l on v.subject_type = 'dispute' and l.id = v.subject_id
where v.verdict = 'reject'
union all
select q.user_id, v.decided_at, 'leave_rejected', v.reviewer_id, v.comment, null::uuid
from public.peer_reviews v join public.leave_requests q on v.subject_type = 'leave' and q.id = v.subject_id
where v.verdict = 'reject'
union all
select s.user_id, s.judged_at, 'ai_rejected', null::uuid, s.ai_feedback, s.study_log_id
from public.submissions s
where s.status = 'rejected';

grant select on public.daily_history, public.weekly_stats, public.received_objections to authenticated;
