-- VORA Phase 1 / milestone 5 (forward-only, additive): server-side purchases paid through the UPayments SANDBOX hosted checkout.
--   (a) VORA Coins packs  -> credit_grant(user, 'purchased', coins, 'purchase', 'order:<id>')
--   (b) one subscription period (first purchase and MANUAL renewal; there is NO automatic recurring billing in this release)
--       -> subscription_activate(user, plan, period_end, false, 'order:<id>')
-- Principles (same as booking payments, 20261113):
--   * the price is ALWAYS copied from the server-side catalogue when the order is created; no client value is ever stored as a price;
--   * only the payment Edge Functions (service_role) may move an order, and only through the SECURITY DEFINER functions below;
--   * 'paid' needs a provider-verified CAPTURED result whose amount and currency equal the snapshot, can never be downgraded,
--     and the entitlement is granted EXACTLY ONCE (order row lock + idempotency key 'order:<id>' in the ledger / subscription);
--   * every event is logged to purchase_events.
-- Nothing existing is altered: no existing table, function, policy or grant is changed by this file.
begin;

-- ============================================================ 1. coin packs (all PROVISIONAL until the owner approves them)
create table public.coin_packs (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,30}$'),
  name_ar text not null, name_en text not null,
  coins int not null check (coins between 1 and 10000000),
  price_kwd numeric(10,3) not null check (price_kwd > 0 and price_kwd <= 1000),
  enabled boolean not null default true,
  provisional boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.coin_packs (key, name_ar, name_en, coins, price_kwd, sort_order) values
  ('coins_500',  '٥٠٠ عملة',   '500 Coins',   500,  0.500, 1),
  ('coins_1200', '١٬٢٠٠ عملة', '1,200 Coins', 1200, 1.000, 2),
  ('coins_3000', '٣٬٠٠٠ عملة', '3,000 Coins', 3000, 2.000, 3);
alter table public.coin_packs enable row level security;
revoke all on public.coin_packs from public, anon, authenticated, service_role;
grant select on public.coin_packs to anon, authenticated, service_role;
create policy "Everyone reads enabled coin packs" on public.coin_packs for select to anon, authenticated, service_role using (enabled);

create function public.public_coin_packs() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', key, 'name_ar', name_ar, 'name_en', name_en, 'coins', coins, 'price_kwd', price_kwd, 'provisional', provisional) order by sort_order, key), '[]')
    from public.coin_packs where enabled;
$$;

