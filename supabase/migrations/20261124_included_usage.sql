-- VORA: subscribers' AI use is INCLUDED in the plan (fair use, counted per day) instead of an automatic VORA Coins grant.
-- Forward-only and additive: no table, column or function is dropped. Three existing functions are replaced with a superset of their
-- previous behaviour: trainer_access (three more keys), public_plans (two more keys); every earlier key and rule is unchanged.
--
-- OWNER DECISIONS implemented here:
--   A. No VORA Coins are distributed automatically to Monthly / Yearly subscribers. plans.monthly_credits stays as a column, so an
--      allocation can be configured later with the existing owner_upsert_plan(); until the owner sets a number, nothing is granted
--      (subscription_activate / purchase fulfilment grant only when monthly_credits > 0).
--   B. A subscriber's AI use is "included per plan": a configurable number of trainer requests per day (and, inside it, a number of
--      requests that carry an image / voice message / video). PROVISIONAL defaults 40 and 10; the owner edits them with
--      owner_set_plan_usage() (super admin + recent MFA step-up + audit log, like every other commerce setting).
-- The global provider budget gate (ai_budget) is untouched and still decides every live call: included usage never bypasses it.
begin;

-- ============================================================ 1. plans: no automatic coins, configurable daily fair use
alter table public.plans
  add column ai_daily_requests int default 40 check (ai_daily_requests is null or ai_daily_requests between 0 and 10000),   -- null = AI use is not included in this plan
  add column ai_daily_media int default 10 check (ai_daily_media is null or ai_daily_media between 0 and 10000);            -- image + audio + video together; null = no media included
update public.plans set monthly_credits = null, updated_at = now() where key in ('monthly', 'yearly');

-- Owner configuration of the included usage. p_daily_requests null = AI use not included (the plan is then billed in VORA Coins).
create function public.owner_set_plan_usage(p_key text, p_daily_requests int, p_daily_media int) returns void
language plpgsql security definer set search_path = public as $$
declare old record;
begin
  perform public.owner_guard(true);
  if p_daily_requests is not null and p_daily_requests not between 0 and 10000 then raise exception 'daily requests out of range' using errcode = '22023'; end if;
  if p_daily_media is not null and p_daily_media not between 0 and 10000 then raise exception 'daily media out of range' using errcode = '22023'; end if;
  select ai_daily_requests, ai_daily_media into old from public.plans where key = p_key;
  if not found then raise exception 'unknown plan' using errcode = 'P0002'; end if;
  update public.plans set ai_daily_requests = p_daily_requests, ai_daily_media = p_daily_media, updated_at = now() where key = p_key;
  perform public.log_audit('plan.usage', 'plan', p_key, jsonb_build_object(
    'old', jsonb_build_object('ai_daily_requests', old.ai_daily_requests, 'ai_daily_media', old.ai_daily_media),
    'new', jsonb_build_object('ai_daily_requests', p_daily_requests, 'ai_daily_media', p_daily_media)));
end $$;

-- same keys as before + ai_daily_requests, ai_daily_media
create or replace function public.public_plans() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name_ar', name_ar, 'name_en', name_en, 'price_kwd', price_kwd, 'monthly_credits', monthly_credits, 'provisional', provisional,
    'pause_eligible', pause_eligible, 'includes_nutrition', includes_nutrition, 'period_days', period_days,
    'ai_daily_requests', ai_daily_requests, 'ai_daily_media', ai_daily_media) order by sort_order, key), '[]') from public.plans where enabled;
$$;

