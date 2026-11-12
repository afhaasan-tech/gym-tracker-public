-- VORA Phase 1 / milestone 3A (forward-only, ADDITIVE ONLY: no policy or function of earlier milestones is dropped or replaced): trusted devices + single active session, consents & private member data,
-- owner-configurable commerce (plans, flags, prices, credit limits, budget gate) with step-up verification and audit.
-- Depends on baseline objects: auth.users, public.admins, public.is_super_admin(), public.log_audit().
begin;
create extension if not exists pgcrypto;

-- ============================================================ security events (append-only)
create table public.security_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid, event text not null check (char_length(event) <= 60), details jsonb not null default '{}'
);
create function public.security_events_immutable() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'security events are append-only' using errcode = '42501'; end $$;
create trigger security_events_no_change before update or delete on public.security_events for each row execute function public.security_events_immutable();
create trigger security_events_no_truncate before truncate on public.security_events for each statement execute function public.security_events_immutable();
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated, service_role;

create function public.security_event(p_user uuid, p_event text, p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$ insert into public.security_events (user_id, event, details) values (p_user, left(p_event, 60), coalesce(p_details, '{}')); $$;

-- ============================================================ trusted devices, challenges, single active session
create table public.internal_secrets (name text primary key, value bytea not null);          -- generated inside the database, never read by any role below
insert into public.internal_secrets values ('device_otp_pepper', gen_random_bytes(32));
alter table public.internal_secrets enable row level security;
revoke all on public.internal_secrets from anon, authenticated, service_role;

create table public.trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null check (char_length(device_hash) between 32 and 128),
  label text check (label is null or char_length(label) <= 60),
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), revoked_at timestamptz,
  unique (user_id, device_hash)
);
create table public.device_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_hash text not null,
  code_hash bytea not null,
  expires_at timestamptz not null, attempts int not null default 0, consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index device_challenges_user_idx on public.device_challenges (user_id, created_at desc);
create table public.user_session_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_session_id uuid, active_device_id uuid references public.trusted_devices(id) on delete set null, updated_at timestamptz not null default now()
);
alter table public.trusted_devices enable row level security; alter table public.device_challenges enable row level security; alter table public.user_session_state enable row level security;
revoke all on public.trusted_devices, public.device_challenges, public.user_session_state from anon, authenticated, service_role;
grant select (id, label, created_at, last_seen_at, revoked_at) on public.trusted_devices to authenticated;
create policy "Members see their own devices" on public.trusted_devices for select to authenticated using ((select auth.uid()) = user_id);

-- A session is "trusted" only if it is THE active session of its user (set by a verified device challenge or a trusted device).
create or replace function public.is_trusted_session() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_session_state s where s.user_id = auth.uid() and s.active_session_id is not null
                 and s.active_session_id::text = coalesce(auth.jwt() ->> 'session_id', ''));
$$;

create function public.device_code_hash(p_challenge uuid, p_code text) returns bytea language sql stable security definer set search_path = public, extensions as $$
  select hmac(convert_to(p_challenge::text || ':' || p_code, 'UTF8'), (select value from public.internal_secrets where name = 'device_otp_pepper'), 'sha256');
$$;

