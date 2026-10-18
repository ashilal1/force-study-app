-- Leaving a group, and joining again (ADR-035). A profile is now one membership: a person who
-- leaves (or is removed by an admin) keeps their old profile and its records in the old group,
-- and joining or creating a group later makes a new profile with a new id. So every record stays
-- with the group it happened in. The signed-in account is profiles.auth_user_id; at most one
-- active membership per account.

-- ---------------------------------------------------------------------------
-- Memberships
-- ---------------------------------------------------------------------------

alter table public.profiles add column auth_user_id uuid references auth.users (id);
update public.profiles set auth_user_id = id;
alter table public.profiles alter column auth_user_id set not null;
alter table public.profiles drop constraint profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
create unique index profiles_one_active_membership on public.profiles (auth_user_id) where deactivated_at is null;

alter table public.profiles
  add column left_reason text check (left_reason in ('left', 'removed')),
  add column removed_by uuid references public.profiles (id),
  add constraint profiles_left_reason check ((deactivated_at is null) = (left_reason is null));

-- The signed-in account's active membership (profile id), for RLS.
create function private.my_member()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.profiles where auth_user_id = (select auth.uid()) and deactivated_at is null;
$$;

create or replace function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_member() is not null;
$$;

create or replace function private.my_group()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.profiles where auth_user_id = (select auth.uid()) and deactivated_at is null;
$$;

-- The trial week is for a first membership only (leaving and joining again doesn't restart it).
create function private.trial_for(p_auth_user_id uuid)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.profiles where auth_user_id = p_auth_user_id) then private.now()
    else private.trial_end_for(private.now())
  end;
$$;

-- Own rows: the active membership instead of the account id.
drop policy "members update own profile" on public.profiles;
create policy "members update own profile" on public.profiles
  for update to authenticated
  using (id = (select private.my_member()))
  with check (id = (select private.my_member()));

drop policy "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications
  for select to authenticated
  using (recipient_id = (select private.my_member()));
drop policy "mark own notifications read" on public.notifications;
create policy "mark own notifications read" on public.notifications
  for update to authenticated
  using (recipient_id = (select private.my_member()))
  with check (recipient_id = (select private.my_member()));

drop policy "read own push subscriptions" on public.push_subscriptions;
create policy "read own push subscriptions" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select private.my_member()));

-- Evidence goes into the membership's folder (is_evidence_path checks the same id).
drop policy "members upload own evidence" on storage.objects;
create policy "members upload own evidence" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-evidence'
    and (storage.foldername(name))[1] = (select private.my_member())::text
  );

-- Former members get no penalties (an admin may remove someone with a day still open).
create or replace function private.add_penalty(p_user_id uuid, p_study_log_id uuid, p_reason text, p_points int)
returns public.penalties
language plpgsql
set search_path = ''
as $$
declare
  added public.penalties;
  day_start timestamptz;
begin
  if p_points <= 0 or not exists (select 1 from public.profiles where id = p_user_id and deactivated_at is null) then
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

-- Votes: reviewers who left without voting no longer count.
create function private.review_tally(p_subject_type text, p_subject_id uuid)
returns table (accepted int, total int)
language sql
stable
set search_path = ''
as $$
  select count(*) filter (where r.verdict = 'accept')::int, count(*)::int
  from public.peer_reviews r
  join public.profiles p on p.id = r.reviewer_id
  where r.subject_type = p_subject_type and r.subject_id = p_subject_id
    and (r.verdict is not null or p.deactivated_at is null);
$$;

-- ---------------------------------------------------------------------------
-- Functions that knew the account id as the profile id, and the vote count
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
     or (p_subject_type = 'excuse' and (report.status <> 'under_review' or private.now() > report.review_due_at)) then
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
  else
    if p_verdict = 'reject' then
      return query select * from private.resolve_excuse(report.study_log_id, false, false);
    elsif accepted = total then
      return query select * from private.resolve_excuse(report.study_log_id, true, false);
    end if;
  end if;
end;
$$;