-- ============================================================ 2. trainer_access: every earlier key and rule, plus billing / daily_requests / daily_media
-- billing: 'included' = a subscriber whose plan grants no coin allocation and has a daily request cap (no coins are reserved or charged);
--          'coins'    = a subscriber on a plan with a coin allocation (or without included usage), and the pay-as-you-go coins tier;
--          null       = trial / none.
create or replace function public.trainer_access(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st record; s record; t record; has_sub boolean; started boolean; ended boolean; remaining int; tier text; paid bigint; included boolean;
begin
  if p_user is null then raise exception 'user required' using errcode = '22023'; end if;
  select * into st from public.trainer_settings where id = 1;
  -- no "enabled" filter on plans: a plan that left the shop still entitles the members who paid for it until their period ends
  select sub.plan_key, sub.current_period_end, sub.auto_renew, coalesce(p.includes_nutrition, false) as nutrition, p.period_days,
         p.monthly_credits, p.ai_daily_requests, p.ai_daily_media into s
    from public.subscriptions sub join public.plans p on p.key = sub.plan_key
    where sub.user_id = p_user and sub.status = 'active' and sub.current_period_end > now();
  has_sub := found;
  included := has_sub and s.monthly_credits is null and s.ai_daily_requests is not null;
  select * into t from public.trainer_trials where user_id = p_user;
  started := found;
  ended := started and (t.ended_at is not null or t.messages_used >= st.trial_max_messages or t.started_at + make_interval(hours => st.trial_window_hours) <= now());
  remaining := case when not started then st.trial_max_messages when ended then 0 else st.trial_max_messages - t.messages_used end;
  -- Pay-as-you-go: a member holding PURCHASED VORA Coins may chat without a subscription (no plans, no nutrition, no library).
  -- Promotional credits alone never open the trainer; they stay in the ledger untouched and are spendable by paying members.
  paid := public.credit_source_balance(p_user, 'purchased');
  tier := case when has_sub then 'subscriber' when not ended then 'trial' when paid > 0 then 'coins' else 'none' end;
  return jsonb_build_object(
    'tier', tier,
    'purchased_coins', paid,
    'plan_key', case when has_sub then s.plan_key end,
    'nutrition', has_sub and s.nutrition,
    'library', has_sub,                                                        -- the advanced exercise library: subscribers only
    'period', case when has_sub then case when s.period_days >= 365 then 'yearly' else 'monthly' end end,
    'period_end', case when has_sub then s.current_period_end end,
    'auto_renew', case when has_sub then s.auto_renew end,
    'billing', case when included then 'included' when tier in ('subscriber', 'coins') then 'coins' end,
    'daily_requests', case when included then s.ai_daily_requests end,
    'daily_media', case when included then coalesce(s.ai_daily_media, 0) end,
    'trial', jsonb_build_object('available', not ended, 'started', started, 'conversation_id', case when started then t.conversation_id end, 'remaining', remaining,
      'ends_at', case when started then t.started_at + make_interval(hours => st.trial_window_hours) end, 'ended', ended, 'max_messages', st.trial_max_messages));
end $$;

-- ============================================================ 3. the daily counter (server-side, atomic; no API role can read or write the table)
create table public.trainer_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,                                   -- the Kuwait calendar day (trainer_usage_day())
  requests int not null default 0 check (requests >= 0),
  media int not null default 0 check (media >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.trainer_usage enable row level security;
revoke all on public.trainer_usage from public, anon, authenticated, service_role;

-- "Today" for the daily caps: the calendar day in Kuwait (UTC+3, no daylight saving), so the counter resets at local midnight.
create function public.trainer_usage_day() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Kuwait')::date;
$$;

-- Takes ONE request (and, with p_media, one media unit) of today's included usage. Atomic: an advisory lock per member plus a row lock,
-- so two parallel calls at the last unit cannot both pass. The caps are read from the caller's CURRENT plan at the moment of the call.
-- Refuses (allowed = false) when the member is not an included-billing subscriber; nothing is counted on a refusal.
create function public.trainer_usage_consume(p_user uuid, p_media boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb; d date; u record; cap_r int; cap_m int; m int := case when coalesce(p_media, false) then 1 else 0 end;
begin
  if p_user is null then raise exception 'user required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trainer_usage:' || p_user::text, 41));
  a := public.trainer_access(p_user);
  if a ->> 'billing' is distinct from 'included' then
    return jsonb_build_object('allowed', false, 'reason', 'not_included', 'remaining_requests', 0, 'remaining_media', 0);
  end if;
  cap_r := (a ->> 'daily_requests')::int; cap_m := coalesce((a ->> 'daily_media')::int, 0);
  d := public.trainer_usage_day();
  insert into public.trainer_usage (user_id, day) values (p_user, d) on conflict (user_id, day) do nothing;
  select * into u from public.trainer_usage where user_id = p_user and day = d for update;
  if u.requests >= cap_r then
    return jsonb_build_object('allowed', false, 'reason', 'daily_limit_reached', 'remaining_requests', 0, 'remaining_media', 0);
  end if;
  if m = 1 and u.media >= cap_m then
    return jsonb_build_object('allowed', false, 'reason', 'daily_media_limit_reached', 'remaining_requests', cap_r - u.requests, 'remaining_media', 0);
  end if;
  update public.trainer_usage set requests = requests + 1, media = media + m, updated_at = now() where user_id = p_user and day = d;
  return jsonb_build_object('allowed', true, 'remaining_requests', cap_r - u.requests - 1,
    'remaining_media', greatest(0, least(cap_m - u.media - m, cap_r - u.requests - 1)));
end $$;

-- Gives ONE request (and, with p_media, one media unit) back after a request that produced no usable answer. Never below zero.
create function public.trainer_usage_refund(p_user uuid, p_media boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_user is null then raise exception 'user required' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('trainer_usage:' || p_user::text, 41));
  update public.trainer_usage set requests = requests - 1, media = greatest(0, media - case when coalesce(p_media, false) then 1 else 0 end), updated_at = now()
   where user_id = p_user and day = public.trainer_usage_day() and requests > 0;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- For the app UI: today's included usage of the caller (used / remaining). Like my_trainer_access() it needs a login only.
create function public.my_trainer_usage() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a jsonb; u record; used_r int := 0; used_m int := 0; cap_r int; cap_m int; d date := public.trainer_usage_day();
begin
  if auth.uid() is null then raise exception 'login required' using errcode = '42501'; end if;
  a := public.trainer_access(auth.uid());
  if a ->> 'billing' is distinct from 'included' then
    return jsonb_build_object('billing', a -> 'billing', 'included', false, 'day', d);
  end if;
  cap_r := (a ->> 'daily_requests')::int; cap_m := coalesce((a ->> 'daily_media')::int, 0);
  select requests, media into u from public.trainer_usage where user_id = auth.uid() and day = d;
  if found then used_r := u.requests; used_m := u.media; end if;
  return jsonb_build_object('billing', 'included', 'included', true, 'day', d,
    'daily_requests', cap_r, 'daily_media', cap_m, 'used_requests', used_r, 'used_media', used_m,
    'remaining_requests', greatest(0, cap_r - used_r), 'remaining_media', greatest(0, least(cap_m - used_m, cap_r - used_r)),
    'resets_at', ((d + 1)::timestamp at time zone 'Asia/Kuwait'));
end $$;

-- Housekeeping (cron): the counter is only needed for the current day; older rows are removed after p_older.
create function public.trainer_usage_purge(p_older interval default interval '90 days') returns int
language sql security definer set search_path = public as $$
  with d as (delete from public.trainer_usage where day < (public.trainer_usage_day() - p_older)::date returning 1) select count(*)::int from d;
$$;

-- ============================================================ 4. routing: the Gemini model for voice messages and video
-- gemini-2.5-flash is deprecated by Google (from 2026-12-01 its requests are routed to gemini-3.5-flash-lite and billed at that model's
-- rates). The routes name the replacement explicitly so the model and the price table in the Edge Function agree. Nothing runs live
-- until the budget gate and the function's own switch are on.
update public.ai_routes set model = 'gemini-3.5-flash-lite', updated_at = now() where provider = 'gemini' and model = 'gemini-2.5-flash';
update public.ai_routes set fallback_model = 'gemini-3.5-flash-lite', updated_at = now() where fallback_provider = 'gemini' and fallback_model = 'gemini-2.5-flash';

-- ============================================================ 5. deny by default, then grant precisely
-- (public_plans and trainer_access were replaced in place: their grants are unchanged.)
revoke all on function public.owner_set_plan_usage(text, int, int), public.trainer_usage_day(), public.trainer_usage_consume(uuid, boolean),
  public.trainer_usage_refund(uuid, boolean), public.my_trainer_usage(), public.trainer_usage_purge(interval) from public, anon, authenticated, service_role;
grant execute on function public.owner_set_plan_usage(text, int, int), public.my_trainer_usage() to authenticated;
grant execute on function public.trainer_usage_consume(uuid, boolean), public.trainer_usage_refund(uuid, boolean), public.trainer_usage_purge(interval) to service_role;
commit;
