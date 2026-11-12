-- VORA Phase 1 / milestone 1: internal AI usage credits (append-only ledger, reservations, one-time trial).
-- Forward-only and additive. No frontend/anon/authenticated write access exists to any of these tables:
-- every mutation goes through SECURITY DEFINER functions that only service_role may execute.
begin;

create table public.credit_settings (
  id int primary key default 1 check (id = 1),
  trial_credits int not null default 2500 check (trial_credits >= 0),
  reservation_ttl_minutes int not null default 10 check (reservation_ttl_minutes between 1 and 120),
  updated_at timestamptz not null default now()
);
insert into public.credit_settings default values;

create table public.ai_operations (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,40}$'),
  label_ar text not null, label_en text not null,
  credits int not null check (credits >= 0 and credits <= 1000000),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
-- Draft values from the product spec; the Owner will be able to change them (owner RPC comes in a later milestone).
insert into public.ai_operations (key, label_ar, label_en, credits) values
  ('quick_question', 'سؤال سريع', 'Quick question', 50),
  ('meal_image_analysis', 'تحليل صورة وجبة', 'Meal image analysis', 300),
  ('partial_modification', 'تعديل جزئي على تمرين أو وجبة', 'Partial workout or meal change', 500),
  ('full_workout_plan', 'خطة تمرين كاملة', 'Full workout plan', 1500),
  ('full_food_plan', 'خطة غذاء كاملة', 'Full food plan', 1500);

-- one row per user: used as the lock that serialises every balance change of that user
create table public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_key text not null references public.ai_operations(key),
  credits int not null check (credits >= 0),
  status text not null default 'reserved' check (status in ('reserved','settled','released')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 80),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  settled_at timestamptz, released_at timestamptz, release_reason text,
  unique (user_id, idempotency_key)
);
create index credit_reservations_open_idx on public.credit_reservations (expires_at) where status = 'reserved';

-- Append-only. amount > 0 adds spendable credits, amount < 0 removes them. Balance = SUM(amount) per source.
-- A reservation writes negative rows (credits are held AND already deducted); a release writes the mirror positive rows;
-- settlement changes only the reservation status, so a settled spend stays deducted.
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('promo','purchased','reward','subscription')),
  entry_type text not null check (entry_type in ('grant','purchase','reserve','release','expire','adjust')),
  amount int not null check (amount <> 0),
  reservation_id uuid references public.credit_reservations(id),
  idempotency_key text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index credit_ledger_user_idx on public.credit_ledger (user_id, source);

create table public.trial_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,   -- the PK is the "once only" guarantee
  credits int not null,
  granted_at timestamptz not null default now()
);

alter table public.credit_settings enable row level security;
alter table public.ai_operations enable row level security;
alter table public.credit_wallets enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.trial_grants enable row level security;
revoke all on public.credit_settings, public.ai_operations, public.credit_wallets, public.credit_reservations, public.credit_ledger, public.trial_grants from anon, authenticated;
grant select on public.ai_operations to authenticated;                       -- members must see the exact cost before confirming
grant select (id, user_id, source, entry_type, amount, reservation_id, note, created_at) on public.credit_ledger to authenticated;
grant select (id, user_id, operation_key, credits, status, created_at, settled_at, released_at, release_reason) on public.credit_reservations to authenticated;
grant select on public.trial_grants to authenticated;
create policy "Members read enabled operation prices" on public.ai_operations for select to authenticated using (enabled);
create policy "Members read own ledger" on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
create policy "Members read own reservations" on public.credit_reservations for select to authenticated using ((select auth.uid()) = user_id);
create policy "Members read own trial grant" on public.trial_grants for select to authenticated using ((select auth.uid()) = user_id);

-- last line of defence: whatever path inserted a ledger row, a source can never go negative
create or replace function public.credit_ledger_guard() returns trigger language plpgsql set search_path = public as $$
declare bal bigint;
begin
  if tg_op <> 'INSERT' then raise exception 'credit ledger is append-only' using errcode = '42501'; end if;
  select coalesce(sum(amount), 0) + new.amount into bal from public.credit_ledger where user_id = new.user_id and source = new.source;
  if bal < 0 then raise exception 'credit balance cannot go negative' using errcode = 'PC002'; end if;
  return new;
