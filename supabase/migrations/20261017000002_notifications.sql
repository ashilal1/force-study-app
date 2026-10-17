-- Notification pipeline (M3, docs/architecture.md §2.6-2.7):
-- activity_events -> notifications (one row per recipient) -> Web Push to every device.
-- lib/notify decides recipients and wording; these RPCs only record what it decided.

-- Registers this device for the caller. An endpoint belongs to one browser profile; if another
-- account signed in on the same browser registered it before, it moves to the caller and must be
-- verified again.
create function public.save_push_subscription(
  p_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.push_subscriptions;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and deactivated_at is null) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'invalid_endpoint' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (p_user_id, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    -- Same person, same keys: keep the confirmation. Anything else needs a new test notification.
    verified_at = case
      when push_subscriptions.user_id = excluded.user_id
        and push_subscriptions.p256dh = excluded.p256dh
        and push_subscriptions.auth = excluded.auth
      then push_subscriptions.verified_at
    end
  returning * into saved;

  return saved;
end;
$$;

-- The member pressed "it popped up and made a sound" after the test notification (F0 step 5).
create function public.confirm_push_subscription(p_user_id uuid, p_endpoint text)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = ''
as $$
declare
  confirmed public.push_subscriptions;
begin
  update public.push_subscriptions
  set verified_at = now()
  where endpoint = p_endpoint and user_id = p_user_id
  returning * into confirmed;
  if not found then
    raise exception 'unknown_subscription' using errcode = 'P0001';
  end if;

  update public.profiles set notifications_verified_at = now() where id = p_user_id;
  return confirmed;
end;
$$;

-- Removes a device: the member turned it off (p_user_id given), or the push service answered
-- 404/410 (p_user_id null). The next time that device opens the app, F0 sends it back to setup.
create function public.delete_push_subscription(p_endpoint text, p_user_id uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and (p_user_id is null or user_id = p_user_id);
$$;

create function public.record_push_success(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions set last_success_at = now() where endpoint = p_endpoint;
$$;

-- Fans an event out to the recipients lib/notify chose. Idempotent per (recipient, event), and
-- skips anyone who is not an active member. Returns only the rows created now, so a retry
-- doesn't push twice.
create function public.create_notifications(p_event_id uuid, p_items jsonb)
returns setof public.notifications
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, event_id, title, body, url, requires_action)
  select item.recipient_id, p_event_id, item.title, coalesce(item.body, ''), item.url, coalesce(item.requires_action, false)
  from jsonb_to_recordset(p_items)
    as item(recipient_id uuid, title text, body text, url text, requires_action boolean)
  join public.profiles p on p.id = item.recipient_id and p.deactivated_at is null
  on conflict (recipient_id, event_id) do nothing
  returning *;
$$;

create function public.mark_notifications_pushed(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set pushed_at = now() where id = any (p_ids) and pushed_at is null;
$$;

revoke all on function public.save_push_subscription(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirm_push_subscription(uuid, text) from public, anon, authenticated;
revoke all on function public.delete_push_subscription(text, uuid) from public, anon, authenticated;
revoke all on function public.record_push_success(text) from public, anon, authenticated;
revoke all on function public.create_notifications(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.mark_notifications_pushed(uuid[]) from public, anon, authenticated;
grant execute on function public.save_push_subscription(uuid, text, text, text, text) to service_role;
grant execute on function public.confirm_push_subscription(uuid, text) to service_role;
grant execute on function public.delete_push_subscription(text, uuid) to service_role;
grant execute on function public.record_push_success(text) to service_role;
grant execute on function public.create_notifications(uuid, jsonb) to service_role;
grant execute on function public.mark_notifications_pushed(uuid[]) to service_role;