-- Owner configuration: same pattern as owner_upsert_plan (super admin + recent MFA step-up + audit log).
create function public.owner_upsert_coin_pack(p_key text, p_name_ar text, p_name_en text, p_coins int, p_price numeric, p_enabled boolean, p_sort int, p_provisional boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare old record; existed boolean;
begin
  perform public.owner_guard(true);
  if p_coins is null or p_coins not between 1 and 10000000 then raise exception 'coins out of range' using errcode = '22023'; end if;
  if p_price is null or p_price <= 0 or p_price > 1000 or p_price <> round(p_price, 3) then raise exception 'price out of range' using errcode = '22023'; end if;
  select coins, price_kwd, enabled, provisional into old from public.coin_packs where key = p_key;
  existed := found;
  insert into public.coin_packs (key, name_ar, name_en, coins, price_kwd, enabled, sort_order, provisional)
  values (p_key, left(p_name_ar, 40), left(p_name_en, 40), p_coins, p_price, coalesce(p_enabled, true), coalesce(p_sort, 0), coalesce(p_provisional, true))
  on conflict (key) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, coins = excluded.coins, price_kwd = excluded.price_kwd,
    enabled = excluded.enabled, sort_order = excluded.sort_order, provisional = excluded.provisional, updated_at = now();
  perform public.log_audit('coin_pack.upsert', 'coin_pack', p_key, jsonb_build_object(
    'old', case when not existed then null else jsonb_build_object('coins', old.coins, 'price_kwd', old.price_kwd, 'enabled', old.enabled, 'provisional', old.provisional) end,
    'new', jsonb_build_object('coins', p_coins, 'price_kwd', p_price, 'enabled', coalesce(p_enabled, true), 'provisional', coalesce(p_provisional, true))));
end $$;
-- the owner also sees disabled packs
create function public.owner_list_coin_packs() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform public.owner_guard(false);
  return (select coalesce(jsonb_agg(to_jsonb(p) order by sort_order, key), '[]') from public.coin_packs p);
end $$;

-- ============================================================ 2. orders + audit events
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('coins','subscription')),
  item_key text not null,                                   -- coin_packs.key or plans.key (no FK: a catalogue row may be retired, the order stays)
  amount_kwd numeric(10,3) not null check (amount_kwd > 0), -- snapshot of the server-side price at creation; never a client value
  currency text not null default 'KWD' check (currency = 'KWD'),
  coins int,                                                -- snapshot (coins orders)
  period_days int,                                          -- snapshot (subscription orders), 30 in this release
  auto_renew boolean not null default false check (auto_renew = false),   -- recurring billing is NOT in this release; the column exists so it can be added later
  status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','expired')),
  provider text not null default 'upayments',
  provider_session_id text,
  provider_track_id text,
  checkout_url text,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  failure_reason text,
  subscription_id uuid,                                     -- the subscriptions row this order activated
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_checked_at timestamptz,                              -- throttle for provider lookups
  paid_at timestamptz,
  fulfilled_at timestamptz,
  unique (user_id, idempotency_key),
  check ((kind = 'coins' and coins > 0 and period_days is null) or (kind = 'subscription' and coins is null and period_days between 1 and 366)),
  check (status <> 'paid' or paid_at is not null),
  check (fulfilled_at is null or status = 'paid')
);
create index purchase_orders_user_idx on public.purchase_orders (user_id, created_at desc);
create index purchase_orders_open_idx on public.purchase_orders (expires_at) where status = 'pending';
create index purchase_orders_unfulfilled_idx on public.purchase_orders (paid_at) where status = 'paid' and fulfilled_at is null;
create index purchase_orders_track_idx on public.purchase_orders (provider_track_id) where provider_track_id is not null;

create table public.purchase_events (
  id bigint generated always as identity primary key,
  order_id uuid references public.purchase_orders(id) on delete cascade,
  source text not null,              -- initiate | webhook | reconcile | status
  result text,                       -- provider result, e.g. CAPTURED
  outcome text not null,             -- order_created | checkout_created | applied | late_capture_applied | duplicate | rejected_* | ignored_* | paid_unfulfilled | fulfilled_on_retry
  dedupe_key text unique,            -- set only on the first processed event
  details jsonb,
  created_at timestamptz not null default now()
);
create index purchase_events_order_idx on public.purchase_events (order_id, created_at);

alter table public.purchase_orders enable row level security;
alter table public.purchase_events enable row level security;
revoke all on public.purchase_orders, public.purchase_events from public, anon, authenticated, service_role;
-- members read only the non-sensitive columns of THEIR OWN orders and only from a trusted session; admins (aal2) read through RLS. Nobody writes.
grant select (id, user_id, kind, item_key, amount_kwd, currency, coins, period_days, auto_renew, status, provider, failure_reason, created_at, updated_at, expires_at, paid_at, fulfilled_at)
  on public.purchase_orders to authenticated;
grant select on public.purchase_events to authenticated;
create policy "Members read own purchase orders (trusted session), admins all" on public.purchase_orders for select to authenticated
  using (((select auth.uid()) = user_id and (select public.is_trusted_session())) or (select is_admin()));
create policy "Admins read purchase events" on public.purchase_events for select to authenticated using ((select is_admin()));

-- Last line of defence, applies to EVERY role (table owner and SECURITY DEFINER functions included):
-- the snapshot is immutable, a paid order stays paid, and the paid / fulfilled timestamps are set once.
create function public.purchase_orders_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.kind is distinct from old.kind or new.item_key is distinct from old.item_key
     or new.amount_kwd is distinct from old.amount_kwd or new.currency is distinct from old.currency or new.coins is distinct from old.coins
     or new.period_days is distinct from old.period_days or new.idempotency_key is distinct from old.idempotency_key or new.created_at is distinct from old.created_at then
    raise exception 'a purchase order snapshot can never change' using errcode = '42501';
  end if;
  if old.status = 'paid' and new.status <> 'paid' then raise exception 'a paid order can never change status' using errcode = '42501'; end if;
  if old.paid_at is not null and new.paid_at is distinct from old.paid_at then raise exception 'paid_at is set once' using errcode = '42501'; end if;
  if old.fulfilled_at is not null and new.fulfilled_at is distinct from old.fulfilled_at then raise exception 'fulfilled_at is set once' using errcode = '42501'; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger purchase_orders_guard before update on public.purchase_orders for each row execute function public.purchase_orders_guard();

