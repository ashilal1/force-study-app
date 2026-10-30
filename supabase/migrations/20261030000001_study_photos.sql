-- Photos taken while studying (F4c, ADR-050). A start photo when the study begins (today's
-- passphrase with the blank page or the opened book; the server stamps the time), and, if the
-- member wants, progress photos later, each at least photo_gap_minutes after the previous one so
-- there is no reason to keep picking up the phone. The AI judge and the members compare them with
-- the work handed in. Groups can make the start photo a must (start_photo_required, off by default
-- so the code already in production keeps submitting as before until the admin turns it on).
-- Additive only: a new table, two settings and new functions; create_submission only gains a check
-- that is off by default.

alter table public.group_settings
  add column start_photo_required boolean not null default false,
  add column photo_gap_minutes int not null default 25 check (photo_gap_minutes between 5 and 180);
comment on column public.group_settings.start_photo_required is 'F4c: a study day (or makeup session) needs its start photo before it can be submitted.';
comment on column public.group_settings.photo_gap_minutes is 'F4c: minutes between two photos taken while studying.';

create table public.study_photos (
  id uuid primary key default gen_random_uuid(),
  study_log_id uuid not null references public.study_logs (id),
  -- Denormalized for RLS and the Storage path check, like submissions.user_id.
  user_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('start', 'progress')),
  -- "{user_id}/{date}/{uuid}.webp"; emptied (null) once the original is deleted. The thumbnail stays.
  image_path text,
  thumb_path text,
  taken_at timestamptz not null default now(),
  images_purged_at timestamptz,
  check ((image_path is null) = (images_purged_at is not null))
);
comment on table public.study_photos is 'F4c: photos taken while studying, before the work is handed in. Server time only.';
create unique index study_photos_one_start on public.study_photos (study_log_id) where kind = 'start';
create index study_photos_log_idx on public.study_photos (study_log_id, taken_at);

create trigger forbid_delete before delete on public.study_photos
  for each row execute function private.forbid_delete();
create trigger forbid_truncate before truncate on public.study_photos
  for each statement execute function private.forbid_delete();
create trigger restrict_update before update on public.study_photos
  for each row execute function private.restrict_update('image_path', 'images_purged_at');

alter table public.study_photos enable row level security;
grant select on public.study_photos to authenticated;
create policy "members read group rows" on public.study_photos for select to authenticated
  using (private.in_my_group(user_id));

-- One photo while studying. The first one of the day (before anything was handed in) is the start
-- photo; later ones are progress photos, photo_gap_minutes apart, six photos a day at most.
create function public.add_study_photo(p_user_id uuid, p_study_log_id uuid, p_image_path text, p_thumb_path text)
returns public.study_photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  last_at timestamptz;
  taken int;
  created public.study_photos;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);
  select * into log from public.study_logs where id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if log.status = 'passed' or log.status = 'completed' then
    raise exception 'already_passed' using errcode = 'P0001';
  end if;
  if log.status <> 'pending' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if private.now() >= log.target_end_time then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.submissions where study_log_id = log.id and status = 'judging') then
    raise exception 'judging_in_progress' using errcode = 'P0001';
  end if;
  -- The members judge the day on what was there when it was asked (F5c).
  if private.appeal_open(log.id) then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if not private.is_evidence_path(p_image_path, p_user_id, log.date, false)
     or (p_thumb_path is not null and not private.is_evidence_path(p_thumb_path, p_user_id, log.date, true)) then
    raise exception 'invalid_images' using errcode = 'P0001';
  end if;

  select count(*), max(taken_at) into taken, last_at from public.study_photos where study_log_id = log.id;
  if taken >= 6 then
    raise exception 'photo_limit' using errcode = 'P0001';
  end if;
  if last_at is not null and private.now() < last_at + make_interval(mins => settings.photo_gap_minutes) then
    raise exception 'photo_too_soon' using errcode = 'P0001';
  end if;

  insert into public.study_photos (study_log_id, user_id, kind, image_path, thumb_path, taken_at)
  values (
    log.id, p_user_id,
    case when taken = 0 and not exists (select 1 from public.submissions where study_log_id = log.id)
      then 'start' else 'progress' end,
    p_image_path, p_thumb_path, private.now()
  )
  returning * into created;
  return created;
end;
$$;

-- Submitting may need the start photo first (start_photo_required).
create or replace function public.create_submission(
  p_user_id uuid,
  p_study_log_id uuid,
  p_image_paths text[],
  p_thumb_path text,
  p_learned text,
  p_struggled text,
  p_self_rating int
)
returns public.activity_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.group_settings;
  log public.study_logs;
  used int;
  next_no int;
  created public.submissions;
  event public.activity_events;
  path text;
