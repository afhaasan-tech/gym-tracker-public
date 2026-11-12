-- STAGING-ONLY baseline: existing workout/profile/food schema (mirrors production migrations 20261108-20261111, final state).
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercise text not null check (char_length(trim(exercise)) between 1 and 100),
  sets integer not null check (sets > 0),
  reps integer not null check (reps > 0),
  weight numeric not null default 0 check (weight >= 0),
  created_at timestamptz not null default now()
);
create index workouts_user_id_created_at_idx on public.workouts (user_id, created_at desc);
alter table public.workouts enable row level security;
create policy "Users can view own workouts" on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own workouts" on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can delete own workouts" on public.workouts
  for delete to authenticated using ((select auth.uid()) = user_id);
alter table public.workouts
  add column photo_url text constraint workouts_photo_url_check check (photo_url is null or photo_url like user_id::text || '/%'),
  add column summary text check (summary is null or char_length(summary) <= 1000);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos','progress-photos',false,5242880,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "Users view own progress photos" on storage.objects for select to authenticated using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload own progress photos" on storage.objects for insert to authenticated with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete own progress photos" on storage.objects for delete to authenticated using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(trim(full_name)) between 1 and 80),
  date_of_birth date check (date_of_birth is null or date_of_birth >= date '1900-01-01'),
  height_cm numeric(5,1) check (height_cm is null or height_cm between 50 and 260),
  weight_kg numeric(5,1) check (weight_kg is null or weight_kg between 20 and 400),
  updated_at timestamptz not null default now()
);

create function public.profiles_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.date_of_birth is not null and new.date_of_birth > current_date then
    raise exception 'date_of_birth cannot be in the future' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_before_write before insert or update on public.profiles
  for each row execute function public.profiles_before_write();

alter table public.profiles enable row level security;
create policy "Users view own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users create own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users update own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;

create table public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  serving text not null check (char_length(btrim(serving)) between 1 and 80),
  calories numeric(8,2) not null default 0 check (calories between 0 and 20000),
  protein numeric(8,2) not null default 0 check (protein between 0 and 2000),
  carbs numeric(8,2) not null default 0 check (carbs between 0 and 2000),
  fat numeric(8,2) not null default 0 check (fat between 0 and 2000),
  legacy_id text check (legacy_id is null or char_length(legacy_id) <= 64),  -- id the record had in this device's localStorage; makes the one-time import idempotent
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  serving text not null default '' check (char_length(serving) <= 80),
  quantity numeric(8,2) not null default 1 check (quantity > 0 and quantity <= 1000),
  calories numeric(8,2) not null default 0 check (calories between 0 and 20000),
  protein numeric(8,2) not null default 0 check (protein between 0 and 2000),
  carbs numeric(8,2) not null default 0 check (carbs between 0 and 2000),
  fat numeric(8,2) not null default 0 check (fat between 0 and 2000),
  food_source text check (food_source is null or food_source in ('original', 'usda', 'custom')),
  food_ref text check (food_ref is null or char_length(food_ref) <= 64),
  legacy_id text check (legacy_id is null or char_length(legacy_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);
create index food_entries_user_date_idx on public.food_entries (user_id, entry_date);
create index custom_foods_user_idx on public.custom_foods (user_id);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
create trigger custom_foods_touch before update on public.custom_foods for each row execute function public.touch_updated_at();
create trigger food_entries_touch before update on public.food_entries for each row execute function public.touch_updated_at();

alter table public.custom_foods enable row level security;
alter table public.food_entries enable row level security;

create policy "Users view own custom foods" on public.custom_foods for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add own custom foods" on public.custom_foods for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users edit own custom foods" on public.custom_foods for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own custom foods" on public.custom_foods for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users view own food entries" on public.food_entries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users add own food entries" on public.food_entries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users edit own food entries" on public.food_entries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete own food entries" on public.food_entries for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.custom_foods, public.food_entries from anon, authenticated;
grant select, delete on public.custom_foods, public.food_entries to authenticated;
grant insert (id, name, serving, calories, protein, carbs, fat, legacy_id) on public.custom_foods to authenticated;
grant update (name, serving, calories, protein, carbs, fat) on public.custom_foods to authenticated;
grant insert (id, entry_date, name, serving, quantity, calories, protein, carbs, fat, food_source, food_ref, legacy_id) on public.food_entries to authenticated;
grant update (entry_date, name, serving, quantity, calories, protein, carbs, fat) on public.food_entries to authenticated;
