-- Workout extras: optional photo path + optional (user-editable) AI summary
alter table public.workouts
  add column photo_path text check (photo_path is null or photo_path like user_id::text || '/%'),
  add column summary text check (summary is null or char_length(summary) <= 1000);

-- Private bucket: images only, max 5 MB (enforced server-side by Storage)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workout-photos', 'workout-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

-- Users may only touch files inside their own folder: <user_id>/...
create policy "Users view own workout photos" on storage.objects for select to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload own workout photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own workout photos" on storage.objects for delete to authenticated
  using (bucket_id = 'workout-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
