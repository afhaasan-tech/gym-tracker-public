-- VORA Phase 1 / milestone 4 (forward-only): TWO trusted devices / active sessions per account, ONE AI Personal Trainer
-- (free accounts: exactly one server-limited trial conversation; ongoing coaching: an active paid subscription; nutrition only on
-- eligible plans), subscriptions, and support tickets as a normal app feature (a form, not an AI).
-- Nothing from earlier milestones is dropped except the two ai_routes CHECK constraints, which are replaced by wider ones (a CHECK
-- constraint cannot be altered in place). The credit wallet / ledger / reservations are NOT modified: this migration contains no
-- UPDATE or DELETE on them; credits are only ever added through the existing credit_grant().
-- user_session_state stays in place (and keeps mirroring the most recent activation) but no longer decides trust.
begin;

-- ============================================================ 1. up to two active, device-verified sessions per user
create table if not exists public.user_active_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  device_id uuid references public.trusted_devices(id) on delete cascade,
  activated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, session_id)
);
create unique index if not exists user_active_sessions_device_uidx on public.user_active_sessions (device_id) where device_id is not null;   -- one row per device
alter table public.user_active_sessions enable row level security;
revoke all on public.user_active_sessions from public, anon, authenticated, service_role;

-- backfill: whoever is trusted today stays trusted
insert into public.user_active_sessions (user_id, session_id, device_id, activated_at)
select s.user_id, s.active_session_id, s.active_device_id, s.updated_at from public.user_session_state s where s.active_session_id is not null
on conflict do nothing;

-- A session is "trusted" if it is one of the (at most two) active sessions of its user and its device was not revoked.
create or replace function public.is_trusted_session() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_active_sessions s left join public.trusted_devices d on d.id = s.device_id
                 where s.user_id = auth.uid() and s.session_id::text = coalesce(auth.jwt() ->> 'session_id', '')
                   and (s.device_id is null or d.revoked_at is null));
$$;