create or replace function public.join_group(
  p_user_id uuid,
  p_display_name text,
  p_avatar_url text,
  p_invite_hash text,
  p_bootstrap boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.app_limits;
  joined public.profiles;
  invite public.invites;
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));
  select * into limits from public.app_limits;

  -- p_user_id is the signed-in account (auth.users); an active membership is returned as is.
  select * into joined from public.profiles where auth_user_id = p_user_id and deactivated_at is null;
  if found then
    return joined;
  end if;

  if p_bootstrap then
    if exists (select 1 from public.groups) then
      raise exception 'bootstrap_closed' using errcode = 'P0001';
    end if;
    return public.create_group(p_user_id, p_display_name, p_avatar_url, 'Commit or Treat');
  end if;

  -- Wrong, expired and already-used codes all look the same to the caller on purpose.
  select * into invite from public.invites
  where code_hash = p_invite_hash and used_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  if private.group_member_count(invite.group_id) >= (private.group_settings_for(invite.group_id)).max_members then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  if private.active_member_count() >= limits.max_total_members then
    raise exception 'app_full' using errcode = 'P0001';
  end if;

  insert into public.profiles (auth_user_id, display_name, avatar_url, is_admin, trial_ends_at, group_id)
  values (p_user_id, btrim(p_display_name), p_avatar_url, false, private.trial_for(p_user_id), invite.group_id)
  returning * into joined;

  update public.invites set used_by = joined.id, used_at = now() where id = invite.id;

  insert into public.activity_events (type, actor_id, payload)
  values ('member_joined', joined.id, jsonb_build_object('invited_by', invite.created_by));

  return joined;
end;
$$;

create or replace function public.create_group(p_user_id uuid, p_display_name text, p_avatar_url text, p_group_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits public.app_limits;
  created public.groups;
  joined public.profiles;
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));
  select * into limits from public.app_limits;

  if exists (select 1 from public.profiles where auth_user_id = p_user_id and deactivated_at is null) then
    raise exception 'already_in_group' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_group_name, ''))) not between 1 and 40 then
    raise exception 'invalid_group_name' using errcode = 'P0001';
  end if;
  if (select count(*) from public.groups) >= limits.max_groups then
    raise exception 'app_full' using errcode = 'P0001';
  end if;
  if private.active_member_count() >= limits.max_total_members then
    raise exception 'app_full' using errcode = 'P0001';
  end if;

  insert into public.groups (name, created_by) values (btrim(p_group_name), p_user_id) returning * into created;
  insert into public.group_settings (group_id) values (created.id);

  insert into public.profiles (auth_user_id, display_name, avatar_url, is_admin, trial_ends_at, group_id)
  values (p_user_id, btrim(p_display_name), p_avatar_url, true, private.trial_for(p_user_id), created.id)
  returning * into joined;

  insert into public.activity_events (type, actor_id, payload)
  values ('group_created', joined.id, jsonb_build_object('name', created.name));
  return joined;
end;
$$;

create or replace function public.run_weekly_settlement()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  period date;
  late public.settlements;
  member record;
  created public.settlements;
  admins uuid[];
begin
  for settings in select * from public.group_settings loop
    period := private.current_period_end(settings.group_id);

    -- P7 first, so it goes into this settlement: anything still 'open' from an earlier week.
    for late in
      select s.* from public.settlements s join public.profiles p on p.id = s.debtor_id
      where p.group_id = settings.group_id and p.deactivated_at is null and s.status = 'open' and s.period_end < period
    loop
      return query
      with added as (
        insert into public.penalties (user_id, late_settlement_id, dedupe_key, points, reason, waived)
        select late.debtor_id, late.id, 'late:' || late.id || ':' || period, settings.penalty_late_payment, 'late_payment',
               case when p.trial_ends_at > private.now() then 'trial' end
        from public.profiles p where p.id = late.debtor_id and settings.penalty_late_payment > 0
        on conflict (dedupe_key) do nothing
        returning *
      )
      insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
      select 'late_payment', added.user_id, late.id,
             jsonb_build_object('points', added.points, 'waived', added.waived, 'period_end', period),
             'late_payment:' || late.id || ':' || period
      from added
      on conflict (dedupe_key) do nothing
      returning *;
    end loop;

    -- Bundle each member's unsettled penalties up to the period end (by study day; P7 by creation).
    select coalesce(array_agg(id), '{}') into admins
    from public.profiles where group_id = settings.group_id and is_admin and deactivated_at is null;
    for member in
      select p.id, p.payee_id, sum(x.points)::int as amount
      from public.profiles p
      join public.penalties x on x.user_id = p.id and x.settlement_id is null and x.waived is null
      left join public.study_logs l on l.id = x.study_log_id
      where p.group_id = settings.group_id and p.deactivated_at is null
        and (l.date <= period or (x.study_log_id is null and x.created_at <= private.now()))
      group by p.id, p.payee_id
    loop
      if member.payee_id is null then
        return query
        insert into public.activity_events (type, actor_id, payload, dedupe_key)
        values ('payee_missing', member.id, jsonb_build_object('admin_ids', to_jsonb(admins), 'period_end', period),
                'payee_missing:' || member.id || ':' || period)
        on conflict (dedupe_key) do nothing
        returning *;
        continue;
      end if;

      insert into public.settlements (debtor_id, payee_id, period_end, amount_yen)
      values (member.id, member.payee_id, period, member.amount)
      on conflict (debtor_id, period_end) do nothing
      returning * into created;
      continue when created.id is null;

      update public.penalties x set settlement_id = created.id
      where x.user_id = member.id and x.settlement_id is null and x.waived is null
        and (
          (x.study_log_id is null and x.created_at <= private.now())
          or exists (select 1 from public.study_logs l where l.id = x.study_log_id and l.date <= period)
        );

      return query
      insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
      values ('settlement_created', member.id, created.id,
              jsonb_build_object('payee_id', created.payee_id, 'amount', created.amount_yen, 'period_end', period),
              'settlement_created:' || created.id)
      on conflict (dedupe_key) do nothing
      returning *;
      created := null;
    end loop;

    -- The week's results for the group (once per period), for weeks the group actually played.
    continue when not exists (
      select 1 from public.study_logs l join public.profiles p on p.id = l.user_id
      where p.group_id = settings.group_id and l.date between period - 6 and period
    );
    return query
    insert into public.activity_events (type, group_id, payload, dedupe_key)
    select 'weekly_summary', settings.group_id, jsonb_build_object('period_end', period, 'ranking', coalesce(jsonb_agg(
             jsonb_build_object('user_id', s.debtor_id, 'amount', s.amount_yen) order by s.amount_yen desc), '[]')),
           'weekly_summary:' || settings.group_id || ':' || period
    from public.settlements s
    join public.profiles p on p.id = s.debtor_id
    where s.period_end = period and p.group_id = settings.group_id
    on conflict (dedupe_key) do nothing
    returning *;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leaving and removal
