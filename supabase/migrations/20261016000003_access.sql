-- Access control (ADR-004): the browser reads through RLS; every state change goes through the
-- server with the secret key (service_role) and RPCs. See docs/database.md §4.

-- Supabase grants everything on public tables to anon/authenticated by default. Start from nothing.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

-- Helpers are internal; only service_role (RPCs run as definer) needs them.
-- Exception: RLS policies call private.is_member() as the signed-in user.
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
grant usage on schema private to authenticated;
grant execute on function private.is_member() to authenticated;

-- RPCs are called only by the server with the secret key.
grant execute on function public.join_group(uuid, text, text) to service_role;

do $$
declare
  t text;
begin
  foreach t in array array[
    'group_settings', 'profiles', 'rest_days', 'leave_requests', 'study_logs', 'declaration_flags',
    'submissions', 'submission_flags', 'submission_disputes', 'failure_reports', 'peer_reviews',
    'settlements', 'penalties', 'activity_events', 'notifications', 'push_subscriptions',
    'weekly_reviews'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;

  -- Group-wide data: every member can read everything (it's a closed group of friends).
  -- Signed-in Google users who haven't entered the invite code see nothing.
  foreach t in array array[
    'group_settings', 'profiles', 'rest_days', 'leave_requests', 'study_logs', 'declaration_flags',
    'submissions', 'submission_flags', 'submission_disputes', 'failure_reports', 'peer_reviews',
    'settlements', 'penalties', 'activity_events', 'weekly_reviews'
  ] loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy "members can read" on public.%I for select to authenticated using ((select private.is_member()))',
      t
    );
  end loop;
end;
$$;

-- Profiles: a member may edit only their own display fields. payee_id/is_admin/etc. go through the server.
grant update (display_name, avatar_url, paypay_link) on public.profiles to authenticated;
create policy "members update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and (select private.is_member()))
  with check (id = (select auth.uid()));

-- Notifications: only your own, and you may only mark them read.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "read own notifications" on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy "mark own notifications read" on public.notifications
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

-- Push subscriptions: readable by the owner; registration is a Server Action.
grant select on public.push_subscriptions to authenticated;
create policy "read own push subscriptions" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Realtime: clients subscribe to these; RLS filters what each member receives.
alter publication supabase_realtime add table
  public.notifications,
  public.study_logs,
  public.submissions,
  public.submission_flags,
  public.submission_disputes,
  public.failure_reports,
  public.peer_reviews,
  public.activity_events;