-- Internal: makes p_session the active session of p_device (replacing that device's previous session) and keeps at most
-- two active sessions per user; the least recently activated one is evicted. Callers hold the per-user lock.
create or replace function public.device_session_activate(p_user uuid, p_device uuid, p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  delete from public.user_active_sessions where user_id = p_user and (device_id = p_device or session_id = p_session);
  insert into public.user_active_sessions (user_id, session_id, device_id, activated_at) values (p_user, p_session, p_device, clock_timestamp());
  for r in select session_id, device_id from public.user_active_sessions where user_id = p_user and session_id <> p_session
           order by activated_at desc, session_id offset 1 loop
    delete from public.user_active_sessions where user_id = p_user and session_id = r.session_id;
    perform public.security_event(p_user, 'session.evicted', jsonb_build_object('device', r.device_id, 'by_device', p_device));
  end loop;
  insert into public.user_session_state (user_id, active_session_id, active_device_id) values (p_user, p_session, p_device)   -- legacy mirror only
  on conflict (user_id) do update set active_session_id = excluded.active_session_id, active_device_id = excluded.active_device_id, updated_at = now();
end $$;

-- returns 'trusted' (and makes this session the active one OF THIS DEVICE) or 'challenge_required'
create or replace function public.device_status(p_user uuid, p_device_hash text, p_session uuid) returns text
language plpgsql security definer set search_path = public as $$
declare d record;
begin
  perform pg_advisory_xact_lock(hashtextextended('device:' || p_user::text, 19));
  select * into d from public.trusted_devices where user_id = p_user and device_hash = p_device_hash and revoked_at is null;
  if not found then return 'challenge_required'; end if;
  update public.trusted_devices set last_seen_at = now() where id = d.id;
  perform public.device_session_activate(p_user, d.id, p_session);
  perform public.security_event(p_user, 'session.activated', jsonb_build_object('device', d.id));
  return 'trusted';
end $$;

create or replace function public.device_challenge_verify(p_user uuid, p_device_hash text, p_code text, p_session uuid, p_label text) returns boolean
language plpgsql security definer set search_path = public as $$
declare c record; dev uuid; r record;
begin
  perform pg_advisory_xact_lock(hashtextextended('device:' || p_user::text, 19));
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
  -- at most TWO trusted devices: besides the one just verified only the most recently seen other device survives
  for r in select id from public.trusted_devices where user_id = p_user and revoked_at is null and id <> dev
           order by last_seen_at desc, created_at desc, id offset 1 loop
    update public.trusted_devices set revoked_at = now() where id = r.id;
    delete from public.user_active_sessions where user_id = p_user and device_id = r.id;
    perform public.security_event(p_user, 'device.evicted', jsonb_build_object('device', r.id, 'by_device', dev));
  end loop;
  perform public.device_session_activate(p_user, dev, p_session);
  perform public.security_event(p_user, 'device.trusted', jsonb_build_object('device', dev));
  return true;
end $$;

create or replace function public.device_revoke(p_user uuid, p_device uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('device:' || p_user::text, 19));
  update public.trusted_devices set revoked_at = now() where id = p_device and user_id = p_user;
  delete from public.user_active_sessions where user_id = p_user and device_id = p_device;
  update public.user_session_state set active_session_id = null where user_id = p_user and active_device_id = p_device;
  perform public.security_event(p_user, 'device.revoked', jsonb_build_object('device', p_device));
end $$;

-- ============================================================ 2. the trainer: prices, routes, job columns (all PROVISIONAL, owner-configurable)
insert into public.ai_operations (key, label_ar, label_en, credits) values
  ('trainer_message', 'رسالة للمدرب', 'Trainer message', 50),
  ('trainer_image', 'تحليل صورة مع المدرب', 'Trainer image analysis', 300),
  ('trainer_audio', 'رسالة صوتية للمدرب', 'Trainer voice message', 100),
  ('trainer_video', 'تحليل فيديو مع المدرب', 'Trainer video analysis', 500)
on conflict (key) do nothing;

alter table public.ai_routes drop constraint if exists ai_routes_provider_check;
alter table public.ai_routes drop constraint if exists ai_routes_fallback_provider_check;
alter table public.ai_routes add constraint ai_routes_provider_check check (provider in ('mock','anthropic','gemini'));
alter table public.ai_routes add constraint ai_routes_fallback_provider_check check (fallback_provider in ('mock','anthropic','gemini'));

-- Planned live routing; nothing runs live until the budget gate and the function's own switch are on.
insert into public.ai_routes (operation_key, provider, model, max_output_tokens) values
  ('trainer_message', 'anthropic', 'claude-haiku-5-5', 3000),
  ('trainer_image', 'anthropic', 'claude-sonnet-5-5', 3000),
  ('trainer_audio', 'gemini', 'gemini-2.5-flash', 3000),
  ('trainer_video', 'gemini', 'gemini-2.5-flash', 3000)
on conflict (operation_key) do nothing;

alter table public.ai_jobs add column if not exists conversation_id uuid;
alter table public.ai_jobs add column if not exists tier text check (tier in ('trial','subscriber','coins'));
alter table public.ai_jobs add column if not exists media_kinds text[];          -- kinds only ('image' ...): media itself is never stored
grant select (conversation_id, tier, media_kinds) on public.ai_jobs to authenticated;

-- ============================================================ 3. plans: nutrition entitlement (provisional default)
alter table public.plans add column if not exists includes_nutrition boolean not null default false;
update public.plans set includes_nutrition = true where key in ('pro','elite','vip');
create or replace function public.public_plans() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name_ar', name_ar, 'name_en', name_en, 'price_kwd', price_kwd, 'monthly_credits', monthly_credits, 'provisional', provisional, 'pause_eligible', pause_eligible, 'includes_nutrition', includes_nutrition) order by sort_order), '[]') from public.plans where enabled;
$$;

-- ============================================================ 4. subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null references public.plans(key),
  status text not null check (status in ('active','past_due','cancelled','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz not null,
  auto_renew boolean not null default true,
  provider text,
  provider_customer_token text,           -- payment-provider tokens: never readable by any client role
  provider_card_token text,
  activation_key text check (activation_key is null or char_length(activation_key) between 8 and 80),   -- idempotency of subscription_activate
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists subscriptions_one_active_uidx on public.subscriptions (user_id) where status = 'active';
create unique index if not exists subscriptions_activation_uidx on public.subscriptions (user_id, activation_key) where activation_key is not null;
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
alter table public.subscriptions enable row level security;
revoke all on public.subscriptions from public, anon, authenticated, service_role;
grant select (id, user_id, plan_key, status, current_period_start, current_period_end, auto_renew, provider, created_at, updated_at) on public.subscriptions to authenticated;
create policy "Members read own subscriptions (trusted session)" on public.subscriptions for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_trusted_session()));

-- Activates p_plan for p_user until p_period_end and grants the plan's monthly credits ONCE per p_idem (existing credit_grant, source 'subscription').
-- A repeated call with the same p_idem changes nothing and returns the same subscription id.
create or replace function public.subscription_activate(p_user uuid, p_plan text, p_period_end timestamptz, p_auto_renew boolean, p_idem text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; pl record;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'unknown user' using errcode = '22023'; end if;
  if p_idem is null or char_length(p_idem) not between 8 and 80 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  if p_period_end is null or p_period_end <= now() then raise exception 'period end must be in the future' using errcode = '22023'; end if;
  select key, monthly_credits into pl from public.plans where key = p_plan and enabled;
  if not found then raise exception 'unknown plan' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('subscription:' || p_user::text, 23));
  select id into sid from public.subscriptions where user_id = p_user and activation_key = p_idem;
  if found then return sid; end if;
  update public.subscriptions set status = 'expired', auto_renew = false, updated_at = now() where user_id = p_user and status = 'active';
  insert into public.subscriptions (user_id, plan_key, status, current_period_start, current_period_end, auto_renew, activation_key)
  values (p_user, pl.key, 'active', now(), p_period_end, coalesce(p_auto_renew, true), p_idem) returning id into sid;
  if pl.monthly_credits is not null and pl.monthly_credits > 0 then
    perform public.credit_grant(p_user, 'subscription', pl.monthly_credits, 'grant', p_idem, 'subscription ' || pl.key);
  end if;
  perform public.security_event(p_user, 'subscription.activated', jsonb_build_object('subscription', sid, 'plan', pl.key, 'period_end', p_period_end));
  return sid;
end $$;

-- The member turns renewal off; access continues until the end of the paid period.
create or replace function public.cancel_auto_renewal() returns boolean
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); sid uuid;
begin
  if u is null or not public.is_trusted_session() then raise exception 'trusted session required' using errcode = '42501'; end if;
  update public.subscriptions set auto_renew = false, updated_at = now() where user_id = u and status = 'active' and auto_renew returning id into sid;
  if sid is null then return false; end if;
  perform public.security_event(u, 'subscription.auto_renew_cancelled', jsonb_build_object('subscription', sid));
  return true;
end $$;

-- Housekeeping (cron / webhook): active rows whose period is over become 'expired'. Credits are NOT touched.
create or replace function public.subscriptions_expire_due() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.subscriptions set status = 'expired', updated_at = now() where status = 'active' and current_period_end <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- ============================================================ 5. the free trial conversation + trainer access
create table if not exists public.trainer_settings (
  id int primary key default 1 check (id = 1),
  trial_max_messages int not null default 10 check (trial_max_messages between 1 and 50),
  trial_window_hours int not null default 24 check (trial_window_hours between 1 and 168),
  updated_at timestamptz not null default now()
);
insert into public.trainer_settings default values on conflict (id) do nothing;
-- The primary key IS the rule "exactly one trial per account, ever" (rows are never deleted while the account exists).
create table if not exists public.trainer_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  started_at timestamptz not null default now(),
  messages_used int not null default 0 check (messages_used >= 0),
  ended_at timestamptz
);
alter table public.trainer_settings enable row level security; alter table public.trainer_trials enable row level security;
revoke all on public.trainer_settings, public.trainer_trials from public, anon, authenticated, service_role;