-- ---------------------------------------------------------------------------

-- Why a member can't leave on their own yet (null when they can): money and open days first.
create function private.leave_blocker(p_member_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (select 1 from public.settlements s
                 where (s.debtor_id = p_member_id or s.payee_id = p_member_id) and s.status <> 'completed')
      then 'leave_unsettled'
    when exists (select 1 from public.penalties x
                 where x.user_id = p_member_id and x.settlement_id is null and x.waived is null)
      then 'leave_unsettled'
    when exists (select 1 from public.study_logs l where l.user_id = p_member_id and l.status in ('pending', 'passed'))
      or exists (select 1 from public.failure_reports r where r.user_id = p_member_id and r.status <> 'resolved')
      then 'leave_day_open'
    when (select is_admin from public.profiles where id = p_member_id)
      and not exists (select 1 from public.profiles o
                      where o.group_id = private.group_of(p_member_id) and o.id <> p_member_id
                        and o.is_admin and o.deactivated_at is null)
      and exists (select 1 from public.profiles o
                  where o.group_id = private.group_of(p_member_id) and o.id <> p_member_id and o.deactivated_at is null)
      then 'last_admin'
  end;
$$;

-- Ends a membership. Records stay. Open days of a removed member close quietly (no penalty, no
-- notice), people who paid to them lose that payee, and reviews they were still owing are
-- decided by the others' votes.
create function private.end_membership(p_member_id uuid, p_reason text, p_by uuid)
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
    elsif exists (select 1 from public.failure_reports where study_log_id = subject.subject_id and status = 'under_review') then
      return query select * from private.resolve_excuse(subject.subject_id, true, false);
    end if;
  end loop;
end;
$$;

create function public.leave_group(p_member_id uuid)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  blocker text;
begin
  perform private.require_member(p_member_id);
  perform pg_advisory_xact_lock(hashtext('admins:' || private.group_of(p_member_id)));
  blocker := private.leave_blocker(p_member_id);
  if blocker is not null then
    raise exception '%', blocker using errcode = 'P0001';
  end if;
  return query select * from private.end_membership(p_member_id, 'left', null);
end;
$$;

-- An admin removes someone (e.g. a member nobody can reach). Unlike leaving, open money and days
-- don't block it: their unpaid settlements stay on record but get no more P7.
create function public.remove_member(p_admin_id uuid, p_member_id uuid)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  if p_admin_id = p_member_id then
    raise exception 'remove_self' using errcode = 'P0001';
  end if;
  if not private.same_group(p_admin_id, p_member_id) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return query select * from private.end_membership(p_member_id, 'removed', p_admin_id);
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.trial_for(uuid)', 'private.review_tally(text, uuid)', 'private.leave_blocker(uuid)',
    'private.end_membership(uuid, text, uuid)', 'public.leave_group(uuid)', 'public.remove_member(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  execute 'revoke all on function private.my_member() from public, anon';
  execute 'grant execute on function private.my_member() to authenticated, service_role';
end;
$$;
