-- VORA Phase 1 / milestone 6 (forward-only, additive): the exercise library and the MONTHLY / YEARLY plans.
-- Access levels (all enforced here, on the server):
--   Free            -> basic muscle info (public_muscles) + the ONE limited trial conversation (unchanged, 20261119)
--   VORA Coins      -> occasional AI chat paid per request; nothing premium
--   Monthly/Yearly  -> the advanced exercise library (premium_exercises / premium_exercise) + the full personalised trainer + nutrition
-- There is NO automatic renewal (purchase orders keep auto_renew = false, 20261120).
-- Nothing is dropped. Existing tables only gain one column (plans.period_days); the four old plans and the three old coin packs are
-- switched off (rows kept: running subscriptions on them keep working, old orders keep their snapshots). Three functions are
-- replaced with a superset of their previous behaviour: trainer_access (two more keys), public_plans (one more key) and
-- purchase_create (the period now comes from the plan instead of a constant 30).
-- The library CONTENT is not in this file: it arrives in 20261122_exercise_library_seed.sql.
begin;

-- ============================================================ 1. muscles (free content) + exercise library (subscribers only)
create table public.muscles (
  id text primary key check (id in ('back','chest','shoulders','biceps','triceps','forearms','hips','calf','abs')),
  name_ar text not null, name_en text not null,
  location_ar text not null, location_en text not null,
  function_ar text not null, function_en text not null,
  summary_ar text not null, summary_en text not null,
  sort_order int not null default 0
);

create table public.exercise_library (
  id text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  name_ar text not null, name_en text not null,
  primary_muscle text not null references public.muscles(id),
  secondary_muscles text[] not null default '{}',
  equipment_ar text not null, equipment_en text not null,
  difficulty text not null check (difficulty in ('beginner','intermediate','advanced')),
  environments text[] not null check (environments <@ array['gym','home'] and cardinality(environments) >= 1),
  instructions_ar text[] not null, instructions_en text[] not null,
  cues_ar text[] not null, cues_en text[] not null,
  mistakes_ar text[] not null, mistakes_en text[] not null,
  safety_ar text not null, safety_en text not null,
  alternatives text[] not null default '{}',                 -- other exercise ids (resolved, and silently skipped when unknown or disabled)
  default_sets int not null check (default_sets between 1 and 10),
  default_reps text not null,
  rest_seconds int not null check (rest_seconds between 0 and 600),
  sources jsonb not null default '[]',                       -- [{org, title, year, url?}]
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','reviewed')),
  enabled boolean not null default true,
  sort_order int not null default 0
);
create index exercise_library_muscle_idx on public.exercise_library (primary_muscle, sort_order, id) where enabled;

-- No API role holds ANY table privilege on either table: everything is read through the SECURITY DEFINER functions below.
alter table public.muscles enable row level security;
alter table public.exercise_library enable row level security;
revoke all on public.muscles, public.exercise_library from public, anon, authenticated, service_role;

-- Free content: what each muscle is, where it is and what it does.
create function public.public_muscles() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name_ar', name_ar, 'name_en', name_en, 'location_ar', location_ar, 'location_en', location_en,
    'function_ar', function_ar, 'function_en', function_en, 'summary_ar', summary_ar, 'summary_en', summary_en, 'sort_order', sort_order) order by sort_order, id), '[]')
  from public.muscles;
$$;

-- The one gate of the advanced library: a logged-in member, on a trusted (device-verified) session, with a RUNNING subscription.
-- Raises 42501 'login required' | 'trusted session required' | 'subscription_required'. Not executable by any API role.
create function public.library_guard() returns void language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'login required' using errcode = '42501'; end if;
  if not public.is_trusted_session() then raise exception 'trusted session required' using errcode = '42501'; end if;
  if coalesce(public.trainer_access(u) ->> 'tier', '') <> 'subscriber' then raise exception 'subscription_required' using errcode = '42501'; end if;
end $$;

-- Full records of the enabled exercises, optionally for one muscle (primary) and / or one environment ('gym' | 'home').
create function public.premium_exercises(p_muscle text default null, p_environment text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.library_guard();
  if p_environment is not null and p_environment not in ('gym','home') then raise exception 'invalid environment' using errcode = '22023'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by m.sort_order, e.sort_order, e.id), '[]')
            from public.exercise_library e join public.muscles m on m.id = e.primary_muscle
           where e.enabled and (p_muscle is null or e.primary_muscle = p_muscle) and (p_environment is null or p_environment = any(e.environments)));
end $$;