create or replace function public.trainer_access(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st record; s record; t record; has_sub boolean; started boolean; ended boolean; remaining int; tier text; paid bigint;
begin
  if p_user is null then raise exception 'user required' using errcode = '22023'; end if;
  select * into st from public.trainer_settings where id = 1;
  select sub.plan_key, sub.current_period_end, sub.auto_renew, coalesce(p.includes_nutrition, false) as nutrition into s
    from public.subscriptions sub join public.plans p on p.key = sub.plan_key
    where sub.user_id = p_user and sub.status = 'active' and sub.current_period_end > now();
  has_sub := found;
  select * into t from public.trainer_trials where user_id = p_user;
  started := found;
  ended := started and (t.ended_at is not null or t.messages_used >= st.trial_max_messages or t.started_at + make_interval(hours => st.trial_window_hours) <= now());
  remaining := case when not started then st.trial_max_messages when ended then 0 else st.trial_max_messages - t.messages_used end;
  -- Pay-as-you-go: a member holding PURCHASED VORA Coins may chat without a subscription (no plans, no nutrition).
  -- Promotional credits alone never open the trainer; they stay in the ledger untouched and are spendable by paying members.
  paid := public.credit_source_balance(p_user, 'purchased');
  tier := case when has_sub then 'subscriber' when not ended then 'trial' when paid > 0 then 'coins' else 'none' end;
  return jsonb_build_object(
    'tier', tier,
    'purchased_coins', paid,
    'plan_key', case when has_sub then s.plan_key end,
    'nutrition', has_sub and s.nutrition,
    'period_end', case when has_sub then s.current_period_end end,
    'auto_renew', case when has_sub then s.auto_renew end,
    'trial', jsonb_build_object('available', not ended, 'started', started, 'conversation_id', case when started then t.conversation_id end, 'remaining', remaining,
      'ends_at', case when started then t.started_at + make_interval(hours => st.trial_window_hours) end, 'ended', ended, 'max_messages', st.trial_max_messages));
end $$;

-- For the app UI. Deliberately works WITHOUT a trusted session (it only says which tier the caller is on; no tokens, no history).
create or replace function public.my_trainer_access() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '42501'; end if;
  return public.trainer_access(auth.uid());
end $$;

-- One trial message. Atomic (row lock): the first call starts the trial and binds it to p_conversation for good.
create or replace function public.trainer_trial_consume(p_user uuid, p_conversation uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st record; t record; fresh int;
begin
  if p_user is null or p_conversation is null then raise exception 'user and conversation required' using errcode = '22023'; end if;
  select * into st from public.trainer_settings where id = 1;
  insert into public.trainer_trials (user_id, conversation_id) values (p_user, p_conversation) on conflict (user_id) do nothing;
  get diagnostics fresh = row_count;
  select * into t from public.trainer_trials where user_id = p_user for update;
  if t.conversation_id <> p_conversation then return jsonb_build_object('allowed', false, 'reason', 'trial_ended', 'remaining', 0); end if;
  if t.ended_at is not null or t.messages_used >= st.trial_max_messages or t.started_at + make_interval(hours => st.trial_window_hours) <= now() then
    if t.ended_at is null then
      update public.trainer_trials set ended_at = now() where user_id = p_user;
      perform public.security_event(p_user, 'trainer.trial_ended', jsonb_build_object('messages_used', t.messages_used));
    end if;
    return jsonb_build_object('allowed', false, 'reason', 'trial_ended', 'remaining', 0);
  end if;
  update public.trainer_trials set messages_used = messages_used + 1 where user_id = p_user;
  if fresh = 1 then perform public.security_event(p_user, 'trainer.trial_started', jsonb_build_object('conversation', p_conversation)); end if;
  return jsonb_build_object('allowed', true, 'remaining', st.trial_max_messages - t.messages_used - 1);
end $$;

-- Gives ONE message back after a confirmed provider failure (the time window is never extended).
create or replace function public.trainer_trial_refund(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare st record; n int;
begin
  select * into st from public.trainer_settings where id = 1;
  update public.trainer_trials set messages_used = messages_used - 1,
    ended_at = case when started_at + make_interval(hours => st.trial_window_hours) > now() then null else ended_at end
  where user_id = p_user and messages_used > 0;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- ============================================================ 6. support tickets (a normal app feature: a form, not an AI)
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_ref text not null unique check (ticket_ref ~ '^VR-[A-Z0-9]{6}$'),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('billing','technical','device_limit','renewal','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  summary text not null check (char_length(summary) between 1 and 1000),
  transcript jsonb not null default '[]',
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  retain_until timestamptz not null default (now() + interval '6 months')
);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from public, anon, authenticated, service_role;
grant select on public.support_tickets to authenticated;
create policy "Members read own support tickets (trusted session)" on public.support_tickets for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_trusted_session()));

-- Server-side write path (service key), e.g. for staff tooling. Returns created_at.
create or replace function public.support_ticket_create(p_user uuid, p_ref text, p_category text, p_priority text, p_summary text, p_transcript jsonb) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t timestamptz; tr jsonb := coalesce(p_transcript, '[]'::jsonb);
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'unknown user' using errcode = '22023'; end if;
  if jsonb_typeof(tr) <> 'array' or jsonb_array_length(tr) > 40 or octet_length(tr::text) > 40000 then raise exception 'invalid transcript' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_summary, '')), '') is null then raise exception 'summary required' using errcode = '22023'; end if;
  insert into public.support_tickets (ticket_ref, user_id, category, priority, summary, transcript)
  values (p_ref, p_user, p_category, coalesce(p_priority, 'normal'), left(btrim(p_summary), 1000), tr)
  returning created_at into t;
  perform public.security_event(p_user, 'support.ticket_created', jsonb_build_object('ref', p_ref, 'category', p_category));
  return t;
