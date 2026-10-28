-- Asking the members to judge (F5c, ADR-048). When the AI rejected every attempt of a day (or a
-- makeup session) but the member did the work, they can ask the others to judge it instead:
-- once per day, a few times a week (appeals_per_week), with a reason. Everyone else (reviewers_for)
-- has review_hours to answer; all accept -> the day is completed, one reject (with a reason) or
-- not all in time -> it is missed and the reason report follows as usual.
-- While the members decide, the day stays pending but no longer blocks the next declaration
-- (unfinished_day), is not closed at its deadline (close_overdue_logs), and cannot be given up.
-- Additive only: a new table, a new peer_reviews subject type, a new setting and new events. Old
-- code never creates an appeal, so it never meets one.

alter table public.group_settings
  add column appeals_per_week int not null default 2 check (appeals_per_week between 0 and 7);
comment on column public.group_settings.appeals_per_week is 'F5c: how many times a week a member may ask the members to judge (0 = off).';

create table public.judge_appeals (
  study_log_id uuid primary key references public.study_logs (id),
  user_id uuid not null references public.profiles (id),
  -- The rejected submission the member asks about (the last attempt).
  submission_id uuid not null references public.submissions (id),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  status text not null default 'under_review' check (status in ('under_review', 'accepted', 'rejected', 'cancelled')),
  review_due_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check ((status = 'under_review') = (resolved_at is null))
);
comment on table public.judge_appeals is 'F5c: a member asked the others to judge a day the AI rejected. One per study log.';
create index judge_appeals_user_idx on public.judge_appeals (user_id, created_at);
create index judge_appeals_open_idx on public.judge_appeals (review_due_at) where status = 'under_review';

create trigger forbid_delete before delete on public.judge_appeals
  for each row execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.judge_appeals
  for each statement execute function private.forbid_delete();
create trigger restrict_update before update on public.judge_appeals
  for each row execute function private.restrict_update('status', 'resolved_at');

alter table public.judge_appeals enable row level security;
grant select on public.judge_appeals to authenticated;
create policy "members read group rows" on public.judge_appeals for select to authenticated
  using (private.in_my_group(user_id));

alter table public.peer_reviews drop constraint peer_reviews_subject_type_check;
alter table public.peer_reviews add constraint peer_reviews_subject_type_check
  check (subject_type in ('excuse', 'leave', 'dispute', 'appeal'));

-- The open appeal of a study log, if any.
create function private.appeal_open(p_study_log_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.judge_appeals where study_log_id = p_study_log_id and status = 'under_review');
$$;

create function public.appeal_judgement(p_user_id uuid, p_study_log_id uuid, p_reason text)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  latest public.submissions;
  body text := btrim(coalesce(p_reason, ''));
  used int;
  this_week int;
  reviewer_ids uuid[];
  due timestamptz;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);
  select * into log from public.study_logs where id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if log.status <> 'pending' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if private.now() >= log.target_end_time then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.judge_appeals where study_log_id = log.id) then
    raise exception 'already_appealed' using errcode = 'P0001';
  end if;
  if log.revision_due_at is not null and log.revised_at is null then
    raise exception 'revision_pending' using errcode = 'P0001';
  end if;
  select * into latest from public.submissions
  where study_log_id = log.id and kind = 'regular' order by submitted_at desc limit 1;
  if latest.id is null or latest.status <> 'rejected' then
    raise exception 'appeal_not_rejected' using errcode = 'P0001';
  end if;
  select count(*) into used from public.submissions
  where study_log_id = log.id and kind = 'regular' and status <> 'error';
  if used < settings.max_attempts then
    raise exception 'attempts_remaining' using errcode = 'P0001';
  end if;
  if char_length(body) < settings.min_explanation_chars then
    raise exception 'reason_too_short' using errcode = 'P0001';
  end if;
  if char_length(body) > 1000 then
    raise exception 'reason_too_long' using errcode = 'P0001';
  end if;
  -- The week runs Sunday to Saturday (JST), like rest days.
  perform pg_advisory_xact_lock(hashtext('appeal:' || p_user_id));
  select count(*) into this_week from public.judge_appeals
  where user_id = p_user_id
    and (created_at at time zone 'Asia/Tokyo')::date >= private.week_start(private.jst_today());
  if this_week >= settings.appeals_per_week then
    raise exception 'appeal_limit' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(r), '{}') into reviewer_ids from private.reviewers_for(p_user_id) r;
  due := private.now() + make_interval(hours => settings.review_hours);
  insert into public.judge_appeals (study_log_id, user_id, submission_id, reason, review_due_at, created_at)
  values (log.id, p_user_id, latest.id, body, due, private.now());
  insert into public.peer_reviews (subject_type, subject_id, reviewer_id)
  select 'appeal', log.id, unnest(reviewer_ids);

  return query
  insert into public.activity_events (type, actor_id, study_log_id, submission_id, payload)
  values ('appeal_requested', p_user_id, log.id, latest.id, jsonb_build_object(
    'reason', body, 'score', latest.ai_score, 'review_due_at', due, 'reviewer_ids', to_jsonb(reviewer_ids)))
  returning *;

  -- Nobody else to ask (everyone else is on leave): it stands, like an excuse with no reviewers.
  if cardinality(reviewer_ids) = 0 then
    return query select * from private.resolve_appeal(log.id, true, false, null, null);
  end if;