-- ============================================================ 3. order functions (service_role only)
-- Creates (or returns, for a repeated idempotency key) the order. The price, the coins and the period come from the catalogue ONLY.
-- Errors: PU001 unknown user, PU002 item not available, PU003 e-mail not verified, PU004 key reused for another item, PU005 too many open orders.
create function public.purchase_create(p_user uuid, p_kind text, p_item text, p_idem text) returns jsonb
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
    select price_kwd into v_price from public.plans where key = p_item and enabled;
    if not found then raise exception 'item is not available' using errcode = 'PU002'; end if;
    v_days := 30;
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

create function public.purchase_set_checkout(p_order uuid, p_session text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.purchase_orders;
begin
  select * into o from public.purchase_orders where id = p_order for update;
  if not found then raise exception 'order not found' using errcode = 'PU001'; end if;
  if o.status <> 'pending' or o.checkout_url is not null then return; end if;
  if p_url is null or p_url !~ '^https://' then raise exception 'invalid checkout url' using errcode = '22023'; end if;
  update public.purchase_orders set provider_session_id = p_session, checkout_url = p_url where id = p_order;
  insert into public.purchase_events (order_id, source, outcome) values (p_order, 'initiate', 'checkout_created');
end $$;

-- An order that never obtained a checkout link cannot have been paid: close it.
create function public.purchase_fail_creation(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.purchase_orders set status = 'failed', failure_reason = left(p_reason, 200) where id = p_order and status = 'pending' and checkout_url is null;
  if found then insert into public.purchase_events (order_id, source, outcome, details) values (p_order, 'initiate', 'checkout_failed', jsonb_build_object('reason', left(p_reason, 200))); end if;
end $$;

-- Internal: grants the entitlement of a PAID order. Idempotent by 'order:<id>' in the credit ledger / the subscription activation key,
-- so even a repeated call can never grant twice. Callers hold the order row lock. Not executable by any API role.
create function public.purchase_fulfil(p_order uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o public.purchase_orders; k text; cur timestamptz; sid uuid;
begin
  select * into o from public.purchase_orders where id = p_order for update;
  if not found or o.status <> 'paid' then raise exception 'only a paid order can be fulfilled' using errcode = '42501'; end if;
  if o.fulfilled_at is not null then return; end if;
  k := 'order:' || o.id::text;
  if o.kind = 'coins' then
    perform public.credit_grant(o.user_id, 'purchased', o.coins, 'purchase', k, 'coin pack ' || o.item_key);
  else
    -- Manual renewal EXTENDS: the new period ends period_days after the end of the period that is still running (or after now).
    -- subscription_activate() expires the running row and inserts a new one that starts now and ends at that date, so the unused
    -- remainder is carried over. The same advisory lock as subscription_activate is taken BEFORE the running period is read, so two
    -- orders of one member cannot both extend from the same end date.
    perform pg_advisory_xact_lock(hashtextextended('subscription:' || o.user_id::text, 23));
    select id into sid from public.subscriptions where user_id = o.user_id and activation_key = k;
    if not found then
      select current_period_end into cur from public.subscriptions where user_id = o.user_id and status = 'active' and current_period_end > now();
      sid := public.subscription_activate(o.user_id, o.item_key, greatest(now(), coalesce(cur, now())) + make_interval(days => o.period_days), false, k);
    end if;
  end if;
  update public.purchase_orders set fulfilled_at = now(), subscription_id = sid where id = o.id;
end $$;

-- p_result: provider result (CAPTURED, NOT CAPTURED, CANCELED, FAILED, ERROR, DECLINED, PENDING) or the pseudo-result EXPIRED from the reconciler.
-- Returns { outcome, status, fulfilled }.
create function public.purchase_apply(p_order uuid, p_result text, p_amount numeric, p_currency text, p_track text, p_response jsonb, p_source text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.purchase_orders; r text := upper(coalesce(p_result, '')); k text; v_outcome text; was text; v_err text; v_done boolean;
begin
  select * into o from public.purchase_orders where id = p_order for update;        -- serialises webhook / reconcile / status races
  if not found then return jsonb_build_object('outcome', 'rejected_unknown_order'); end if;
  k := o.id::text || ':' || coalesce(p_track, '') || ':' || r;
  if p_track is not null and o.provider_track_id is null then update public.purchase_orders set provider_track_id = p_track where id = o.id; end if;

  if r = 'CAPTURED' then
    if p_amount is null or round(p_amount, 3) <> o.amount_kwd or upper(coalesce(p_currency, '')) <> o.currency then
      insert into public.purchase_events (order_id, source, result, outcome, details)
      values (o.id, p_source, r, 'rejected_amount_or_currency_mismatch', jsonb_build_object('expected', o.amount_kwd, 'got', p_amount, 'currency', p_currency));
      return jsonb_build_object('outcome', 'rejected_amount_or_currency_mismatch', 'status', o.status, 'fulfilled', o.fulfilled_at is not null);
    end if;
    if o.status = 'paid' and o.fulfilled_at is not null then
      insert into public.purchase_events (order_id, source, result, outcome) values (o.id, p_source, r, 'duplicate');
      return jsonb_build_object('outcome', 'duplicate', 'status', 'paid', 'fulfilled', true);
    end if;
    was := o.status;
    if was <> 'paid' then
      update public.purchase_orders set status = 'paid', paid_at = now(), provider_track_id = coalesce(p_track, provider_track_id), failure_reason = null where id = o.id;
    end if;
    -- Fulfilment runs in its own sub-transaction: if it cannot complete (e.g. the plan was disabled after checkout) the order STAYS paid
    -- (the money was captured) and is retried by the reconciler / the next status check; nothing is granted twice ('order:<id>' keys).
    begin
      perform public.purchase_fulfil(o.id);
      v_done := true;
    exception when others then
      v_done := false; v_err := left(sqlerrm, 200);
    end;
    v_outcome := case when not v_done then 'paid_unfulfilled' when was = 'paid' then 'fulfilled_on_retry'
                      when was in ('expired','failed','cancelled') then 'late_capture_applied' else 'applied' end;
    insert into public.purchase_events (order_id, source, result, outcome, dedupe_key, details)
    values (o.id, p_source, r, v_outcome, case when was <> 'paid' then k end,
            jsonb_build_object('previous_status', was, 'track_id', p_track, 'provider', p_response) || case when v_err is null then '{}'::jsonb else jsonb_build_object('error', v_err) end);
    if was <> 'paid' then
      perform public.security_event(o.user_id, 'purchase.paid', jsonb_build_object('order', o.id, 'kind', o.kind, 'item', o.item_key, 'amount_kwd', o.amount_kwd, 'fulfilled', v_done));
    end if;
    return jsonb_build_object('outcome', v_outcome, 'status', 'paid', 'fulfilled', v_done);

  elsif r in ('NOT CAPTURED', 'CANCELED', 'CANCELLED', 'FAILED', 'ERROR', 'DECLINED') then
    if o.status = 'paid' then
      insert into public.purchase_events (order_id, source, result, outcome) values (o.id, p_source, r, 'ignored_downgrade');
      return jsonb_build_object('outcome', 'ignored_downgrade', 'status', 'paid', 'fulfilled', o.fulfilled_at is not null);
    end if;
    if o.status in ('failed', 'cancelled') then
      insert into public.purchase_events (order_id, source, result, outcome) values (o.id, p_source, r, 'duplicate');
      return jsonb_build_object('outcome', 'duplicate', 'status', o.status, 'fulfilled', false);
    end if;
    update public.purchase_orders set status = case when r in ('CANCELED','CANCELLED') then 'cancelled' else 'failed' end, failure_reason = r where id = o.id returning status into was;
    insert into public.purchase_events (order_id, source, result, outcome, dedupe_key) values (o.id, p_source, r, 'applied', k);
    return jsonb_build_object('outcome', 'applied', 'status', was, 'fulfilled', false);

  elsif r = 'EXPIRED' then
    if o.status <> 'pending' or o.expires_at > now() then
      insert into public.purchase_events (order_id, source, result, outcome) values (o.id, p_source, r, 'ignored_not_open_or_not_due');
      return jsonb_build_object('outcome', 'ignored_not_open_or_not_due', 'status', o.status, 'fulfilled', o.fulfilled_at is not null);
    end if;
    update public.purchase_orders set status = 'expired', failure_reason = 'abandoned' where id = o.id;
    insert into public.purchase_events (order_id, source, result, outcome, dedupe_key) values (o.id, p_source, r, 'applied', k);
    return jsonb_build_object('outcome', 'applied', 'status', 'expired', 'fulfilled', false);

  else  -- PENDING and anything unknown never changes money state
    insert into public.purchase_events (order_id, source, result, outcome) values (o.id, p_source, r, 'ignored_non_terminal');
    return jsonb_build_object('outcome', 'ignored_non_terminal', 'status', o.status, 'fulfilled', o.fulfilled_at is not null);
  end if;
exception when unique_violation then          -- the same (order, track, result) was already processed: everything above is rolled back
  insert into public.purchase_events (order_id, source, result, outcome) values (p_order, p_source, r, 'duplicate');
  return (select jsonb_build_object('outcome', 'duplicate', 'status', status, 'fulfilled', fulfilled_at is not null) from public.purchase_orders where id = p_order);
end $$;

-- Full order row for the payment functions (by id, or by the provider's track id). NULL when unknown.
create function public.purchase_lookup(p_order uuid, p_track text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o) from public.purchase_orders o
   where (p_order is not null and o.id = p_order) or (p_order is null and p_track is not null and o.provider_track_id = p_track)
   order by o.created_at desc limit 1;
$$;

-- Throttle for provider lookups of one order: true (and stamps the order) at most once per p_min_seconds.
create function public.purchase_check_gate(p_order uuid, p_min_seconds int default 5) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.purchase_orders set last_checked_at = now()
   where id = p_order and (last_checked_at is null or last_checked_at < now() - make_interval(secs => least(greatest(coalesce(p_min_seconds, 5), 1), 3600)));
  return found;
end $$;

-- For the reconciler: open orders past their expiry, plus paid orders whose entitlement could not be granted yet.
create function public.purchase_overdue(p_limit int default 20) returns setof jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o) from public.purchase_orders o
   where (o.status = 'pending' and o.expires_at < now()) or (o.status = 'paid' and o.fulfilled_at is null)
   order by o.expires_at limit least(greatest(p_limit, 1), 50);
$$;

create function public.purchase_log(p_order uuid, p_source text, p_result text, p_outcome text, p_details jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.purchase_events (order_id, source, result, outcome, details) values (p_order, p_source, p_result, p_outcome, p_details);
$$;

-- ============================================================ 4. deny by default, then grant precisely
revoke all on function public.public_coin_packs(), public.owner_upsert_coin_pack(text, text, text, int, numeric, boolean, int, boolean), public.owner_list_coin_packs(),
  public.purchase_orders_guard(), public.purchase_create(uuid, text, text, text), public.purchase_set_checkout(uuid, text, text), public.purchase_fail_creation(uuid, text),
  public.purchase_fulfil(uuid), public.purchase_apply(uuid, text, numeric, text, text, jsonb, text), public.purchase_lookup(uuid, text),
  public.purchase_check_gate(uuid, int), public.purchase_overdue(int), public.purchase_log(uuid, text, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.public_coin_packs() to anon, authenticated, service_role;
grant execute on function public.owner_upsert_coin_pack(text, text, text, int, numeric, boolean, int, boolean), public.owner_list_coin_packs() to authenticated;
grant execute on function public.purchase_create(uuid, text, text, text), public.purchase_set_checkout(uuid, text, text), public.purchase_fail_creation(uuid, text),
  public.purchase_apply(uuid, text, numeric, text, text, jsonb, text), public.purchase_lookup(uuid, text),
  public.purchase_check_gate(uuid, int), public.purchase_overdue(int), public.purchase_log(uuid, text, text, text, jsonb) to service_role;
commit;