end $$;

-- The member's form. Needs a confirmed e-mail but NOT a trusted session (a member locked out of a device must still be able to ask for help).
-- At most 5 tickets per member per 24 hours. Returns the ticket reference (VR-XXXXXX, unambiguous alphabet).
create or replace function public.support_ticket_open(p_category text, p_summary text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); s text := btrim(coalesce(p_summary, '')); alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; ref text; raw bytea; i int; tries int := 0;
begin
  if u is null then raise exception 'login required' using errcode = '42501'; end if;
  if not exists (select 1 from auth.users where id = u and email_confirmed_at is not null) then raise exception 'email not verified' using errcode = '42501'; end if;
  if p_category is null or p_category not in ('billing','technical','device_limit','renewal','other') then raise exception 'invalid category' using errcode = '22023'; end if;
  if char_length(s) < 10 or char_length(s) > 1000 then raise exception 'summary must be 10 to 1000 characters' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ticket:' || u::text, 29));
  if (select count(*) from public.support_tickets where user_id = u and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'ticket_limit_reached' using errcode = 'PT001';
  end if;
  loop
    raw := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid()); ref := 'VR-';
    for i in 0..31 loop
      continue when i % 16 in (6, 8);                                   -- the two bytes of a v4 uuid that are not fully random
      if get_byte(raw, i) < 248 and char_length(ref) < 9 then ref := ref || substr(alphabet, get_byte(raw, i) % 31 + 1, 1); end if;   -- 248 = 8 * 31: unbiased
    end loop;
    tries := tries + 1;
    continue when char_length(ref) < 9 and tries < 8;
    begin
      insert into public.support_tickets (ticket_ref, user_id, category, summary) values (ref, u, p_category, s);
      exit;
    exception when unique_violation then
      if tries >= 8 then raise; end if;
    end;
  end loop;
  perform public.security_event(u, 'support.ticket_created', jsonb_build_object('ref', ref, 'category', p_category));
  return ref;