end;
$$;

-- Accepted: the day is completed (no 「怪しい」 window: the members already looked at it).
-- Rejected or expired: the day is missed, and a study day owes its reason (at least six hours to
-- write it, since the review can end after the usual report deadline). A day that is no longer
-- pending (e.g. invalidated by an unrevised 「軽すぎる」 meanwhile) just closes the appeal.
create function private.resolve_appeal(
  p_study_log_id uuid, p_accepted boolean, p_expired boolean, p_by uuid, p_comment text
)
returns setof public.activity_events
language plpgsql
set search_path = ''
as $$
declare
  appeal public.judge_appeals;
  log public.study_logs;
  due timestamptz;
begin
  select * into appeal from public.judge_appeals where study_log_id = p_study_log_id for update;
  if appeal.status <> 'under_review' then
    return;
  end if;
  select * into log from public.study_logs where id = p_study_log_id for update;
  if log.status <> 'pending' then
    update public.judge_appeals set status = 'cancelled', resolved_at = private.now() where study_log_id = log.id;
    return;
  end if;

  update public.judge_appeals
  set status = case when p_accepted then 'accepted' else 'rejected' end, resolved_at = private.now()
  where study_log_id = log.id;

  if p_accepted then
    update public.study_logs
    set status = 'completed', passed_at = private.now(), dispute_window_ends_at = private.now(), completed_at = private.now()
    where id = log.id;
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('appeal_accepted', log.user_id, log.id, '{}'::jsonb, 'appeal_resolved:' || log.id)
    on conflict (dedupe_key) do nothing
    returning *;
    return;
  end if;

  update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
  update public.submissions set judge_error = 'cancelled: appeal rejected'
  where study_log_id = log.id and status = 'error';
  if not log.is_makeup then
    due := greatest(private.report_due_for(log.user_id, log.date), private.now() + interval '6 hours');
    insert into public.failure_reports (study_log_id, user_id, report_due_at)
    values (log.id, log.user_id, due)
    on conflict (study_log_id) do nothing;
  end if;
  return query
  insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
  values ('appeal_rejected', log.user_id, log.id, jsonb_build_object(
    'expired', p_expired, 'rejected_by', p_by, 'comment', p_comment, 'report_due_at', due),
    'appeal_resolved:' || log.id)
  on conflict (dedupe_key) do nothing
  returning *;
end;
$$;

-- Not every reviewer accepted in time: rejected (tick).
create function public.expire_appeals()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  appeal public.judge_appeals;
begin
  for appeal in
    select * from public.judge_appeals
    where status = 'under_review' and review_due_at < private.now()
    for update skip locked
  loop
    return query select * from private.resolve_appeal(appeal.study_log_id, false, true, null, null);
  end loop;
end;
$$;

-- Three hours and one hour before an appeal's review closes, to whoever has not answered (tick).
create function public.due_appeal_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead interval;
begin
  foreach lead in array array[interval '3 hours', interval '1 hour'] loop
    return query
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    select 'reminder_review_due', r.reviewer_id, a.study_log_id,
           jsonb_build_object('subject_type', 'appeal', 'owner_id', a.user_id, 'review_due_at', a.review_due_at),
           'reminder_review_due:appeal:' || a.study_log_id || ':' || r.reviewer_id || ':' || extract(epoch from lead)::int
    from public.judge_appeals a
    join public.peer_reviews r on r.subject_type = 'appeal' and r.subject_id = a.study_log_id and r.verdict is null
    join public.profiles p on p.id = r.reviewer_id and p.deactivated_at is null
    where a.status = 'under_review' and private.now() between a.review_due_at - lead and a.review_due_at
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The rest of the day's rules know about an open appeal
-- ---------------------------------------------------------------------------

