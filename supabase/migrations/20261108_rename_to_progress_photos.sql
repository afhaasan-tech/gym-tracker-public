-- Align with the D2 assignment names: bucket `progress-photos`, column `photo_url`.
drop policy "Users view own workout photos" on storage.objects;
drop policy "Users upload own workout photos" on storage.objects;
drop policy "Users delete own workout photos" on storage.objects;
update storage.buckets set id = 'progress-photos', name = 'progress-photos' where id = 'workout-photos';
alter table public.workouts rename column photo_path to photo_url;
alter table public.workouts rename constraint workouts_check to workouts_photo_url_check;
create policy "Users view own progress photos" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload own progress photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own progress photos" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