end $$;

-- ============================================================ 7. deny by default, then grant precisely
revoke all on function public.is_trusted_session(), public.device_session_activate(uuid, uuid, uuid), public.device_status(uuid, text, uuid),
  public.device_challenge_verify(uuid, text, text, uuid, text), public.device_revoke(uuid, uuid),
  public.support_ticket_create(uuid, text, text, text, text, jsonb), public.support_ticket_open(text, text),
  public.subscription_activate(uuid, text, timestamptz, boolean, text), public.cancel_auto_renewal(), public.subscriptions_expire_due(),
  public.trainer_access(uuid), public.my_trainer_access(), public.trainer_trial_consume(uuid, uuid), public.trainer_trial_refund(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.device_status(uuid, text, uuid), public.device_challenge_verify(uuid, text, text, uuid, text), public.device_revoke(uuid, uuid),
  public.support_ticket_create(uuid, text, text, text, text, jsonb),
  public.subscription_activate(uuid, text, timestamptz, boolean, text), public.subscriptions_expire_due(),
  public.trainer_access(uuid), public.trainer_trial_consume(uuid, uuid), public.trainer_trial_refund(uuid) to service_role;
grant execute on function public.is_trusted_session() to authenticated, service_role;
grant execute on function public.cancel_auto_renewal(), public.my_trainer_access(), public.support_ticket_open(text, text) to authenticated;
commit;