-- An appealed day no longer blocks the next declaration: the member has done what they could.
create or replace function private.unfinished_day(p_user_id uuid, p_before date)
returns public.study_logs
language sql
stable
set search_path = ''
as $$
  select l.* from public.study_logs l
  left join public.failure_reports r on r.study_log_id = l.id
  where l.user_id = p_user_id and l.date < p_before and not l.is_makeup
    and ((l.status = 'pending' and not private.appeal_open(l.id))
         or (l.status = 'missed' and r.status = 'awaiting_report'))
  order by l.date desc
  limit 1;
$$;

-- 「できなかった」 waits while the members are judging the day.
create or replace function public.give_up_day(p_user_id uuid, p_study_log_id uuid)
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
  if private.appeal_open(log.id) then
    raise exception 'appeal_open' using errcode = 'P0001';
  end if;

  update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
  update public.submissions set judge_error = 'cancelled: gave up'
  where study_log_id = log.id and status = 'error';

  if log.is_makeup then
    insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
    values ('makeup_failed', log.user_id, log.id, jsonb_build_object('cause', 'gave_up'), 'makeup_failed:' || log.id)
    on conflict (dedupe_key) do nothing
    returning * into event;
    return event;
  end if;

  due := private.report_due_for(log.user_id, log.date);
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

-- The deadline does not close a day the members are judging; resolve_appeal does.
create or replace function public.close_overdue_logs()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  log public.study_logs;
  due timestamptz;
begin
  for log in
    select l.* from public.study_logs l
    join public.profiles p on p.id = l.user_id
    join public.group_settings g on g.group_id = p.group_id
    where l.status = 'pending' and l.target_end_time <= private.now()
      and not exists (
        select 1 from public.submissions s
        where s.study_log_id = l.id and s.kind = 'regular' and s.status in ('judging', 'error')
          and s.submitted_at < l.target_end_time
          and private.now() < l.target_end_time + make_interval(mins => g.judge_grace_minutes)
      )
      and not private.appeal_open(l.id)
    for update of l skip locked
  loop
    update public.study_logs set status = 'missed', missed_at = private.now() where id = log.id;
    if log.is_makeup then
      return query
      insert into public.activity_events (type, actor_id, study_log_id, payload, dedupe_key)
      values ('makeup_failed', log.user_id, log.id, jsonb_build_object('cause', 'deadline'), 'makeup_failed:' || log.id)
      on conflict (dedupe_key) do nothing
      returning *;
      continue;
    end if;
    due := private.report_due_for(log.user_id, log.date);
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

-- Reviews of an appeal: like the final review of a dispute, a reject must say why; one reject
-- rejects, everyone accepting accepts.
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
  review public.peer_reviews;
  request public.leave_requests;
  dispute public.submission_disputes;
  report public.failure_reports;
  appeal public.judge_appeals;
  log public.study_logs;
  penalty public.penalties;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  accepted int;
  total int;
  owner uuid;
begin
  perform private.require_member(p_reviewer_id);
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
  elsif p_subject_type = 'appeal' then
    select * into appeal from public.judge_appeals where study_log_id = p_subject_id for update;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
    owner := appeal.user_id;
    if p_verdict = 'reject' and v_comment is null then
      raise exception 'comment_required' using errcode = 'P0001';
    end if;
  else
    raise exception 'not_supported' using errcode = 'P0001';
  end if;

  -- Reviewers were fixed from the owner's group when the review opened (reviewers_for).
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
     or (p_subject_type = 'excuse' and (report.status <> 'under_review' or private.now() > report.review_due_at))
     or (p_subject_type = 'appeal' and (appeal.status <> 'under_review' or private.now() > appeal.review_due_at)) then
    raise exception 'review_closed' using errcode = 'P0001';
  end if;

  update public.peer_reviews set verdict = p_verdict, comment = v_comment, decided_at = private.now() where id = review.id;

  select t.accepted, t.total into accepted, total from private.review_tally(p_subject_type, p_subject_id) t;

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
      penalty := private.add_penalty(log.user_id, log.id, 'fake_evidence', (private.settings_of(log.user_id)).penalty_fake_evidence);
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
  elsif p_subject_type = 'appeal' then
    if p_verdict = 'reject' then
      return query select * from private.resolve_appeal(appeal.study_log_id, false, false, p_reviewer_id, v_comment);
    elsif accepted = total then
      return query select * from private.resolve_appeal(appeal.study_log_id, true, false, null, null);
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

