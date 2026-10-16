-- Evidence images. Private bucket; members view them through signed URLs.
-- Paths: {user_id}/{date}/{uuid}.webp and {uuid}_thumb.webp

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-evidence', 'study-evidence', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Members upload only into their own folder. Nobody updates or deletes through the API;
-- the retention job removes originals with the secret key.
create policy "members upload own evidence" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'study-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members read evidence" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-evidence');