-- returns 'trusted' (and makes this session the single active one) or 'challenge_required'
create function public.device_status(p_user uuid, p_device_hash text, p_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from public.trusted_devices where user_id = p_user and device_hash = p_device_hash and revoked_at is null;
  if not found then return 'challenge_required'; end if;
  update public.trusted_devices set last_seen_at = now() where id = d.id;
  insert into public.user_session_state (user_id, active_session_id, active_device_id) values (p_user, p_session, d.id)
  on conflict (user_id) do update set active_session_id = excluded.active_session_id, active_device_id = excluded.active_device_id, updated_at = now();
  perform public.security_event(p_user, 'session.activated', jsonb_build_object('device', d.id));
  return 'trusted';
end $$;

-- p_code is generated by the Edge Function (6 digits, CSPRNG); only a keyed hash is stored. At most 5 challenges per user per hour.
create function public.device_challenge_create(p_user uuid, p_device_hash text, p_code text, p_ttl_seconds int default 600) returns uuid
language plpgsql security definer set search_path = public as $$
declare n int; cid uuid := gen_random_uuid();
begin
  if p_code !~ '^[0-9]{6}$' then raise exception 'invalid code format' using errcode = '22023'; end if;
  select count(*) into n from public.device_challenges where user_id = p_user and created_at > now() - interval '1 hour';
  if n >= 5 then perform public.security_event(p_user, 'device.challenge_rate_limited'); return null; end if;   -- NULL = refused (not an exception, so the security event is kept)
  update public.device_challenges set consumed_at = now() where user_id = p_user and consumed_at is null;   -- a new code invalidates the old one
  insert into public.device_challenges (id, user_id, device_hash, code_hash, expires_at)
  values (cid, p_user, p_device_hash, public.device_code_hash(cid, p_code), now() + make_interval(secs => least(greatest(p_ttl_seconds, 60), 900)));
  perform public.security_event(p_user, 'device.challenge_sent');
  return cid;
end $$;

create function public.device_challenge_verify(p_user uuid, p_device_hash text, p_code text, p_session uuid, p_label text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c record; dev uuid;
begin
  select * into c from public.device_challenges where user_id = p_user and device_hash = p_device_hash and consumed_at is null order by created_at desc limit 1 for update;
  if not found or c.expires_at < now() then perform public.security_event(p_user, 'device.verify_no_valid_challenge'); return false; end if;
  if c.attempts >= 5 then return false; end if;
  update public.device_challenges set attempts = attempts + 1 where id = c.id;
  if p_code !~ '^[0-9]{6}$' or public.device_code_hash(c.id, p_code) is distinct from c.code_hash then
    if c.attempts + 1 >= 5 then update public.device_challenges set consumed_at = now() where id = c.id; perform public.security_event(p_user, 'device.challenge_burned'); end if;
    perform public.security_event(p_user, 'device.verify_failed'); return false;
  end if;
  update public.device_challenges set consumed_at = now() where id = c.id;
  insert into public.trusted_devices (user_id, device_hash, label) values (p_user, p_device_hash, left(p_label, 60))
  on conflict (user_id, device_hash) do update set revoked_at = null, last_seen_at = now(), label = coalesce(excluded.label, public.trusted_devices.label) returning id into dev;
  insert into public.user_session_state (user_id, active_session_id, active_device_id) values (p_user, p_session, dev)
  on conflict (user_id) do update set active_session_id = excluded.active_session_id, active_device_id = excluded.active_device_id, updated_at = now();
  perform public.security_event(p_user, 'device.trusted', jsonb_build_object('device', dev));
  return true;
end $$;

create function public.device_revoke(p_user uuid, p_device uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.trusted_devices set revoked_at = now() where id = p_device and user_id = p_user;
  update public.user_session_state set active_session_id = null where user_id = p_user and active_device_id = p_device;
  perform public.security_event(p_user, 'device.revoked', jsonb_build_object('device', p_device));
end $$;

-- ============================================================ consents + private member data
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('health_data_storage','ai_health_sharing','ai_memory_sensitive','marketing_notifications','analytics')),
  granted boolean not null, version text not null default 'v1', at timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, purpose, id desc);
alter table public.consents enable row level security;
revoke all on public.consents from anon, authenticated, service_role;
grant select on public.consents to authenticated;
create policy "Members read own consent history (trusted session)" on public.consents for select to authenticated using ((select auth.uid()) = user_id and (select public.is_trusted_session()));

create function public.has_consent(p_user uuid, p_purpose text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select granted from public.consents where user_id = p_user and purpose = p_purpose order by id desc limit 1), false);
$$;

