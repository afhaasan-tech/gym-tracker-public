-- VORA Phase 1 / milestone 2: AI Coach backend tables (jobs, routes, provider budget gate, rate limiter).
-- Forward-only, additive. Live (billable) provider calls are OFF by default and can only run while the database budget gate allows them.
begin;

-- ---------------------------------------------------------------- provider spend gate (hard stop against overspending)
create table public.ai_budget (
  id int primary key default 1 check (id = 1),
  live_calls_enabled boolean not null default false,          -- master switch: false = only the mock provider may run
  monthly_cap_usd_micro bigint not null default 0 check (monthly_cap_usd_micro >= 0),   -- 1 USD = 1,000,000 micro
  per_call_cap_usd_micro bigint not null default 50000 check (per_call_cap_usd_micro >= 0),
  period_start date not null default date_trunc('month', now())::date,
  spent_usd_micro bigint not null default 0 check (spent_usd_micro >= 0),
  updated_at timestamptz not null default now()
);
insert into public.ai_budget default values;
alter table public.ai_budget enable row level security;
revoke all on public.ai_budget from anon, authenticated;

-- Reserves p_estimate against the monthly cap BEFORE a billable call. Returns false (no call may be made) if the gate is off,
-- the estimate exceeds the per-call cap, or the cap would be exceeded. Serialised by a row lock, so parallel calls cannot overshoot.
create or replace function public.ai_budget_authorize(p_estimate bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  if p_estimate is null or p_estimate < 0 then return false; end if;
  select * into b from public.ai_budget where id = 1 for update;
  if b.period_start < date_trunc('month', now())::date then
    update public.ai_budget set period_start = date_trunc('month', now())::date, spent_usd_micro = 0 where id = 1;
    b.spent_usd_micro := 0;
  end if;
  if not b.live_calls_enabled or b.monthly_cap_usd_micro = 0 then return false; end if;
  if p_estimate > b.per_call_cap_usd_micro or b.spent_usd_micro + p_estimate > b.monthly_cap_usd_micro then return false; end if;
  update public.ai_budget set spent_usd_micro = spent_usd_micro + p_estimate, updated_at = now() where id = 1;
  return true;
end $$;

-- After the call: replace the estimate by the real cost (never below zero).
create or replace function public.ai_budget_settle(p_estimate bigint, p_actual bigint) returns void
language sql security definer set search_path = public as $$
  update public.ai_budget set spent_usd_micro = greatest(0, spent_usd_micro - greatest(p_estimate, 0) + greatest(p_actual, 0)), updated_at = now() where id = 1;
$$;

-- ---------------------------------------------------------------- routing configuration (no secrets here)
create table public.ai_routes (
  operation_key text primary key references public.ai_operations(key),
  provider text not null check (provider in ('mock','anthropic')),
  model text not null,
  max_output_tokens int not null check (max_output_tokens between 16 and 8000),
  fallback_provider text check (fallback_provider in ('mock','anthropic')),
  fallback_model text,
  updated_at timestamptz not null default now()
);
alter table public.ai_routes enable row level security;
revoke all on public.ai_routes from anon, authenticated;
-- Defaults are the PLANNED live routing (from the provider research) but nothing runs live until the budget gate and the function's own switch are on.
insert into public.ai_routes (operation_key, provider, model, max_output_tokens) values
  ('quick_question', 'anthropic', 'claude-haiku-5-5', 500),
  ('meal_image_analysis', 'anthropic', 'claude-sonnet-5-5', 900),
  ('partial_modification', 'anthropic', 'claude-sonnet-5-5', 1500),
  ('full_workout_plan', 'anthropic', 'claude-sonnet-5-5', 4000),
  ('full_food_plan', 'anthropic', 'claude-sonnet-5-5', 4000);

-- ---------------------------------------------------------------- jobs (idempotent execution record, private to the member)
create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  operation_key text not null references public.ai_operations(key),
  reservation_id uuid references public.credit_reservations(id),
  status text not null default 'running' check (status in ('running','done','failed')),
  persona text not null check (persona in ('rashid','sarah')),
  language text not null check (language in ('ar','en')),
  provider text, model text,
  input_tokens int, output_tokens int, cost_usd_micro bigint, latency_ms int,
  request_text text, response_text text, error_code text,
  created_at timestamptz not null default now(), finished_at timestamptz,
  unique (user_id, idempotency_key)
);
alter table public.ai_jobs enable row level security;
revoke all on public.ai_jobs from anon, authenticated;
grant select (id, operation_key, status, persona, language, request_text, response_text, created_at, finished_at) on public.ai_jobs to authenticated;
create policy "Members read own AI jobs" on public.ai_jobs for select to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- generic sliding-window rate limiter
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null check (char_length(bucket) <= 120),
  created_at timestamptz not null default now()
);
create index rate_limit_events_idx on public.rate_limit_events (bucket, created_at);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

create or replace function public.rate_limit_hit(p_bucket text, p_limit int, p_window interval)
returns table (allowed boolean, retry_after int)
language plpgsql security definer set search_path = public as $$
declare used int; oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 7));
  select count(*), min(created_at) into used, oldest from public.rate_limit_events where bucket = p_bucket and created_at > now() - p_window;
  if used >= p_limit then return query select false, greatest(1, ceil(extract(epoch from (oldest + p_window - now())))::int); return; end if;
  insert into public.rate_limit_events (bucket) values (p_bucket);
  return query select true, 0;
end $$;
create or replace function public.rate_limit_purge(p_older interval default interval '2 days') returns int
language sql security definer set search_path = public as $$
  with d as (delete from public.rate_limit_events where created_at < now() - p_older returning 1) select count(*)::int from d;
$$;

revoke all on function public.ai_budget_authorize(bigint), public.ai_budget_settle(bigint, bigint), public.rate_limit_hit(text, int, interval), public.rate_limit_purge(interval) from public, anon, authenticated;
grant execute on function public.ai_budget_authorize(bigint), public.ai_budget_settle(bigint, bigint), public.rate_limit_hit(text, int, interval), public.rate_limit_purge(interval) to service_role;
commit;
