-- First-time experience (F15・ADR-038): agreeing to the rules at the end of the intro lecture, and
-- the coach marks a member has already seen. Additive only; the code before this ignores both.

alter table public.profiles
  add column rules_accepted_at timestamptz,
  add column seen_tips text[] not null default '{}';

-- Everyone here before the lecture existed already knows the app: count them as agreed, with every
-- coach mark seen ('*').
update public.profiles set rules_accepted_at = created_at, seen_tips = '{*}';

-- Joining again (a second membership of the same account, ADR-035) shows the lecture again, since
-- the rules may differ by group, but not the coach marks.
create function private.returning_member_tips()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where auth_user_id = new.auth_user_id and id <> new.id) then
    new.seen_tips := '{*}';
  end if;
  return new;
end;
$$;

create trigger profiles_returning_member_tips
  before insert on public.profiles
  for each row execute function private.returning_member_tips();

-- 「このルールで始める」. Keeps the first time; viewing the lecture again doesn't call this.
create function public.accept_rules(p_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted timestamptz;
begin
  update public.profiles
  set rules_accepted_at = coalesce(rules_accepted_at, now())
  where id = p_user_id and deactivated_at is null
  returning rules_accepted_at into accepted;
  if not found then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  return accepted;
end;
$$;

-- A coach mark was closed. The keys live in the code (lib/tips.ts); the database only checks shape.
create function public.mark_tip_seen(p_user_id uuid, p_tip text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  seen text[];
begin
  if p_tip is null or p_tip !~ '^[a-z_]{1,40}$' then
    raise exception 'invalid_tip' using errcode = 'P0001';
  end if;
  select seen_tips into seen from public.profiles where id = p_user_id and deactivated_at is null for update;
  if not found then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if p_tip = any (seen) or '*' = any (seen) then
    return;
  end if;
  if cardinality(seen) >= 100 then
    raise exception 'invalid_tip' using errcode = 'P0001';
  end if;
  update public.profiles set seen_tips = array_append(seen, p_tip) where id = p_user_id;
end;
$$;

-- 「使い方をもう一度見る」: every coach mark shows again.
create function public.reset_tips(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set seen_tips = '{}' where id = p_user_id and deactivated_at is null;
  if not found then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.accept_rules(uuid) from public, anon, authenticated;
revoke all on function public.mark_tip_seen(uuid, text) from public, anon, authenticated;
revoke all on function public.reset_tips(uuid) from public, anon, authenticated;
grant execute on function public.accept_rules(uuid) to service_role;
grant execute on function public.mark_tip_seen(uuid, text) to service_role;
grant execute on function public.reset_tips(uuid) to service_role;