create table public.member_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  goals text[] not null default '{}' check (cardinality(goals) <= 10),
  experience text check (experience in ('beginner','intermediate','advanced')),
  equipment text[] not null default '{}' check (cardinality(equipment) <= 30),
  coach_persona text not null default 'rashid' check (coach_persona in ('rashid','sarah')),
  coach_name text check (coach_name is null or char_length(coach_name) between 1 and 30),
  coach_tone text not null default 'friendly' check (coach_tone in ('friendly','direct','playful')),
  coach_language text not null default 'ar' check (coach_language in ('ar','en')),
  appearance jsonb not null default '{}' check (pg_column_size(appearance) < 2048),
  notifications jsonb not null default '{}' check (pg_column_size(notifications) < 2048),
  onboarding jsonb not null default '{}' check (pg_column_size(onboarding) < 2048),
  updated_at timestamptz not null default now()
);
create table public.member_health_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  conditions text check (conditions is null or char_length(conditions) <= 500),
  allergies text[] not null default '{}' check (cardinality(allergies) <= 30),
  limitations text check (limitations is null or char_length(limitations) <= 500),
  updated_at timestamptz not null default now()
);
create function public.health_requires_consent() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.has_consent(new.user_id, 'health_data_storage') then raise exception 'explicit consent is required to store health information' using errcode = 'PC010'; end if;
  new.updated_at := now(); return new;
end $$;
create trigger health_requires_consent before insert or update on public.member_health_profile for each row execute function public.health_requires_consent();
create function public.m3_touch_updated_at() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at := now(); return new; end $$;
create trigger prefs_touch before update on public.member_preferences for each row execute function public.m3_touch_updated_at();

alter table public.member_preferences enable row level security; alter table public.member_health_profile enable row level security;
revoke all on public.member_preferences, public.member_health_profile from anon, authenticated, service_role;
grant select, insert, update, delete on public.member_preferences to authenticated;
grant select, insert, update, delete on public.member_health_profile to authenticated;
create policy "Own preferences (trusted session)" on public.member_preferences for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_trusted_session())) with check ((select auth.uid()) = user_id and (select public.is_trusted_session()));
create policy "Own health profile (trusted session)" on public.member_health_profile for all to authenticated
  using ((select auth.uid()) = user_id and (select public.is_trusted_session())) with check ((select auth.uid()) = user_id and (select public.is_trusted_session()));

-- Consent is append-only history; withdrawing health consent ALSO erases the stored health profile.
create function public.consent_set(p_purpose text, p_granted boolean, p_version text default 'v1') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_trusted_session() then raise exception 'trusted session required' using errcode = '42501'; end if;
  insert into public.consents (user_id, purpose, granted, version) values (auth.uid(), p_purpose, p_granted, left(coalesce(p_version, 'v1'), 20));
  if not p_granted and p_purpose = 'health_data_storage' then delete from public.member_health_profile where user_id = auth.uid(); end if;
  perform public.security_event(auth.uid(), 'consent.' || case when p_granted then 'granted' else 'withdrawn' end, jsonb_build_object('purpose', p_purpose));
end $$;

create function public.my_data_export() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_trusted_session() then raise exception 'trusted session required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'preferences', (select to_jsonb(p) - 'user_id' from public.member_preferences p where p.user_id = auth.uid()),
    'health_profile', (select to_jsonb(h) - 'user_id' from public.member_health_profile h where h.user_id = auth.uid()),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('purpose', purpose, 'granted', granted, 'version', version, 'at', at) order by id) from public.consents where user_id = auth.uid()), '[]'),
    'credit_ledger', coalesce((select jsonb_agg(jsonb_build_object('source', source, 'type', entry_type, 'amount', amount, 'note', note, 'at', created_at) order by id) from public.credit_ledger where user_id = auth.uid()), '[]'),
    'ai_conversations', coalesce((select jsonb_agg(jsonb_build_object('operation', operation_key, 'request', request_text, 'response', response_text, 'status', status, 'at', created_at) order by created_at) from public.ai_jobs where user_id = auth.uid()), '[]'));
end $$;

