-- Food Diary stored per user in Supabase (replaces device-only localStorage).
-- Every row belongs to auth.uid(); RLS limits SELECT/INSERT/UPDATE/DELETE to the owner; user_id can never be supplied or changed by a client.

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

-- Column privileges on top of RLS: clients never send user_id (the database fills it) and can never change it.
revoke all on public.custom_foods, public.food_entries from anon, authenticated;
grant select, delete on public.custom_foods, public.food_entries to authenticated;
grant insert (id, name, serving, calories, protein, carbs, fat, legacy_id) on public.custom_foods to authenticated;
grant update (name, serving, calories, protein, carbs, fat) on public.custom_foods to authenticated;
grant insert (id, entry_date, name, serving, quantity, calories, protein, carbs, fat, food_source, food_ref, legacy_id) on public.food_entries to authenticated;
grant update (entry_date, name, serving, quantity, calories, protein, carbs, fat) on public.food_entries to authenticated;
