-- Launch week: everyone's trial runs to at least Sunday 2026-10-25 00:00 JST (the owner's
-- request). Members joining before then already get that date from trial_end_for(); this only
-- moves earlier ones (the owner, whose trial ended on 10-18).
update public.profiles
set trial_ends_at = '2026-10-25 00:00+09'
where deactivated_at is null and trial_ends_at < '2026-10-25 00:00+09';

-- The "last trial day" reminder is now keyed by the trial end, so a member whose trial was
-- extended hears it again before the new end.
create or replace function public.trial_ending_reminders()
returns setof public.activity_events
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_events (type, actor_id, payload, dedupe_key)
  select 'trial_ending', p.id, jsonb_build_object('trial_ends_at', p.trial_ends_at),
         'trial_ending:' || p.id || ':' || (p.trial_ends_at at time zone 'Asia/Tokyo')::date
  from public.profiles p
  where p.deactivated_at is null
    and private.jst_today() = (p.trial_ends_at at time zone 'Asia/Tokyo')::date - 1
  on conflict (dedupe_key) do nothing
  returning *;
$$;
