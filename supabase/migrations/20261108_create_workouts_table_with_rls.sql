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