end $$;
create trigger credit_ledger_insert_guard before insert on public.credit_ledger for each row execute function public.credit_ledger_guard();
create trigger credit_ledger_no_change before update or delete on public.credit_ledger for each row execute function public.credit_ledger_guard();

create or replace function public.credit_lock_wallet(p_user uuid) returns void language plpgsql set search_path = public as $$
begin
  insert into public.credit_wallets (user_id) values (p_user) on conflict do nothing;
  perform 1 from public.credit_wallets where user_id = p_user for update;
end $$;

create or replace function public.credit_source_balance(p_user uuid, p_source text) returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(amount), 0) from public.credit_ledger where user_id = p_user and source = p_source;
$$;

-- ---------------------------------------------------------------- one-time trial grant
create or replace function public.credit_grant_trial(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int; amt int;
begin
  if not exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null) then return false; end if;   -- verified accounts only
  perform public.credit_lock_wallet(p_user);
  select trial_credits into amt from public.credit_settings where id = 1;
  insert into public.trial_grants (user_id, credits) values (p_user, amt) on conflict (user_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;                                   -- already granted: never twice
  if amt > 0 then insert into public.credit_ledger (user_id, source, entry_type, amount, idempotency_key, note) values (p_user, 'promo', 'grant', amt, 'trial', 'free trial'); end if;
  return true;
end $$;

create or replace function public.credit_trial_on_verify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and (tg_op = 'INSERT' or old.email_confirmed_at is null) then perform public.credit_grant_trial(new.id); end if;
  return new;
end $$;
create trigger credit_trial_on_verify after insert or update of email_confirmed_at on auth.users for each row execute function public.credit_trial_on_verify();

-- ---------------------------------------------------------------- reservation -> settlement / release
-- Spending order: promo, reward, subscription (expiring first), purchased last.
create or replace function public.credit_reserve(p_user uuid, p_operation text, p_idem text)
returns table (o_reservation_id uuid, o_credits int, o_status text, o_reused boolean)
language plpgsql security definer set search_path = public as $$
declare op record; r record; need int; take int; src text; bal bigint; ttl int; rid uuid;
begin
  perform public.credit_lock_wallet(p_user);
  select * into r from public.credit_reservations where user_id = p_user and idempotency_key = p_idem;
  if found then
    if r.operation_key <> p_operation then raise exception 'idempotency key reused for another operation' using errcode = 'PC004'; end if;
    return query select r.id, r.credits, r.status, true; return;        -- retry / double click: same reservation, never a second hold
  end if;
  select * into op from public.ai_operations where key = p_operation;
  if not found or not op.enabled then raise exception 'operation is not available' using errcode = 'PC003'; end if;
  select reservation_ttl_minutes into ttl from public.credit_settings where id = 1;
  need := op.credits;
  if (select coalesce(sum(amount), 0) from public.credit_ledger where user_id = p_user) < need then
    raise exception 'insufficient credits' using errcode = 'PC001';
  end if;
  rid := gen_random_uuid();
  insert into public.credit_reservations (id, user_id, operation_key, credits, idempotency_key, expires_at)
  values (rid, p_user, p_operation, need, p_idem, now() + make_interval(mins => ttl));
  foreach src in array array['promo','reward','subscription','purchased'] loop
    exit when need <= 0;
    bal := public.credit_source_balance(p_user, src);
    take := least(need, greatest(bal, 0));
    if take > 0 then
      insert into public.credit_ledger (user_id, source, entry_type, amount, reservation_id, note) values (p_user, src, 'reserve', -take, rid, p_operation);
      need := need - take;
    end if;
  end loop;
  if need > 0 then raise exception 'insufficient credits' using errcode = 'PC001'; end if;
  return query select rid, op.credits, 'reserved'::text, false;
end $$;

create or replace function public.credit_settle(p_reservation uuid, p_user uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  perform public.credit_lock_wallet(p_user);
  select * into r from public.credit_reservations where id = p_reservation and user_id = p_user for update;
  if not found then raise exception 'reservation not found' using errcode = 'PC005'; end if;
  if r.status = 'settled' then return 'settled'; end if;                 -- idempotent
  if r.status = 'released' then raise exception 'reservation was released' using errcode = 'PC006'; end if;
  update public.credit_reservations set status = 'settled', settled_at = now() where id = r.id;
  return 'settled';
end $$;

create or replace function public.credit_release(p_reservation uuid, p_user uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare r record; l record;
begin
  perform public.credit_lock_wallet(p_user);
  select * into r from public.credit_reservations where id = p_reservation and user_id = p_user for update;
  if not found then raise exception 'reservation not found' using errcode = 'PC005'; end if;
  if r.status = 'released' then return 'released'; end if;               -- idempotent
  if r.status = 'settled' then raise exception 'a settled reservation cannot be released' using errcode = 'PC006'; end if;
  for l in select source, amount from public.credit_ledger where reservation_id = r.id and entry_type = 'reserve' loop
    insert into public.credit_ledger (user_id, source, entry_type, amount, reservation_id, note) values (p_user, l.source, 'release', -l.amount, r.id, left(coalesce(p_reason, 'released'), 120));
  end loop;
  update public.credit_reservations set status = 'released', released_at = now(), release_reason = left(coalesce(p_reason, 'released'), 120) where id = r.id;
  return 'released';
end $$;

-- abandoned holds go back to the member (the AI call never confirmed delivery)
create or replace function public.credit_release_expired(p_limit int default 50) returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, user_id from public.credit_reservations where status = 'reserved' and expires_at < now() order by expires_at limit least(greatest(p_limit, 1), 200) loop
    perform public.credit_release(r.id, r.user_id, 'expired'); n := n + 1;
  end loop;
  return n;
end $$;

-- subscription credits are a pool that ends with the paid term: remove whatever is left (called by the subscription logic later)
create or replace function public.credit_expire_source(p_user uuid, p_source text, p_note text) returns int
language plpgsql security definer set search_path = public as $$
declare bal bigint;
begin
  if p_source not in ('subscription','promo','reward') then raise exception 'purchased credits never expire' using errcode = 'PC007'; end if;
  perform public.credit_lock_wallet(p_user);
  bal := public.credit_source_balance(p_user, p_source);
  if bal > 0 then insert into public.credit_ledger (user_id, source, entry_type, amount, note) values (p_user, p_source, 'expire', -bal, left(p_note, 120)); end if;
  return greatest(bal, 0)::int;
end $$;

create or replace function public.credit_grant(p_user uuid, p_source text, p_amount int, p_type text, p_idem text, p_note text) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if p_amount <= 0 or p_type not in ('grant','purchase') then raise exception 'invalid grant' using errcode = '22023'; end if;
  perform public.credit_lock_wallet(p_user);
  insert into public.credit_ledger (user_id, source, entry_type, amount, idempotency_key, note) values (p_user, p_source, p_type, p_amount, p_idem, left(p_note, 120)) on conflict (user_id, idempotency_key) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

-- what the signed-in member sees (own data only)
create or replace function public.my_credit_balance() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'promo', public.credit_source_balance(auth.uid(), 'promo'), 'reward', public.credit_source_balance(auth.uid(), 'reward'),
    'subscription', public.credit_source_balance(auth.uid(), 'subscription'), 'purchased', public.credit_source_balance(auth.uid(), 'purchased'),
    'total', (select coalesce(sum(amount), 0) from public.credit_ledger where user_id = auth.uid()),
    'held', (select coalesce(sum(credits), 0) from public.credit_reservations where user_id = auth.uid() and status = 'reserved'));
$$;

revoke all on function public.credit_ledger_guard(), public.credit_lock_wallet(uuid), public.credit_source_balance(uuid, text), public.credit_grant_trial(uuid), public.credit_trial_on_verify(),
  public.credit_reserve(uuid, text, text), public.credit_settle(uuid, uuid), public.credit_release(uuid, uuid, text), public.credit_release_expired(int),
  public.credit_expire_source(uuid, text, text), public.credit_grant(uuid, text, int, text, text, text), public.my_credit_balance() from public, anon, authenticated;
grant execute on function public.credit_grant_trial(uuid), public.credit_reserve(uuid, text, text), public.credit_settle(uuid, uuid), public.credit_release(uuid, uuid, text),
  public.credit_release_expired(int), public.credit_expire_source(uuid, text, text), public.credit_grant(uuid, text, int, text, text, text) to service_role;
grant execute on function public.my_credit_balance() to authenticated;

commit;