-- One full record (NULL when the id is unknown or the exercise is disabled).
create function public.premium_exercise(p_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.library_guard();
  return (select to_jsonb(e) from public.exercise_library e where e.id = p_id and e.enabled);
end $$;

-- For the ai-trainer Edge Function (service role): the exercises the model is ALLOWED to choose from, as compact records.
-- p_muscles null / empty = a balanced set over all muscles. The result is interleaved by muscle (first exercise of every muscle,
-- then the second ...), so a small limit still covers every requested muscle. Alternatives are resolved to {id, name_ar, name_en}.
create function public.library_candidates(p_muscles text[], p_environment text, p_limit int default 12) returns jsonb
language sql stable security definer set search_path = public as $$
  with ranked as (
    select e.*, m.sort_order as muscle_order, row_number() over (partition by e.primary_muscle order by e.sort_order, e.id) as rn
      from public.exercise_library e join public.muscles m on m.id = e.primary_muscle
     where e.enabled
       and (p_muscles is null or cardinality(p_muscles) = 0 or e.primary_muscle = any(p_muscles))
       and (p_environment is null or p_environment = any(e.environments))
  ), picked as (
    select * from ranked order by rn, muscle_order, id limit least(greatest(coalesce(p_limit, 12), 1), 40)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'name_ar', p.name_ar, 'name_en', p.name_en, 'primary_muscle', p.primary_muscle, 'secondary_muscles', p.secondary_muscles,
      'equipment_ar', p.equipment_ar, 'equipment_en', p.equipment_en, 'difficulty', p.difficulty, 'environments', p.environments,
      'default_sets', p.default_sets, 'default_reps', p.default_reps, 'rest_seconds', p.rest_seconds,
      'cues_ar', p.cues_ar, 'cues_en', p.cues_en, 'safety_ar', p.safety_ar, 'safety_en', p.safety_en,
      'alternatives', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name_ar', a.name_ar, 'name_en', a.name_en) order by x.ord), '[]')
                         from unnest(p.alternatives) with ordinality x(alt, ord) join public.exercise_library a on a.id = x.alt and a.enabled)
    ) order by p.rn, p.muscle_order, p.id), '[]')
  from picked p;
$$;

-- ============================================================ 2. plans: MONTHLY and YEARLY (manual renewal only)
alter table public.plans add column period_days int not null default 30 check (period_days between 1 and 366);

-- The four earlier plans leave the shop. The rows stay: a subscription that is still running on one of them keeps working
-- (trainer_access joins plans without looking at "enabled"); they simply cannot be bought or renewed any more.
update public.plans set enabled = false, updated_at = now() where key in ('essential','pro','elite','vip');

-- PLACEHOLDER PRICES: 7.000 and 70.000 KWD are NOT approved by the owner. They stay "provisional" until the owner sets the real ones
-- (owner_upsert_plan). Nothing can be charged in production before that: the checkout runs against the payment SANDBOX only.
-- monthly_credits is granted ONCE per paid period by subscription_activate(). For the yearly plan that means 120,000 VORA Coins
-- (12 x 10,000) in one grant at activation. RULE AWAITING OWNER CONFIRMATION: one grant up front versus 10,000 per month.
insert into public.plans (key, name_ar, name_en, price_kwd, monthly_credits, fair_use, pause_eligible, enabled, provisional, sort_order, includes_nutrition, period_days) values
  ('monthly', 'شهري', 'Monthly', 7.000, 10000, '{}', false, true, true, 1, true, 30),
  ('yearly', 'سنوي', 'Yearly', 70.000, 120000, '{}', false, true, true, 2, true, 365)
on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, price_kwd = excluded.price_kwd, monthly_credits = excluded.monthly_credits,
  enabled = true, provisional = true, sort_order = excluded.sort_order, includes_nutrition = true, period_days = excluded.period_days, updated_at = now();

-- same keys as before + period_days
create or replace function public.public_plans() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name_ar', name_ar, 'name_en', name_en, 'price_kwd', price_kwd, 'monthly_credits', monthly_credits, 'provisional', provisional,
    'pause_eligible', pause_eligible, 'includes_nutrition', includes_nutrition, 'period_days', period_days) order by sort_order, key), '[]') from public.plans where enabled;
$$;