-- ============================================================ owner-configurable commerce (all values PROVISIONAL until the owner approves them)
create table public.plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,30}$'),
  name_ar text not null, name_en text not null,
  price_kwd numeric(10,3) not null default 0 check (price_kwd >= 0 and price_kwd <= 1000),
  monthly_credits int check (monthly_credits is null or monthly_credits between 0 and 100000000),   -- null = fair-use governed (see fair_use)
  fair_use jsonb not null default '{}' check (pg_column_size(fair_use) < 2048),
  pause_eligible boolean not null default false, enabled boolean not null default true,
  provisional boolean not null default true, sort_order int not null default 0, updated_at timestamptz not null default now()
);
insert into public.plans (key, name_ar, name_en, price_kwd, monthly_credits, fair_use, pause_eligible, sort_order) values
  ('essential', 'النشاط', 'Essential', 7.000, 10000, '{"requests_per_hour":30,"daily_quick":100,"daily_plans":3}', false, 1),
  ('pro', 'التحدي', 'Pro', 14.000, 25000, '{"requests_per_hour":40,"daily_quick":200,"daily_plans":5}', true, 2),
  ('elite', 'النخبة', 'Elite', 26.000, 55000, '{"requests_per_hour":50,"daily_quick":300,"daily_plans":8}', true, 3),
  ('vip', 'VIP', 'VIP', 39.000, null, '{"requests_per_hour":60,"daily_quick":300,"daily_plans":10,"daily_images":30,"monthly_provider_spend_usd":15}', true, 4);
create table public.feature_flags (key text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'), enabled boolean not null default false, high_risk boolean not null default false, updated_at timestamptz not null default now());
insert into public.feature_flags (key, enabled, high_risk) values ('ai_coach_enabled', false, false), ('wallet_enabled', false, false), ('subscriptions_visible', false, false),
  ('live_ai_enabled', false, true), ('payments_enabled', false, true), ('human_coach_purchasing', true, false);
alter table public.plans enable row level security; alter table public.feature_flags enable row level security;
revoke all on public.plans, public.feature_flags from anon, authenticated, service_role;
grant select on public.plans, public.feature_flags to anon, authenticated, service_role;
create policy "Everyone reads enabled plans" on public.plans for select to anon, authenticated, service_role using (enabled);
create policy "Everyone reads feature flags" on public.feature_flags for select to anon, authenticated, service_role using (true);

-- step-up: owner actions with money/security impact need a TOTP verification in the last 10 minutes (JWT amr history)
create function public.owner_step_up_ok() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select max((e ->> 'timestamp')::bigint) from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e where e ->> 'method' = 'totp'), 0) > extract(epoch from now())::bigint - 600;
$$;
create function public.owner_guard(p_high_risk boolean) returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_high_risk and not public.owner_step_up_ok() then raise exception 'recent multi-factor verification required' using errcode = 'PO001'; end if;
end $$;

create function public.owner_set_operation_cost(p_key text, p_credits int, p_enabled boolean) returns void language plpgsql security definer set search_path = public as $$
declare old record;
begin
  perform public.owner_guard(true);
  if p_credits not between 0 and 1000000 then raise exception 'credits out of range' using errcode = '22023'; end if;
  select * into old from public.ai_operations where key = p_key; if not found then raise exception 'unknown operation' using errcode = 'P0002'; end if;
  update public.ai_operations set credits = p_credits, enabled = p_enabled, updated_at = now() where key = p_key;
  perform public.log_audit('ai_operation.update', 'ai_operation', p_key, jsonb_build_object('old', jsonb_build_object('credits', old.credits, 'enabled', old.enabled), 'new', jsonb_build_object('credits', p_credits, 'enabled', p_enabled)));
end $$;
create function public.owner_set_credit_settings(p_trial int, p_ttl_minutes int) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_guard(true);
  if p_trial not between 0 and 100000 or p_ttl_minutes not between 1 and 120 then raise exception 'value out of range' using errcode = '22023'; end if;
  update public.credit_settings set trial_credits = p_trial, reservation_ttl_minutes = p_ttl_minutes, updated_at = now() where id = 1;
  perform public.log_audit('credit_settings.update', 'credit_settings', '1', jsonb_build_object('trial', p_trial, 'ttl', p_ttl_minutes));
