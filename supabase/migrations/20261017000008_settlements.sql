-- M7b: weekly settlement (requirements F8, P7, ADR-010/012/019/023).
-- Every Saturday 23:59, after that day has closed, each member's unsettled penalties (trial ones
-- excluded) are bundled into one settlement to their payee. No netting. A settlement still
-- 'open' at the next settlement gets P7, every week until it is marked sent.

-- ---------------------------------------------------------------------------
-- Ranking and the 「奢り確定」 badge
-- ---------------------------------------------------------------------------

create view public.penalty_summary
with (security_invoker = true) as
select
  p.id as user_id,
  p.display_name,
  coalesce(sum(x.points) filter (where x.waived is null), 0)::int as total_points,
  coalesce(sum(x.points) filter (where x.waived is null and x.settlement_id is null), 0)::int as unsettled_points,
  -- This week = since Sunday (JST), like the settlement period. Inline so the view needs no
  -- grants on private functions.
  coalesce(sum(x.points) filter (
    where x.waived is null
      and (x.created_at at time zone 'Asia/Tokyo')::date
          >= (now() at time zone 'Asia/Tokyo')::date - extract(dow from (now() at time zone 'Asia/Tokyo'))::int
  ), 0)::int as this_week_points,
  coalesce(sum(x.points) filter (where x.waived = 'trial'), 0)::int as trial_points,
  (select s.id from public.settlements s
   where s.debtor_id = p.id and s.status <> 'completed'
   order by s.period_end desc limit 1) as open_settlement_id
from public.profiles p
left join public.penalties x on x.user_id = p.id
where p.deactivated_at is null
group by p.id, p.display_name;

-- security_invoker: members read it through the RLS of profiles, penalties and settlements.
grant select on public.penalty_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Payees (decided by the group, entered by an admin)
-- ---------------------------------------------------------------------------

create function public.assign_payee(p_admin_id uuid, p_user_id uuid, p_payee_id uuid)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous uuid;
  event public.activity_events;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and is_admin and deactivated_at is null) then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;
  select payee_id into previous from public.profiles where id = p_user_id and deactivated_at is null for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_payee_id = p_user_id
     or not exists (select 1 from public.profiles where id = p_payee_id and deactivated_at is null) then
    raise exception 'invalid_payee' using errcode = 'P0001';
  end if;
  if previous is not distinct from p_payee_id then
    raise exception 'unchanged' using errcode = 'P0001';
  end if;

  update public.profiles set payee_id = p_payee_id where id = p_user_id;
  insert into public.activity_events (type, actor_id, payload)
  values ('payee_assigned', p_admin_id,
          jsonb_build_object('user_id', p_user_id, 'payee_id', p_payee_id, 'previous_payee_id', previous))
  returning * into event;
  return event;
end;
$$;

-- ---------------------------------------------------------------------------
-- The weekly run
-- ---------------------------------------------------------------------------

-- The latest settlement day (Saturday by default) whose settlement time has passed.
create function private.current_period_end()
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  settings public.group_settings;
  today date := private.jst_today();
  period date;
begin
  select * into settings from public.group_settings;
  period := today - ((extract(dow from today)::int - settings.settlement_weekday + 7) % 7);
  if private.now() < private.day_at(period, settings.settlement_time) then
    period := period - 7;
  end if;
  return period;
end;
$$;

-- Runs inside tick() after that day's own deadlines have closed, so Saturday's penalties are in.
-- Idempotent: one settlement per member per period, one P7 per open settlement per period.
create function public.run_weekly_settlement()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  period date := private.current_period_end();
  late public.settlements;
  member record;
  created public.settlements;
  admins uuid[];
begin
  select * into settings from public.group_settings;

  -- P7 first, so it goes into this settlement: anything still 'open' from an earlier week.
  for late in
    select * from public.settlements where status = 'open' and period_end < period
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
  select coalesce(array_agg(id), '{}') into admins from public.profiles where is_admin and deactivated_at is null;
  for member in
    select p.id, p.payee_id, sum(x.points)::int as amount
    from public.profiles p
    join public.penalties x on x.user_id = p.id and x.settlement_id is null and x.waived is null
    left join public.study_logs l on l.id = x.study_log_id
    where p.deactivated_at is null
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

  -- The week's results for everyone (once per period), for weeks the group actually played.
  if not exists (select 1 from public.study_logs where date between period - 6 and period) then
    return;
  end if;
  return query
  insert into public.activity_events (type, payload, dedupe_key)
  select 'weekly_summary', jsonb_build_object('period_end', period, 'ranking', coalesce(jsonb_agg(
           jsonb_build_object('user_id', s.debtor_id, 'amount', s.amount_yen) order by s.amount_yen desc), '[]')),
         'weekly_summary:' || period
  from public.settlements s
  where s.period_end = period
  on conflict (dedupe_key) do nothing
  returning *;