-- Identical to the 20261120 version except for ONE line: a subscription order snapshots plans.period_days (it was the constant 30).
create or replace function public.purchase_create(p_user uuid, p_kind text, p_item text, p_idem text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.purchase_orders; v_price numeric; v_coins int; v_days int;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then raise exception 'unknown user' using errcode = 'PU001'; end if;
  if p_kind is null or p_kind not in ('coins','subscription') then raise exception 'invalid kind' using errcode = '22023'; end if;
  if p_item is null or p_item !~ '^[a-z][a-z0-9_]{2,30}$' then raise exception 'invalid item' using errcode = '22023'; end if;
  if p_idem is null or char_length(p_idem) not between 8 and 80 then raise exception 'invalid idempotency key' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('purchase:' || p_user::text, 31));     -- serialises double clicks / two tabs of one member

  select * into o from public.purchase_orders where user_id = p_user and idempotency_key = p_idem;
  if found then
    if o.kind <> p_kind or o.item_key <> p_item then raise exception 'idempotency key reused for another item' using errcode = 'PU004'; end if;
    return to_jsonb(o) || jsonb_build_object('reused', true);                           -- retry: the SAME order, with its ORIGINAL price
  end if;

  if not exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null) then raise exception 'email not verified' using errcode = 'PU003'; end if;
  if p_kind = 'coins' then
    select price_kwd, coins into v_price, v_coins from public.coin_packs where key = p_item and enabled;
    if not found then raise exception 'item is not available' using errcode = 'PU002'; end if;
  else
    select price_kwd, period_days into v_price, v_days from public.plans where key = p_item and enabled;
    if not found then raise exception 'item is not available' using errcode = 'PU002'; end if;
  end if;
  if v_price is null or round(v_price, 3) <= 0 then raise exception 'item is not purchasable' using errcode = 'PU002'; end if;
  if (select count(*) from public.purchase_orders where user_id = p_user and status = 'pending' and expires_at > now()) >= 5 then
    raise exception 'too many open orders' using errcode = 'PU005';
  end if;

  insert into public.purchase_orders (user_id, kind, item_key, amount_kwd, coins, period_days, idempotency_key, expires_at)
  values (p_user, p_kind, p_item, round(v_price, 3), v_coins, v_days, p_idem, now() + interval '20 minutes') returning * into o;
  insert into public.purchase_events (order_id, source, outcome, details)
  values (o.id, 'initiate', 'order_created', jsonb_build_object('kind', o.kind, 'item', o.item_key, 'amount_kwd', o.amount_kwd, 'coins', o.coins, 'period_days', o.period_days));
  return to_jsonb(o) || jsonb_build_object('reused', false);
end $$;

-- ============================================================ 3. VORA Coins packs (approved PROVISIONAL values)
insert into public.coin_packs (key, name_ar, name_en, coins, price_kwd, enabled, provisional, sort_order) values
  ('starter', 'البداية', 'Starter', 500, 0.990, true, true, 1),
  ('plus', 'بلس', 'Plus', 1500, 2.490, true, true, 2),
  ('value', 'التوفير', 'Value', 3500, 4.990, true, true, 3)
on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, coins = excluded.coins, price_kwd = excluded.price_kwd,
  enabled = true, provisional = true, sort_order = excluded.sort_order, updated_at = now();
-- the 20261120 packs (coins_500 / coins_1200 / coins_3000) do not correspond to an approved pack: switched off, rows kept for old orders
update public.coin_packs set enabled = false, updated_at = now() where key not in ('starter','plus','value');

-- ============================================================ 4. trainer_access: every earlier key and rule, plus "library" and "period"
create or replace function public.trainer_access(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st record; s record; t record; has_sub boolean; started boolean; ended boolean; remaining int; tier text; paid bigint;
begin
  if p_user is null then raise exception 'user required' using errcode = '22023'; end if;
  select * into st from public.trainer_settings where id = 1;
  -- no "enabled" filter on plans: a plan that left the shop still entitles the members who paid for it until their period ends
  select sub.plan_key, sub.current_period_end, sub.auto_renew, coalesce(p.includes_nutrition, false) as nutrition, p.period_days into s
    from public.subscriptions sub join public.plans p on p.key = sub.plan_key
    where sub.user_id = p_user and sub.status = 'active' and sub.current_period_end > now();
  has_sub := found;
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
    'trial', jsonb_build_object('available', not ended, 'started', started, 'conversation_id', case when started then t.conversation_id end, 'remaining', remaining,
      'ends_at', case when started then t.started_at + make_interval(hours => st.trial_window_hours) end, 'ended', ended, 'max_messages', st.trial_max_messages));
end $$;

-- ============================================================ 5. deny by default, then grant precisely
-- (public_plans, purchase_create and trainer_access were replaced in place: their grants are unchanged.)
revoke all on function public.public_muscles(), public.library_guard(), public.premium_exercises(text, text), public.premium_exercise(text),
  public.library_candidates(text[], text, int) from public, anon, authenticated, service_role;
grant execute on function public.public_muscles() to anon, authenticated, service_role;
grant execute on function public.premium_exercises(text, text), public.premium_exercise(text) to authenticated;
grant execute on function public.library_candidates(text[], text, int) to service_role;
commit;
