-- Single-use invites that any member can issue on the spot; they expire after a few minutes
-- (ADR-026, replaces the shared INVITE_CODE of ADR-025). INVITE_CODE now only lets the very first
-- member in, while the group is still empty.

alter table public.group_settings
  add column max_members int not null default 6 check (max_members between 1 and 50),
  add column invite_minutes int not null default 15 check (invite_minutes between 1 and 1440);

-- Only the SHA-256 of the code is stored; the code itself is shown once to the member who issued it.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid unique references public.profiles (id),
  used_at timestamptz,
  check (expires_at > created_at),
  check ((used_by is null) = (used_at is null))
);

create index invites_created_by_idx on public.invites (created_by, created_at desc);

-- History: never deleted; only the "used" columns change, once.
create trigger forbid_delete before delete on public.invites
  for each row execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.invites
  for each statement execute function private.forbid_delete();
create trigger restrict_update before update on public.invites
  for each row execute function private.restrict_update('used_by', 'used_at');

-- Server-only: members never read invites through the API (the hashes are not for them).
alter table public.invites enable row level security;

create function private.active_member_count()
returns int
language sql
stable
set search_path = ''
as $$
  select count(*)::int from public.profiles where deactivated_at is null;
$$;

-- Called by the invite Server Action with the hash of a freshly generated code.
create function public.create_invite(p_user_id uuid, p_code_hash text)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  created public.invites;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and deactivated_at is null) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;

  select * into settings from public.group_settings;
  if private.active_member_count() >= settings.max_members then
    raise exception 'group_full' using errcode = 'P0001';
  end if;

  insert into public.invites (code_hash, created_by, expires_at)
  values (p_code_hash, p_user_id, now() + make_interval(mins => settings.invite_minutes))
  returning * into created;

  return created;
end;
$$;

-- join_group now consumes an invite (or, for the first member only, the bootstrap code that the
-- Server Action checked against INVITE_CODE). Checking and consuming happen in one transaction,
-- serialized by the advisory lock, so one invite admits exactly one person.
drop function public.join_group(uuid, text, text);

create function public.join_group(
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
  joined public.profiles;
  invite public.invites;
  is_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));

  select * into joined from public.profiles where id = p_user_id;
  if found then
    return joined;
  end if;

  is_first := not exists (select 1 from public.profiles);

  if p_bootstrap then
    if not is_first then
      raise exception 'bootstrap_closed' using errcode = 'P0001';
    end if;
  else
    -- Wrong, expired and already-used codes all look the same to the caller on purpose.
    select * into invite from public.invites
    where code_hash = p_invite_hash and used_at is null and expires_at > now()
    for update;
    if not found then
      raise exception 'invalid_invite' using errcode = 'P0001';
    end if;
  end if;

  if private.active_member_count() >= (select max_members from public.group_settings) then
    raise exception 'group_full' using errcode = 'P0001';
  end if;

  insert into public.profiles (id, display_name, avatar_url, is_admin, trial_ends_at)
  values (p_user_id, btrim(p_display_name), p_avatar_url, is_first, private.trial_end_for(now()))
  returning * into joined;

  if invite.id is not null then
    update public.invites set used_by = p_user_id, used_at = now() where id = invite.id;
  end if;

  insert into public.activity_events (type, actor_id, payload)
  values ('member_joined', p_user_id, jsonb_build_object('invited_by', invite.created_by));

  return joined;
end;
$$;

revoke all on function private.active_member_count() from public, anon, authenticated;
grant execute on function private.active_member_count() to service_role;
revoke all on function public.create_invite(uuid, text) from public, anon, authenticated;
revoke all on function public.join_group(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_invite(uuid, text) to service_role;
grant execute on function public.join_group(uuid, text, text, text, boolean) to service_role;
