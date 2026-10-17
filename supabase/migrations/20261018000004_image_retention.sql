-- M9: deleting original evidence photos (requirements §7 "記録の保全", docs/architecture.md §2.5
-- step 12). Originals go after group_settings.image_retention_days, or oldest first while the
-- bucket is over 800MB (the free tier is 1GB). Thumbnails stay forever. Storage objects can only
-- be deleted through the Storage API, so the tick route lists them here, removes the files, and
-- then records the purge.

create function public.due_image_purges(p_limit int default 100)
returns table (submission_id uuid, image_paths text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  retention int := (select g.image_retention_days from public.group_settings g);
  budget bigint := 800::bigint * 1024 * 1024;
  used bigint;
begin
  select coalesce(sum((o.metadata->>'size')::bigint), 0) into used
  from storage.objects o
  where o.bucket_id = 'study-evidence';

  return query
  with stored as (
    -- Days still open (judging, re-judging, "怪しい" disputes) keep their photos.
    select s.id, s.image_paths, s.submitted_at,
           (select coalesce(sum((o.metadata->>'size')::bigint), 0) from storage.objects o
            where o.bucket_id = 'study-evidence' and o.name = any(s.image_paths)) as bytes
    from public.submissions s
    join public.study_logs l on l.id = s.study_log_id
    where s.images_purged_at is null and s.status <> 'judging' and l.status not in ('pending', 'passed')
  ),
  ranked as (
    select stored.*, sum(stored.bytes) over (order by stored.submitted_at, stored.id) - stored.bytes as freed_before
    from stored
  )
  select r.id, r.image_paths from ranked r
  where r.submitted_at < private.now() - make_interval(days => retention)
     or (used > budget and r.freed_before < used - budget)
  order by r.submitted_at
  limit greatest(p_limit, 0);
end;
$$;

-- After the files are gone: empty image_paths (the thumbnail path stays).
create function public.mark_images_purged(p_submission_ids uuid[])
returns int
language sql
security definer
set search_path = ''
as $$
  with purged as (
    update public.submissions
    set image_paths = '{}', images_purged_at = private.now()
    where id = any(p_submission_ids) and images_purged_at is null
    returning 1
  )
  select count(*)::int from purged;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array['public.due_image_purges(int)', 'public.mark_images_purged(uuid[])'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
