-- Titles and ranks (M11, F13, F14, ADR-041). They are computed by the app from the records and
-- never stored; what is recorded is that they changed. After each tick the app computes every
-- group's standings, compares them with the group's last snapshot, and calls record_standings:
-- a new snapshot (a standing_snapshot event, with no notification of its own) and one event per
-- change (title_awarded / title_removed / rank_changed / crown_moved) for lib/notify.

create function public.record_standings(p_group_id uuid, p_previous_id uuid, p_snapshot jsonb, p_changes jsonb)
returns setof public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest uuid;
begin
  -- One writer per group; a tick that compared against an older snapshot records nothing.
  perform pg_advisory_xact_lock(hashtext('record_standings:' || p_group_id));
  select id into latest from public.activity_events
  where group_id = p_group_id and type = 'standing_snapshot'
  order by created_at desc, id desc
  limit 1;
  if latest is distinct from p_previous_id then
    return;
  end if;

  insert into public.activity_events (type, group_id, payload, created_at)
  values ('standing_snapshot', p_group_id, p_snapshot, private.now());

  return query
  insert into public.activity_events (type, actor_id, group_id, payload, created_at)
  select change.type, change.actor_id, p_group_id, coalesce(change.payload, '{}'::jsonb), private.now()
  from jsonb_to_recordset(p_changes) as change(type text, actor_id uuid, payload jsonb)
  join public.profiles p on p.id = change.actor_id and p.group_id = p_group_id and p.deactivated_at is null
  where change.type in ('title_awarded', 'title_removed', 'rank_changed', 'crown_moved')
  returning *;
end;
$$;

revoke all on function public.record_standings(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_standings(uuid, uuid, jsonb, jsonb) to service_role;
