-- Day 9: user profile (personal details), owned by the authenticated user and protected by RLS.
-- Age is NOT stored: the app computes it from date_of_birth.
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