begin
  perform private.require_member(p_user_id);
  settings := private.settings_of(p_user_id);
  select * into log from public.study_logs where id = p_study_log_id and user_id = p_user_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if log.status = 'passed' or log.status = 'completed' then
    raise exception 'already_passed' using errcode = 'P0001';
  end if;
  if log.status <> 'pending' then
    raise exception 'not_open' using errcode = 'P0001';
  end if;
  if private.now() >= log.target_end_time then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.submissions where study_log_id = log.id and status = 'judging') then
    raise exception 'judging_in_progress' using errcode = 'P0001';
  end if;
  -- F4c: some groups want the start of the study on record before the work is handed in.
  if settings.start_photo_required
     and not exists (select 1 from public.study_photos where study_log_id = log.id and kind = 'start') then
    raise exception 'start_photo_missing' using errcode = 'P0001';
  end if;

  select count(*) filter (where status <> 'error'), coalesce(max(attempt_no), 0) + 1 into used, next_no
  from public.submissions where study_log_id = log.id and kind = 'regular';
  if used >= settings.max_attempts then
    raise exception 'no_attempts_left' using errcode = 'P0001';
  end if;

  if cardinality(p_image_paths) not between 1 and 3 then
    raise exception 'invalid_images' using errcode = 'P0001';
  end if;
  foreach path in array p_image_paths loop
    if not private.is_evidence_path(path, p_user_id, log.date, false) then
      raise exception 'invalid_images' using errcode = 'P0001';
    end if;
  end loop;
  if p_thumb_path is not null and not private.is_evidence_path(p_thumb_path, p_user_id, log.date, true) then
    raise exception 'invalid_images' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_learned, ''))) not between 1 and 2000
     or char_length(btrim(coalesce(p_struggled, ''))) not between 1 and 2000 then
    raise exception 'invalid_reflection' using errcode = 'P0001';
  end if;
  if p_self_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;

  insert into public.submissions (
    study_log_id, user_id, kind, attempt_no, image_paths, thumb_path, learned_text, struggled_text,
    self_rating, status, elapsed_minutes, submitted_at
  ) values (
    log.id, p_user_id, 'regular', next_no, p_image_paths, p_thumb_path, btrim(p_learned), btrim(p_struggled),
    p_self_rating, 'judging', floor(extract(epoch from private.now() - log.declared_at) / 60)::int, private.now()
  ) returning * into created;

  insert into public.activity_events (type, actor_id, study_log_id, submission_id, payload)
  values ('submitted', p_user_id, log.id, created.id,
          jsonb_build_object('attempt_no', next_no, 'elapsed_minutes', created.elapsed_minutes))
  returning * into event;
  return event;
end;
$$;

-- Originals of the photos taken while studying go like the submitted ones (due_image_purges): after
-- the group's image_retention_days, or oldest first while the bucket is over 800MB. Days still
-- open keep theirs. Thumbnails stay.
create function public.due_photo_purges(p_limit int default 100)
returns table (photo_id uuid, image_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  budget bigint := 800::bigint * 1024 * 1024;
  used bigint;
begin
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into used
  from storage.objects o
  where o.bucket_id = 'study-evidence';

  return query
  with stored as (
    select ph.id, ph.image_path, ph.taken_at, g.image_retention_days,
           (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
            where o.bucket_id = 'study-evidence' and o.name = ph.image_path) as bytes
    from public.study_photos ph
    join public.study_logs l on l.id = ph.study_log_id
    join public.profiles p on p.id = ph.user_id
    join public.group_settings g on g.group_id = p.group_id
    where ph.images_purged_at is null and l.status not in ('pending', 'passed')
  ),
  ranked as (
    select stored.*, sum(stored.bytes) over (order by stored.taken_at, stored.id) - stored.bytes as freed_before
    from stored
  )
  select r.id, r.image_path from ranked r
  where r.taken_at < private.now() - make_interval(days => r.image_retention_days)
     or (used > budget and r.freed_before < used - budget)
  order by r.taken_at
  limit greatest(p_limit, 0);
end;
$$;

create function public.mark_photos_purged(p_photo_ids uuid[])
returns int
language sql
security definer
set search_path = ''
as $$
  with purged as (
    update public.study_photos
    set image_path = null, images_purged_at = private.now()
    where id = any(p_photo_ids) and images_purged_at is null
    returning 1
  )
  select count(*)::int from purged;
$$;

-- start_photo_required and photo_gap_minutes join the settings an admin can change.
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
    'appeals_per_week', 'start_photo_required', 'photo_gap_minutes'
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
      start_photo_required = coalesce((p_changes->>'start_photo_required')::boolean, g.start_photo_required),
      photo_gap_minutes = coalesce((p_changes->>'photo_gap_minutes')::int, g.photo_gap_minutes),
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


-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.add_study_photo(uuid, uuid, text, text)', 'public.due_photo_purges(int)', 'public.mark_photos_purged(uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