end $$;
create function public.owner_set_ai_budget(p_live boolean, p_monthly_cap_micro bigint, p_per_call_cap_micro bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_guard(true);
  if p_monthly_cap_micro < 0 or p_per_call_cap_micro < 0 or p_monthly_cap_micro > 1000000000 then raise exception 'budget out of range' using errcode = '22023'; end if;   -- hard ceiling: 1,000 USD
  if p_live and (p_monthly_cap_micro = 0 or p_per_call_cap_micro = 0) then raise exception 'live calls need a monthly and a per-call cap' using errcode = '22023'; end if;
  update public.ai_budget set live_calls_enabled = p_live, monthly_cap_usd_micro = p_monthly_cap_micro, per_call_cap_usd_micro = p_per_call_cap_micro, updated_at = now() where id = 1;
  perform public.log_audit('ai_budget.update', 'ai_budget', '1', jsonb_build_object('live', p_live, 'monthly_micro', p_monthly_cap_micro, 'per_call_micro', p_per_call_cap_micro));
end $$;
create function public.owner_set_route(p_op text, p_provider text, p_model text, p_max_tokens int, p_fb_provider text, p_fb_model text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_guard(true);
  update public.ai_routes set provider = p_provider, model = left(p_model, 60), max_output_tokens = p_max_tokens, fallback_provider = p_fb_provider, fallback_model = left(p_fb_model, 60), updated_at = now() where operation_key = p_op;
  if not found then raise exception 'unknown operation' using errcode = 'P0002'; end if;
  perform public.log_audit('ai_route.update', 'ai_route', p_op, jsonb_build_object('provider', p_provider, 'model', p_model));
end $$;
create function public.owner_upsert_plan(p_key text, p_name_ar text, p_name_en text, p_price numeric, p_credits int, p_fair_use jsonb, p_pause boolean, p_enabled boolean, p_sort int) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_guard(true);
  insert into public.plans (key, name_ar, name_en, price_kwd, monthly_credits, fair_use, pause_eligible, enabled, sort_order, provisional)
  values (p_key, left(p_name_ar, 40), left(p_name_en, 40), p_price, p_credits, coalesce(p_fair_use, '{}'), p_pause, p_enabled, p_sort, true)
  on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, price_kwd = excluded.price_kwd, monthly_credits = excluded.monthly_credits,
    fair_use = excluded.fair_use, pause_eligible = excluded.pause_eligible, enabled = excluded.enabled, sort_order = excluded.sort_order, updated_at = now();
  perform public.log_audit('plan.upsert', 'plan', p_key, jsonb_build_object('price_kwd', p_price, 'monthly_credits', p_credits));
end $$;
create function public.owner_set_flag(p_key text, p_enabled boolean) returns void language plpgsql security definer set search_path = public as $$
declare f record;
begin
  select * into f from public.feature_flags where key = p_key; if not found then raise exception 'unknown flag' using errcode = 'P0002'; end if;
  perform public.owner_guard(f.high_risk);
  if p_key = 'live_ai_enabled' and p_enabled and not exists (select 1 from public.ai_budget where live_calls_enabled and monthly_cap_usd_micro > 0) then raise exception 'configure and enable the AI budget gate first' using errcode = '22023'; end if;
  update public.feature_flags set enabled = p_enabled, updated_at = now() where key = p_key;
  perform public.log_audit('flag.set', 'flag', p_key, jsonb_build_object('enabled', p_enabled));
end $$;
create function public.owner_credit_adjust(p_user uuid, p_source text, p_amount int, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.owner_guard(true);
  if p_amount = 0 or abs(p_amount) > 1000000 or char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'amount and a reason of at least 10 characters are required' using errcode = '22023'; end if;
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'user not found' using errcode = 'P0002'; end if;
  perform public.credit_lock_wallet(p_user);
  insert into public.credit_ledger (user_id, source, entry_type, amount, note) values (p_user, p_source, 'adjust', p_amount, left(btrim(p_reason), 120));
  perform public.log_audit('credit.adjust', 'user', p_user::text, jsonb_build_object('source', p_source, 'amount', p_amount, 'reason', left(btrim(p_reason), 200)));
end $$;
create function public.owner_get_commerce_config() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.owner_guard(false);
  return jsonb_build_object(
    'operations', (select coalesce(jsonb_agg(to_jsonb(o) order by key), '[]') from public.ai_operations o),
    'routes', (select coalesce(jsonb_agg(to_jsonb(r) order by operation_key), '[]') from public.ai_routes r),
    'credit_settings', (select to_jsonb(c) from public.credit_settings c where id = 1),
    'budget', (select to_jsonb(b) from public.ai_budget b where id = 1),
    'plans', (select coalesce(jsonb_agg(to_jsonb(p) order by sort_order), '[]') from public.plans p),
    'flags', (select coalesce(jsonb_agg(to_jsonb(f) order by key), '[]') from public.feature_flags f),
    'step_up_ok', public.owner_step_up_ok());
end $$;
create function public.owner_ai_usage_summary(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.owner_guard(false);
  return jsonb_build_object('days', p_days,
    'jobs', (select count(*) from public.ai_jobs where created_at > now() - make_interval(days => p_days)),
    'done', (select count(*) from public.ai_jobs where status = 'done' and created_at > now() - make_interval(days => p_days)),
    'failed', (select count(*) from public.ai_jobs where status = 'failed' and created_at > now() - make_interval(days => p_days)),
    'provider_cost_usd', (select coalesce(sum(cost_usd_micro), 0) / 1e6 from public.ai_jobs where created_at > now() - make_interval(days => p_days)),
    'by_operation', (select coalesce(jsonb_object_agg(operation_key, n), '{}') from (select operation_key, count(*) n from public.ai_jobs where created_at > now() - make_interval(days => p_days) group by 1) x));   -- aggregates only: never message content
end $$;
create function public.owner_list_security_events(p_limit int default 100) returns table (at timestamptz, user_id uuid, event text, details jsonb) language plpgsql stable security definer set search_path = public as $$
begin perform public.owner_guard(false); return query select e.at, e.user_id, e.event, e.details from public.security_events e order by e.id desc limit least(greatest(p_limit, 1), 500); end $$;
create function public.public_plans() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name_ar', name_ar, 'name_en', name_en, 'price_kwd', price_kwd, 'monthly_credits', monthly_credits, 'provisional', provisional, 'pause_eligible', pause_eligible) order by sort_order), '[]') from public.plans where enabled;
$$;
create function public.public_flags() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, enabled), '{}') from public.feature_flags where not high_risk;
$$;

-- ============================================================ privileges
revoke all on function
  public.security_event(uuid, text, jsonb), public.security_events_immutable(), public.device_code_hash(uuid, text), public.device_status(uuid, text, uuid), public.device_challenge_create(uuid, text, text, int),
  public.device_challenge_verify(uuid, text, text, uuid, text), public.device_revoke(uuid, uuid), public.has_consent(uuid, text), public.health_requires_consent(), public.m3_touch_updated_at(),
  public.owner_step_up_ok(), public.owner_guard(boolean), public.is_trusted_session(), public.consent_set(text, boolean, text), public.my_data_export(),
  public.owner_set_operation_cost(text, int, boolean), public.owner_set_credit_settings(int, int), public.owner_set_ai_budget(boolean, bigint, bigint), public.owner_set_route(text, text, text, int, text, text),
  public.owner_upsert_plan(text, text, text, numeric, int, jsonb, boolean, boolean, int), public.owner_set_flag(text, boolean), public.owner_credit_adjust(uuid, text, int, text),
  public.owner_get_commerce_config(), public.owner_ai_usage_summary(int), public.owner_list_security_events(int), public.public_plans(), public.public_flags() from public, anon, authenticated, service_role;
grant execute on function public.device_status(uuid, text, uuid), public.device_challenge_create(uuid, text, text, int), public.device_challenge_verify(uuid, text, text, uuid, text), public.device_revoke(uuid, uuid), public.security_event(uuid, text, jsonb) to service_role;
grant execute on function public.is_trusted_session(), public.consent_set(text, boolean, text), public.my_data_export() to authenticated;
grant execute on function public.owner_set_operation_cost(text, int, boolean), public.owner_set_credit_settings(int, int), public.owner_set_ai_budget(boolean, bigint, bigint), public.owner_set_route(text, text, text, int, text, text),
  public.owner_upsert_plan(text, text, text, numeric, int, jsonb, boolean, boolean, int), public.owner_set_flag(text, boolean), public.owner_credit_adjust(uuid, text, int, text),
  public.owner_get_commerce_config(), public.owner_ai_usage_summary(int), public.owner_list_security_events(int) to authenticated;
grant execute on function public.public_plans(), public.public_flags() to anon, authenticated, service_role;
-- the table owner's internal helpers (guards, hashing) stay un-granted; policies/definer functions call them as owner
grant execute on function public.is_trusted_session() to service_role;
commit;
