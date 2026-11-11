-- Day 10: sandbox payments (UPayments). Forward-only, no data is modified or removed.
-- Principle: only the payment Edge Functions (service_role) may move bookings.payment_status, and only through the
-- SECURITY DEFINER functions below. 'paid' additionally requires a verified captured attempt and can never be downgraded.
begin;

-- bookings.payment_status already exists with CHECK (pending|awaiting_payment|paid|failed|expired) and default 'pending'.

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'upayments',
  idempotency_key text not null unique,
  amount_kwd numeric(10,3) not null check (amount_kwd > 0),
  currency text not null default 'KWD' check (currency = 'KWD'),
  status text not null default 'created' check (status in ('created','checkout_ready','captured','failed','cancelled','expired')),
  provider_session_id text,
  provider_track_id text,
  checkout_url text,
  failure_reason text,
  gateway_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz
);
create index payment_attempts_booking_idx on public.payment_attempts (booking_id, created_at desc);
create index payment_attempts_open_idx on public.payment_attempts (expires_at) where status in ('created','checkout_ready');
-- at most ONE open checkout per booking: the database itself prevents duplicate charges from double clicks / races
create unique index payment_attempts_one_open_per_booking on public.payment_attempts (booking_id) where status in ('created','checkout_ready');

create table public.payment_events (
  id bigint generated always as identity primary key,
  attempt_id uuid references public.payment_attempts(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  source text not null,              -- initiate | webhook | reconcile
  result text,                       -- provider result, e.g. CAPTURED
  outcome text not null,             -- applied | duplicate | rejected_* | ignored_* | late_capture_applied | checkout_created ...
  dedupe_key text unique,            -- set only on the first processed event, so a repeat is detectable
  details jsonb,
  created_at timestamptz not null default now()
);
create index payment_events_attempt_idx on public.payment_events (attempt_id, created_at);

alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.payment_attempts, public.payment_events from anon, authenticated;
-- members read only the non-sensitive columns of their own attempts; admins (aal2) read everything through RLS
grant select (id, booking_id, user_id, provider, amount_kwd, currency, status, failure_reason, created_at, updated_at, expires_at, verified_at) on public.payment_attempts to authenticated;
grant select on public.payment_events to authenticated;
create policy "Members read own payment attempts, admins all" on public.payment_attempts for select to authenticated
  using ((select auth.uid()) = user_id or (select is_admin()));
create policy "Admins read payment events" on public.payment_events for select to authenticated using ((select is_admin()));

-- ---------------------------------------------------------------- booking guard (applies to EVERY role, service_role included)
create or replace function public.bookings_before_update() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.user_id is distinct from old.user_id or new.service_id is distinct from old.service_id
       or new.scheduled_at is distinct from old.scheduled_at or new.price_kwd is distinct from old.price_kwd
       or new.payment_status is distinct from old.payment_status or new.created_at is distinct from old.created_at
       or new.coach_id is distinct from old.coach_id or new.slot_id is distinct from old.slot_id
       or new.participants is distinct from old.participants or new.guardian_consent is distinct from old.guardian_consent then
      raise exception 'only booking_status may be changed by a user' using errcode = '42501';
    end if;
  end if;
  if new.payment_status is distinct from old.payment_status then
    if old.payment_status = 'paid' then
      raise exception 'a paid booking can never change payment_status' using errcode = '42501';
    end if;
    if new.payment_status = 'paid' and not exists (
         select 1 from public.payment_attempts a where a.booking_id = new.id and a.status = 'captured' and a.verified_at is not null) then
      raise exception 'paid requires a verified captured payment attempt' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- payment functions (service_role only)
create or replace function public.payment_start(p_booking uuid, p_user uuid)
returns table (o_attempt_id uuid, o_amount numeric, o_checkout_url text, o_reused boolean)
language plpgsql security definer set search_path = public as $$
declare b record; s record; a record; v_id uuid;
begin
  select * into b from public.bookings where id = p_booking for update;     -- serialises concurrent clicks on the same booking
  if not found or b.user_id <> p_user then raise exception 'booking not found' using errcode = 'PA001'; end if;
  if b.payment_status = 'paid' then raise exception 'booking already paid' using errcode = 'PA003'; end if;
  if b.booking_status = 'cancelled' then raise exception 'booking is cancelled' using errcode = 'PA002'; end if;
  select sv.price_kwd, sv.status into s from public.services sv where sv.id = b.service_id;
  if not found or s.status <> 'published' then raise exception 'service is not payable' using errcode = 'PA002'; end if;
  if b.price_kwd is null or b.price_kwd <= 0 then raise exception 'free booking, nothing to pay' using errcode = 'PA002'; end if;

  -- an attempt that never obtained a checkout link cannot have been paid: close it so a new one may start
  update public.payment_attempts set status = 'failed', failure_reason = 'checkout_not_created', updated_at = now()
   where booking_id = b.id and status = 'created' and checkout_url is null and created_at < now() - interval '60 seconds';

  select * into a from public.payment_attempts where booking_id = b.id and status in ('created','checkout_ready') order by created_at desc limit 1;
  if found then
    if a.expires_at > now() then
      return query select a.id, a.amount_kwd, a.checkout_url, true; return;
    end if;
    -- open attempt past its expiry: the provider may still have captured it -> must be reconciled first (never double charge)
    raise exception 'previous attempt is being verified' using errcode = 'PA004';
  end if;

  v_id := gen_random_uuid();
  insert into public.payment_attempts (id, booking_id, user_id, idempotency_key, amount_kwd, expires_at)
  values (v_id, b.id, b.user_id, 'vora-pay-' || v_id::text, round(b.price_kwd, 3), now() + interval '20 minutes');
  insert into public.payment_events (attempt_id, booking_id, source, outcome, details)
  values (v_id, b.id, 'initiate', 'attempt_created', jsonb_build_object('amount_kwd', round(b.price_kwd, 3), 'service_price_kwd', s.price_kwd));
  return query select v_id, round(b.price_kwd, 3), null::text, false;
end $$;

create or replace function public.payment_set_checkout(p_attempt uuid, p_session text, p_url text, p_response jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  select * into a from public.payment_attempts where id = p_attempt for update;
  if not found then raise exception 'attempt not found' using errcode = 'PA001'; end if;
  if a.status <> 'created' then return; end if;
  update public.payment_attempts set status = 'checkout_ready', provider_session_id = p_session, checkout_url = p_url,
         gateway_response = p_response, updated_at = now() where id = p_attempt;
  update public.bookings set payment_status = 'awaiting_payment' where id = a.booking_id and payment_status in ('pending','failed','expired');
  insert into public.payment_events (attempt_id, booking_id, source, outcome) values (p_attempt, a.booking_id, 'initiate', 'checkout_created');
end $$;

create or replace function public.payment_fail_creation(p_attempt uuid, p_reason text)
returns void language sql security definer set search_path = public as $$
  update public.payment_attempts set status = 'failed', failure_reason = left(p_reason, 200), updated_at = now()
   where id = p_attempt and status = 'created' and checkout_url is null;
$$;

-- p_result: provider result (CAPTURED, NOT CAPTURED, CANCELED, FAILED, ERROR, PENDING) or the pseudo-result EXPIRED from the reconciler.
create or replace function public.payment_apply(p_attempt uuid, p_result text, p_amount numeric, p_currency text, p_track text, p_response jsonb, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a record; b record; r text := upper(coalesce(p_result, '')); k text; outcome text; was text;
begin
  select * into a from public.payment_attempts where id = p_attempt for update;
  if not found then return jsonb_build_object('outcome', 'rejected_unknown_attempt'); end if;
  select * into b from public.bookings where id = a.booking_id for update;
  k := a.id::text || ':' || coalesce(p_track, '') || ':' || r;
  if p_track is not null and a.provider_track_id is null then update public.payment_attempts set provider_track_id = p_track where id = a.id; end if;

  if r = 'CAPTURED' then
    if p_amount is null or round(p_amount, 3) <> a.amount_kwd or upper(coalesce(p_currency, '')) <> 'KWD' then
      insert into public.payment_events (attempt_id, booking_id, source, result, outcome, details)
      values (a.id, b.id, p_source, r, 'rejected_amount_or_currency_mismatch', jsonb_build_object('expected', a.amount_kwd, 'got', p_amount, 'currency', p_currency));
      return jsonb_build_object('outcome', 'rejected_amount_or_currency_mismatch', 'payment_status', b.payment_status);
    end if;
    if a.status = 'captured' or b.payment_status = 'paid' then
      insert into public.payment_events (attempt_id, booking_id, source, result, outcome) values (a.id, b.id, p_source, r, 'duplicate');
      return jsonb_build_object('outcome', 'duplicate', 'payment_status', b.payment_status);
    end if;
    was := a.status;
    update public.payment_attempts set status = 'captured', verified_at = now(), provider_track_id = coalesce(p_track, provider_track_id),
           gateway_response = coalesce(p_response, gateway_response), failure_reason = null, updated_at = now() where id = a.id;
    update public.bookings set payment_status = 'paid' where id = b.id;
    outcome := case when was in ('expired','failed','cancelled') or b.payment_status in ('expired','failed') then 'late_capture_applied' else 'applied' end;
    insert into public.payment_events (attempt_id, booking_id, source, result, outcome, dedupe_key, details)
    values (a.id, b.id, p_source, r, outcome, k, jsonb_build_object('previous_attempt_status', was, 'previous_payment_status', b.payment_status));
    return jsonb_build_object('outcome', outcome, 'payment_status', 'paid');

  elsif r in ('NOT CAPTURED', 'CANCELED', 'CANCELLED', 'FAILED', 'ERROR', 'DECLINED') then
    if a.status = 'captured' or b.payment_status = 'paid' then
      insert into public.payment_events (attempt_id, booking_id, source, result, outcome) values (a.id, b.id, p_source, r, 'ignored_downgrade');
      return jsonb_build_object('outcome', 'ignored_downgrade', 'payment_status', b.payment_status);
    end if;
    if a.status in ('failed', 'cancelled') then
      insert into public.payment_events (attempt_id, booking_id, source, result, outcome) values (a.id, b.id, p_source, r, 'duplicate');
      return jsonb_build_object('outcome', 'duplicate', 'payment_status', b.payment_status);
    end if;
    update public.payment_attempts set status = case when r in ('CANCELED','CANCELLED') then 'cancelled' else 'failed' end,
           failure_reason = r, gateway_response = coalesce(p_response, gateway_response), updated_at = now() where id = a.id;
    update public.bookings set payment_status = 'failed' where id = b.id and payment_status in ('awaiting_payment','pending','expired');
    insert into public.payment_events (attempt_id, booking_id, source, result, outcome, dedupe_key) values (a.id, b.id, p_source, r, 'applied', k);
    return jsonb_build_object('outcome', 'applied', 'payment_status', (select payment_status from public.bookings where id = b.id));

  elsif r = 'EXPIRED' then
    if a.status not in ('created', 'checkout_ready') or a.expires_at > now() then
      insert into public.payment_events (attempt_id, booking_id, source, result, outcome) values (a.id, b.id, p_source, r, 'ignored_not_open_or_not_due');
      return jsonb_build_object('outcome', 'ignored_not_open_or_not_due', 'payment_status', b.payment_status);
    end if;
    update public.payment_attempts set status = 'expired', failure_reason = 'abandoned', updated_at = now() where id = a.id;
    update public.bookings set payment_status = 'expired' where id = b.id and payment_status = 'awaiting_payment';
    insert into public.payment_events (attempt_id, booking_id, source, result, outcome, dedupe_key) values (a.id, b.id, p_source, r, 'applied', k);
    return jsonb_build_object('outcome', 'applied', 'payment_status', (select payment_status from public.bookings where id = b.id));

  else  -- PENDING and anything unknown never changes money state
    insert into public.payment_events (attempt_id, booking_id, source, result, outcome) values (a.id, b.id, p_source, r, 'ignored_non_terminal');
    return jsonb_build_object('outcome', 'ignored_non_terminal', 'payment_status', b.payment_status);
  end if;
exception when unique_violation then
  insert into public.payment_events (attempt_id, booking_id, source, result, outcome) values (a.id, b.id, p_source, r, 'duplicate');
  return jsonb_build_object('outcome', 'duplicate', 'payment_status', (select payment_status from public.bookings where id = b.id));
end $$;

create or replace function public.payment_overdue(p_limit int default 20)
returns setof public.payment_attempts language sql security definer set search_path = public as $$
  select * from public.payment_attempts where status in ('created','checkout_ready') and expires_at < now() order by expires_at limit least(greatest(p_limit,1),50);
$$;

create or replace function public.payment_log(p_attempt uuid, p_booking uuid, p_source text, p_result text, p_outcome text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.payment_events (attempt_id, booking_id, source, result, outcome, details) values (p_attempt, p_booking, p_source, p_result, p_outcome, p_details);
$$;

revoke all on function public.payment_start(uuid, uuid), public.payment_set_checkout(uuid, text, text, jsonb), public.payment_fail_creation(uuid, text),
  public.payment_apply(uuid, text, numeric, text, text, jsonb, text), public.payment_overdue(int),
  public.payment_log(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.payment_start(uuid, uuid), public.payment_set_checkout(uuid, text, text, jsonb), public.payment_fail_creation(uuid, text),
  public.payment_apply(uuid, text, numeric, text, text, jsonb, text), public.payment_overdue(int),
  public.payment_log(uuid, uuid, text, text, text, jsonb) to service_role;

-- Realtime: owner dashboards receive booking changes (row-level security still decides who may see which row)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;

commit;