end;
$$;

-- Reminder 24 hours before an open settlement turns into P7.
create function public.late_payment_reminders()
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  next_run timestamptz;
begin
  select * into settings from public.group_settings;
  next_run := private.day_at(private.current_period_end() + 7, settings.settlement_time);
  if private.now() < next_run - interval '24 hours' then
    return;
  end if;
  return query
  insert into public.activity_events (type, actor_id, settlement_id, payload, dedupe_key)
  select 'reminder_late_payment', s.debtor_id, s.id,
         jsonb_build_object('amount', s.amount_yen, 'payee_id', s.payee_id, 'due_at', next_run,
                            'points', settings.penalty_late_payment),
         'reminder_late_payment:' || s.id || ':' || (private.current_period_end() + 7)
  from public.settlements s
  where s.status = 'open'
  on conflict (dedupe_key) do nothing
  returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- Paying: 送金した (debtor) -> 受け取った / 届いていない (payee)
-- ---------------------------------------------------------------------------

create function public.mark_settlement_sent(p_debtor_id uuid, p_settlement_id uuid)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement public.settlements;
  event public.activity_events;
begin
  perform private.require_member(p_debtor_id);
  select * into settlement from public.settlements where id = p_settlement_id and debtor_id = p_debtor_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if settlement.status <> 'open' then
    raise exception 'settlement_not_open' using errcode = 'P0001';
  end if;
  update public.settlements set status = 'sent', sent_at = private.now() where id = settlement.id;
  insert into public.activity_events (type, actor_id, settlement_id, payload)
  values ('settlement_sent', p_debtor_id, settlement.id,
          jsonb_build_object('payee_id', settlement.payee_id, 'amount', settlement.amount_yen))
  returning * into event;
  return event;
end;
$$;

create function public.confirm_settlement(p_payee_id uuid, p_settlement_id uuid)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement public.settlements;
  event public.activity_events;
begin
  perform private.require_member(p_payee_id);
  select * into settlement from public.settlements where id = p_settlement_id and payee_id = p_payee_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if settlement.status <> 'sent' then
    raise exception 'settlement_not_sent' using errcode = 'P0001';
  end if;
  update public.settlements set status = 'completed', completed_at = private.now() where id = settlement.id;
  insert into public.activity_events (type, actor_id, settlement_id, payload)
  values ('settlement_completed', p_payee_id, settlement.id,
          jsonb_build_object('debtor_id', settlement.debtor_id, 'amount', settlement.amount_yen))
  returning * into event;
  return event;
end;
$$;

-- The payee didn't get the money: back to 'open' (so P7 applies again if it stays unpaid).
create function public.report_not_received(p_payee_id uuid, p_settlement_id uuid)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settlement public.settlements;
  event public.activity_events;
begin
  perform private.require_member(p_payee_id);
  select * into settlement from public.settlements where id = p_settlement_id and payee_id = p_payee_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if settlement.status <> 'sent' then
    raise exception 'settlement_not_sent' using errcode = 'P0001';
  end if;
  update public.settlements set status = 'open', sent_at = null where id = settlement.id;
  insert into public.activity_events (type, actor_id, settlement_id, payload)
  values ('settlement_not_received', p_payee_id, settlement.id,
          jsonb_build_object('debtor_id', settlement.debtor_id, 'amount', settlement.amount_yen))
  returning * into event;
  return event;
end;
$$;

-- tick: the weekly settlement runs last, after the day's own deadlines.
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
  return query select * from public.late_payment_reminders();
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.assign_payee(uuid, uuid, uuid)', 'private.current_period_end()', 'public.run_weekly_settlement()',
    'public.late_payment_reminders()', 'public.mark_settlement_sent(uuid, uuid)',
    'public.confirm_settlement(uuid, uuid)', 'public.report_not_received(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
