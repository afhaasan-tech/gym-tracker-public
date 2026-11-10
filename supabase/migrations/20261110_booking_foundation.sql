-- Day 9 -> Day 10 foundation: DEMO coaching-session bookings. No payment gateway, no real appointments.
-- payment_status is reserved for a future server-side (Edge Function / service role) payment flow.

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '',
  price_kwd numeric(8,3) not null check (price_kwd >= 0),
  is_available boolean not null default true,
  is_demo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Admins are listed here by hand (service role / SQL editor). RLS is on with NO policies, so the API can never read or edit it.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  scheduled_at timestamptz not null,
  booking_status text not null default 'pending' check (booking_status in ('pending', 'confirmed', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'awaiting_payment', 'paid', 'failed', 'expired')),
  price_kwd numeric(8,3) not null default 0,  -- snapshot copied from services by a trigger; never taken from the client
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_user_id_created_at_idx on public.bookings (user_id, created_at desc);
create index bookings_service_id_idx on public.bookings (service_id);

-- Triggers run as the calling role (not security definer), so current_user tells API callers apart from the service role / SQL editor.
create function public.bookings_before_insert() returns trigger
language plpgsql set search_path = public as $$
declare p numeric; a boolean;
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.booking_status <> 'pending' or new.payment_status <> 'pending' then
      raise exception 'customers cannot set booking_status or payment_status' using errcode = '42501';
    end if;
  end if;
  select s.price_kwd, s.is_available into p, a from public.services s where s.id = new.service_id;
  if not found or not a then
    raise exception 'service is not available' using errcode = '23514';
  end if;
  new.price_kwd := p;  -- server-side price, always
  if new.scheduled_at < now() + interval '1 hour' or new.scheduled_at > now() + interval '90 days' then
    raise exception 'scheduled_at must be between 1 hour and 90 days from now' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bookings_before_insert before insert on public.bookings
  for each row execute function public.bookings_before_insert();

create function public.bookings_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.user_id is distinct from old.user_id or new.service_id is distinct from old.service_id
       or new.scheduled_at is distinct from old.scheduled_at or new.price_kwd is distinct from old.price_kwd
       or new.payment_status is distinct from old.payment_status or new.created_at is distinct from old.created_at then
      raise exception 'only booking_status may be changed by a user' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger bookings_before_update before update on public.bookings
  for each row execute function public.bookings_before_update();

alter table public.services enable row level security;
alter table public.bookings enable row level security;

create policy "Signed-in users view available services" on public.services
  for select to authenticated using (is_available or (select public.is_admin()));

create policy "Users view own bookings, admins view all" on public.bookings
  for select to authenticated using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy "Users create own pending bookings" on public.bookings
  for insert to authenticated
  with check ((select auth.uid()) = user_id and booking_status = 'pending' and payment_status = 'pending');
create policy "Admins update bookings" on public.bookings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- no DELETE policy anywhere; services have no write policies (changed only with the service role / SQL editor)

-- Column-level privileges on top of RLS: a customer can only ever supply service_id and scheduled_at.
revoke all on public.services, public.bookings, public.admins from anon, authenticated;
grant select on public.services to authenticated;
grant select on public.bookings to authenticated;
grant insert (service_id, scheduled_at) on public.bookings to authenticated;
grant update (booking_status) on public.bookings to authenticated;

insert into public.services (name, description, price_kwd) values
  ('تقييم لياقة (تجريبي)', 'خدمة تجريبية: جلسة قصيرة لتقييم مستوى اللياقة وتحديد نقطة البداية.', 3.000),
  ('جلسة تدريب شخصي (تجريبي)', 'خدمة تجريبية: ساعة تدريب فردية مع مدرب على برنامجك.', 12.000),
  ('برنامج قوة لأسبوع (تجريبي)', 'خدمة تجريبية: خطة تمارين قوة لأسبوع مع متابعة.', 18.500),
  ('جلسة إطالة وتعافي (تجريبي)', 'خدمة تجريبية: جلسة إطالة وتعافي بعد التمرين.', 8.000);