-- Leaving or being removed closes one's own open appeal (the day is closed without a penalty),
-- and a reviewer who leaves no longer holds up an appeal everyone else accepted.
create or replace function private.end_membership(p_member_id uuid, p_reason text, p_by uuid)
returns setof public.activity_events
language plpgsql
set search_path = ''
as $$
declare
  member public.profiles;
  payer uuid;
  subject record;
  tally record;
  admins uuid[];
begin
  update public.profiles
  set deactivated_at = private.now(), left_reason = p_reason, removed_by = p_by, is_admin = false
  where id = p_member_id and deactivated_at is null
  returning * into member;
  if member.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  update public.judge_appeals set status = 'cancelled', resolved_at = private.now()
  where user_id = p_member_id and status = 'under_review';
  update public.study_logs set status = 'missed', missed_at = private.now()
  where user_id = p_member_id and status = 'pending';
  update public.failure_reports set status = 'resolved', category = 'not_reported', outcome = 'no_penalty', resolved_at = private.now()
  where user_id = p_member_id and status = 'awaiting_report';

  select coalesce(array_agg(id), '{}') into admins
  from public.profiles where group_id = member.group_id and is_admin and deactivated_at is null;
  for payer in
    update public.profiles set payee_id = null
    where payee_id = p_member_id and deactivated_at is null
    returning id
  loop
    return query
    insert into public.activity_events (type, actor_id, group_id, payload)
    values ('payee_cleared', payer, member.group_id, jsonb_build_object('former_payee_id', p_member_id, 'admin_ids', to_jsonb(admins)))
    returning *;
  end loop;

  return query
  insert into public.activity_events (type, actor_id, group_id, payload)
  values (case when p_reason = 'left' then 'member_left' else 'member_removed' end, p_member_id, member.group_id,
          jsonb_build_object('removed_by', p_by))
  returning *;

  -- Reviews they still owed: decide now if everyone left has accepted.
  for subject in
    select distinct r.subject_type, r.subject_id from public.peer_reviews r
    where r.reviewer_id = p_member_id and r.verdict is null
  loop
    select * into tally from private.review_tally(subject.subject_type, subject.subject_id);
    continue when tally.accepted < tally.total;
    if subject.subject_type = 'leave' then
      return query
      with approved as (
        update public.leave_requests set status = 'approved', approved_at = private.now(), resolved_at = private.now()
        where id = subject.subject_id and status = 'under_review'
        returning *
      )
      insert into public.activity_events (type, actor_id, leave_request_id, payload)
      select 'leave_approved', approved.user_id, approved.id,
             jsonb_build_object('start_date', approved.start_date, 'end_date', approved.end_date)
      from approved
      returning *;
    elsif subject.subject_type = 'dispute' then
      if exists (select 1 from public.submission_disputes where study_log_id = subject.subject_id and status = 'final_review') then
        return query select * from private.uphold_dispute(subject.subject_id, false);
      end if;
    elsif subject.subject_type = 'appeal' then
      return query select * from private.resolve_appeal(subject.subject_id, true, false, null, null);
    elsif exists (select 1 from public.failure_reports where study_log_id = subject.subject_id and status = 'under_review') then
      return query select * from private.resolve_excuse(subject.subject_id, true, false);
    end if;
  end loop;
end;
$$;

-- appeals_per_week joins the settings an admin can change.
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
    'slack_streak_threshold', 'makeup_per_streak', 'makeup_per_overdue', 'makeup_hours', 'makeup_enabled',
    'appeals_per_week'
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
      appeals_per_week = coalesce((p_changes->>'appeals_per_week')::int, g.appeals_per_week),
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

-- Appeals expire before the reason reports' deadlines are checked, and get their reminders.
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
  return query select * from public.expire_appeals();
  return query select * from public.due_appeal_reminders();
  return query select * from public.due_deadline_reminders();
  return query select * from public.trial_ending_reminders();
  return query select * from public.award_makeups();
  return query select * from public.run_weekly_settlement();
  return query select * from public.close_makeup_week();
  return query select * from public.create_weekly_reviews();
  return query select * from public.late_payment_reminders();
  return query select * from public.due_makeup_reminders();
end;
$$;


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.appeal_open(uuid)', 'private.resolve_appeal(uuid, boolean, boolean, uuid, text)',
    'public.appeal_judgement(uuid, uuid, text)', 'public.expire_appeals()', 'public.due_appeal_reminders()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
