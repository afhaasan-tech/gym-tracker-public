begin;

-- Kuwait-first multi-sport discovery platform: sports catalog, invitation-only coaches, owner-approved services, slots, demo bookings.
--
-- ROLES (all enforced here, never in the UI, never from user-editable metadata):
--   MEMBER           every signed-up user (public signup can only ever create members).
--   COACH            a row in coach_profiles with status 'active'. Created ONLY by the Super Admin's invitation + the invited person's
--                    own verified-email claim + the Super Admin's activation. Coaches cannot sign themselves up.
--   SUPER ADMIN      the platform owner: full control. At most one.
--   EMERGENCY ADMIN  at most one, assigned/revoked only by the Super Admin, narrow powers (see admin_* functions).
--   => public.admins can never hold more than two rows (unique role + hard cap), and the super row cannot be changed through the API.
-- Owner Dashboard access additionally requires a multi-factor (aal2) session.
-- Bookings stay DEMONSTRATIONS: no payment, no fulfilment. payment_status remains server-only.

-- ============================================================ privileged accounts (max two)
alter table public.admins
  add column role text not null default 'super' check (role in ('super', 'emergency')),
  add column granted_by uuid references auth.users(id) on delete set null;
create unique index admins_one_per_role on public.admins (role);

create function public.admins_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.admins) >= 2 then raise exception 'at most two privileged accounts are allowed' using errcode = '23514'; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then raise exception 'a privileged role cannot be changed in place' using errcode = '42501'; end if;
  if old.role = 'super' and coalesce(current_setting('app.allow_super_change', true), '') <> 'on' then
    raise exception 'the primary super admin can only be changed by the platform operator in the SQL editor' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then return new; end if;
  return old;
end $$;
create trigger admins_guard before insert or update or delete on public.admins for each row execute function public.admins_guard();

-- Owner Dashboard access = a privileged row AND a multi-factor session (aal2). Existing policies keep calling is_admin().
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
create function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'super') and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
create function public.my_admin_status() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', (select role from public.admins where user_id = auth.uid()), 'aal2', coalesce(auth.jwt() ->> 'aal', '') = 'aal2');
$$;
revoke all on function public.is_super_admin(), public.my_admin_status() from public, anon;
grant execute on function public.is_super_admin(), public.my_admin_status() to authenticated;

-- ============================================================ audit log (append-only)
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null,
  target_type text,
  target_id text,
  details jsonb not null default '{}'
);
create function public.audit_log_immutable() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_audit_purge', true), '') = 'on' then return coalesce(new, old); end if;
  raise exception 'the audit log is append-only' using errcode = '42501';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function public.audit_log_immutable();
alter table public.audit_log enable row level security;
create policy "Privileged admins read the audit log" on public.audit_log for select to authenticated using ((select public.is_admin()));
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create function public.log_audit(p_action text, p_type text, p_target text, p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, details)
  values (auth.uid(), (select role from public.admins where user_id = auth.uid()), p_action, p_type, p_target, coalesce(p_details, '{}'));
$$;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ============================================================ sports catalog
create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 60),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 60),
  category text not null check (category in ('team','racket','aquatic','mind_body','fitness','combat','nutrition')),
  requires_review boolean not null default false,  -- the Super Admin must confirm qualifications / regulatory suitability before a service can be published
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.sports enable row level security;
create policy "Public sees active sports" on public.sports for select to anon using (is_active);
create policy "Members see active sports, admins see all" on public.sports for select to authenticated using (is_active or (select public.is_admin()));
revoke all on public.sports from anon, authenticated;
grant select on public.sports to anon, authenticated;   -- writes only through owner_upsert_sport (audited)

-- ============================================================ coaches (no self-signup)
create table public.coach_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,   -- NULL only for clearly labelled demo profiles, which are not accounts
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  bio text not null default '' check (char_length(bio) <= 1000),
  experience_years int check (experience_years is null or experience_years between 0 and 60),
  qualifications text not null default '' check (char_length(qualifications) <= 1000),
  formats text[] not null default '{}' check (formats <@ array['online','in_person','hybrid']),
  locations text[] not null default '{}' check (cardinality(locations) <= 12),
  participant_categories text[] not null default '{}' check (participant_categories <@ array['adults','women','men','youth','children','seniors','special_needs']),
  accessibility text not null default '' check (char_length(accessibility) <= 500),
  status text not null default 'pending_activation' check (status in ('pending_activation','active','suspended','revoked')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  check (is_demo or user_id is not null)
);
create table public.coach_sports (
  coach_id uuid not null references public.coach_profiles(id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  primary key (coach_id, sport_id)
);
create table public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  status text not null default 'invited' check (status in ('invited','claimed','cancelled','expired')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz
);
create unique index coach_invitations_one_open on public.coach_invitations (email) where status = 'invited';
alter table public.coach_invitations enable row level security;   -- no policies and no grants: reachable only through owner_* functions
revoke all on public.coach_invitations from anon, authenticated;

create function public.my_coach_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.coach_profiles where user_id = auth.uid() and status = 'active';
$$;
create function public.my_coach_profile_id() returns uuid language sql stable security definer set search_path = public as $$
  select id from public.coach_profiles where user_id = auth.uid() and status in ('pending_activation','active');
$$;
create function public.is_coach() returns boolean language sql stable security definer set search_path = public as $$
  select public.my_coach_id() is not null;
$$;
revoke all on function public.my_coach_id(), public.my_coach_profile_id(), public.is_coach() from public, anon;
grant execute on function public.my_coach_id(), public.my_coach_profile_id(), public.is_coach() to authenticated;

create function public.coach_profiles_before_write() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger coach_profiles_before_write before update on public.coach_profiles for each row execute function public.coach_profiles_before_write();

alter table public.coach_profiles enable row level security;
alter table public.coach_sports enable row level security;
create policy "Public sees active coaches" on public.coach_profiles for select to anon using (status = 'active');
create policy "Members see active coaches; a coach sees their own; admins see all" on public.coach_profiles for select to authenticated
  using (status = 'active' or user_id = (select auth.uid()) or (select public.is_admin()));
create policy "Coach edits own profile content" on public.coach_profiles for update to authenticated
  using (user_id = (select auth.uid()) and status in ('pending_activation','active')) with check (user_id = (select auth.uid()));
create policy "Public sees approved specializations of active coaches" on public.coach_sports for select to anon
  using (status = 'approved' and exists (select 1 from public.coach_profiles c where c.id = coach_id and c.status = 'active'));
create policy "Members see approved specializations; coach sees own; admins see all" on public.coach_sports for select to authenticated
  using ((status = 'approved' and exists (select 1 from public.coach_profiles c where c.id = coach_id and c.status = 'active'))
         or coach_id = (select public.my_coach_profile_id()) or (select public.is_admin()));
create policy "Coach proposes specializations for themselves" on public.coach_sports for insert to authenticated
  with check (coach_id = (select public.my_coach_profile_id()));
create policy "Coach withdraws own specializations" on public.coach_sports for delete to authenticated using (coach_id = (select public.my_coach_profile_id()));
revoke all on public.coach_profiles, public.coach_sports from anon, authenticated;
-- user_id is never exposed through the API: public pages use the coach id only.
grant select (id, display_name, bio, experience_years, qualifications, formats, locations, participant_categories, accessibility, status, is_demo) on public.coach_profiles to anon, authenticated;
grant update (display_name, bio, experience_years, qualifications, formats, locations, participant_categories, accessibility) on public.coach_profiles to authenticated;
grant select on public.coach_sports to anon, authenticated;
grant insert (coach_id, sport_id) on public.coach_sports to authenticated;
grant delete on public.coach_sports to authenticated;

-- ---- owner-controlled coach lifecycle: invite -> (invited person signs up as a member, verifies e-mail, claims) -> Super Admin activates
create function public.owner_invite_coach(p_email text, p_name text) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  update public.coach_invitations set status = 'expired' where email = v_email and status = 'invited' and expires_at < now();
  insert into public.coach_invitations (email, display_name, invited_by) values (v_email, btrim(p_name), auth.uid()) returning id into v_id;
  perform public.log_audit('coach.invite', 'coach_invitation', v_id::text, jsonb_build_object('email', v_email));
  return v_id;
end $$;
create function public.owner_cancel_invitation(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  update public.coach_invitations set status = 'cancelled' where id = p_id and status = 'invited';
  if not found then raise exception 'open invitation not found' using errcode = 'P0002'; end if;
  perform public.log_audit('coach.invite_cancel', 'coach_invitation', p_id::text);
end $$;
create function public.owner_list_invitations() returns table (id uuid, email text, display_name text, status text, invited_at timestamptz, expires_at timestamptz, claimed_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  return query select i.id, i.email, i.display_name, case when i.status = 'invited' and i.expires_at < now() then 'expired' else i.status end, i.invited_at, i.expires_at, i.claimed_at
    from public.coach_invitations i order by i.invited_at desc limit 200;
end $$;

-- The invited person calls this after signing up normally and verifying their e-mail. It creates a PENDING coach profile only.
create function public.claim_coach_invitation() returns uuid language plpgsql security definer set search_path = public, auth as $$
declare u record; inv record; v_coach uuid;
begin
  select id, lower(email) as email, email_confirmed_at into u from auth.users where id = auth.uid();
  if not found or u.email_confirmed_at is null then raise exception 'verify your e-mail first' using errcode = '42501'; end if;
  select * into inv from public.coach_invitations where email = u.email and status = 'invited' and expires_at > now();
  if not found then raise exception 'no open coach invitation for this account' using errcode = 'P0002'; end if;
  insert into public.coach_profiles (user_id, display_name, status) values (u.id, inv.display_name, 'pending_activation')
    on conflict (user_id) do update set status = 'pending_activation' where public.coach_profiles.status = 'revoked'
    returning id into v_coach;
  if v_coach is null then select id into v_coach from public.coach_profiles where user_id = u.id; end if;
  update public.coach_invitations set status = 'claimed', claimed_by = u.id, claimed_at = now() where id = inv.id;
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, details) values (u.id, 'member', 'coach.claim', 'coach', v_coach::text, jsonb_build_object('invitation', inv.id));
  return v_coach;
end $$;

create function public.owner_set_coach_status(p_coach uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
declare c public.coach_profiles;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_status not in ('active','suspended','revoked') then raise exception 'invalid status' using errcode = '22023'; end if;
  select * into c from public.coach_profiles where id = p_coach;
  if not found then raise exception 'coach not found' using errcode = 'P0002'; end if;
  if p_status = 'active' and c.status not in ('pending_activation','suspended') then raise exception 'only pending or suspended coaches can be activated' using errcode = '23514'; end if;
  if p_status = 'active' and c.user_id is null and not c.is_demo then raise exception 'coach has no account' using errcode = '23514'; end if;
  update public.coach_profiles set status = p_status, activated_at = case when p_status = 'active' then now() else activated_at end where id = p_coach;
  perform public.log_audit('coach.' || p_status, 'coach', p_coach::text, jsonb_build_object('from', c.status));
end $$;
create function public.owner_review_coach_sport(p_coach uuid, p_sport uuid, p_approve boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  update public.coach_sports set status = case when p_approve then 'approved' else 'rejected' end where coach_id = p_coach and sport_id = p_sport;
  if not found then raise exception 'specialization not found' using errcode = 'P0002'; end if;
  perform public.log_audit('coach.sport_' || case when p_approve then 'approve' else 'reject' end, 'coach', p_coach::text, jsonb_build_object('sport', p_sport));
end $$;
create function public.admin_list_coaches() returns table (id uuid, user_id uuid, email text, display_name text, status text, is_demo boolean, created_at timestamptz, activated_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  return query select c.id, c.user_id, u.email::text, c.display_name, c.status, c.is_demo, c.created_at, c.activated_at
    from public.coach_profiles c left join auth.users u on u.id = c.user_id order by c.created_at desc limit 500;
end $$;
-- Emergency power: suspend a coach immediately (cannot create, activate, revoke or approve anyone).
create function public.admin_suspend_coach(p_coach uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  update public.coach_profiles set status = 'suspended' where id = p_coach and status in ('pending_activation','active');
  if not found then raise exception 'coach not found or already suspended/revoked' using errcode = 'P0002'; end if;
  perform public.log_audit('coach.suspend', 'coach', p_coach::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 300), 'emergency', not public.is_super_admin()));
end $$;
-- A coach sees only the first name field of members who booked THEIR services, never other profile data.
create function public.coach_trainees() returns table (booking_id uuid, member_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.my_coach_id() is null then raise exception 'active coaches only' using errcode = '42501'; end if;
  return query select b.id, p.full_name from public.bookings b left join public.profiles p on p.user_id = b.user_id where b.coach_id = public.my_coach_id();
end $$;

-- ============================================================ services (extends the demo services table; the 4 platform demos stay published)
alter table public.services
  add column coach_id uuid references public.coach_profiles(id) on delete set null,
  add column sport_id uuid references public.sports(id),
  add column format text not null default 'private' check (format in ('private','group')),
  add column delivery text not null default 'in_person' check (delivery in ('online','in_person','hybrid')),
  add column location text not null default '' check (char_length(location) <= 120),
  add column capacity int not null default 1 check (capacity between 1 and 50),
  add column min_age int check (min_age is null or min_age between 3 and 99),
  add column max_age int check (max_age is null or max_age between 3 and 99),
  add column accessibility text not null default '' check (char_length(accessibility) <= 500),
  add column duration_minutes int not null default 60 check (duration_minutes between 15 and 240),
  add column status text not null default 'published' check (status in ('draft','submitted','published','rejected','archived')),
  add column qualification_checked boolean not null default false,
  add column platform_owned boolean not null default false,   -- true only for services the platform itself offers (the 4 original demos and Super-Admin-created ones)
  add column updated_at timestamptz not null default now(),
  add constraint services_age_order check (min_age is null or max_age is null or max_age >= min_age);
update public.services set platform_owned = true where coach_id is null;   -- the 4 existing demo services (only these rows exist at this point)
create index services_coach_idx on public.services (coach_id);
create index services_sport_idx on public.services (sport_id);

create function public.owns_service(p_service uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.services where id = p_service and coach_id = public.my_coach_id());
$$;
revoke all on function public.owns_service(uuid) from public, anon;
grant execute on function public.owns_service(uuid) to authenticated;

create function public.services_before_write() returns trigger language plpgsql set search_path = public as $$
declare adm boolean; v_coach uuid;
begin
  new.updated_at := now();
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;   -- trusted functions set status themselves
  adm := public.is_super_admin(); v_coach := public.my_coach_id();
  if tg_op = 'INSERT' then
    if not adm and v_coach is null then raise exception 'only active coaches can propose services' using errcode = '42501'; end if;
    new.coach_id := case when adm then null else v_coach end;
    new.platform_owned := adm;
    if not adm and new.sport_id is null then raise exception 'choose a sport' using errcode = '23514'; end if;
    new.status := 'draft'; new.qualification_checked := false; new.is_demo := true; new.is_available := true;
    if not adm and not exists (select 1 from public.coach_sports cs where cs.coach_id = v_coach and cs.sport_id = new.sport_id and cs.status = 'approved') then
      raise exception 'choose one of your approved specializations' using errcode = '23514';
    end if;
  else
    if new.name is distinct from old.name or new.description is distinct from old.description or new.price_kwd is distinct from old.price_kwd
       or new.sport_id is distinct from old.sport_id or new.format is distinct from old.format or new.delivery is distinct from old.delivery
       or new.location is distinct from old.location or new.capacity is distinct from old.capacity or new.min_age is distinct from old.min_age
       or new.max_age is distinct from old.max_age or new.accessibility is distinct from old.accessibility or new.duration_minutes is distinct from old.duration_minutes then
      new.qualification_checked := false;
      new.status := case old.status when 'rejected' then 'draft' when 'published' then 'submitted' else old.status end;   -- price or content changes need approval again
    end if;
  end if;
  return new;
end $$;
create trigger services_before_write before insert or update on public.services for each row execute function public.services_before_write();

drop policy "Signed-in users view available services" on public.services;
create policy "Public sees published services" on public.services for select to anon
  using (status = 'published' and is_available and (platform_owned or exists (select 1 from public.coach_profiles c where c.id = coach_id and c.status = 'active')));
create policy "Members see published services, coaches their own, admins all" on public.services for select to authenticated
  using ((status = 'published' and is_available and (platform_owned or exists (select 1 from public.coach_profiles c where c.id = coach_id and c.status = 'active')))
         or coach_id = (select public.my_coach_id()) or (select public.is_admin()));
create policy "Active coach or super admin proposes services" on public.services for insert to authenticated
  with check ((select public.is_super_admin()) or (coach_id = (select public.my_coach_id())));
create policy "Coach edits own services, super admin any" on public.services for update to authenticated
  using ((select public.is_super_admin()) or coach_id = (select public.my_coach_id()))
  with check ((select public.is_super_admin()) or coach_id = (select public.my_coach_id()));
revoke all on public.services from anon;
grant select on public.services to anon;
grant insert (name, description, price_kwd, sport_id, format, delivery, location, capacity, min_age, max_age, accessibility, duration_minutes) on public.services to authenticated;
grant update (name, description, price_kwd, sport_id, format, delivery, location, capacity, min_age, max_age, accessibility, duration_minutes) on public.services to authenticated;

create function public.coach_set_service_status(p_service uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('submitted','archived') then raise exception 'invalid status' using errcode = '22023'; end if;
  if public.my_coach_id() is null then raise exception 'active coaches only' using errcode = '42501'; end if;
  update public.services set status = p_status
   where id = p_service and coach_id = public.my_coach_id()
     and ((p_status = 'submitted' and status in ('draft','rejected')) or (p_status = 'archived' and status <> 'archived'));
  if not found then raise exception 'service not found or status change not allowed' using errcode = 'P0002'; end if;
end $$;
create function public.owner_review_service(p_service uuid, p_decision text, p_qualification_checked boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare s record; sp record;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_decision not in ('published','rejected') then raise exception 'invalid decision' using errcode = '22023'; end if;
  select * into s from public.services where id = p_service;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;
  if p_decision = 'published' then
    if s.status <> 'submitted' and s.coach_id is not null then raise exception 'only submitted services can be published' using errcode = '23514'; end if;
    if s.coach_id is not null and not exists (select 1 from public.coach_profiles c where c.id = s.coach_id and c.status = 'active') then
      raise exception 'coach is not active' using errcode = '23514'; end if;
    if s.coach_id is not null and (s.sport_id is null or not exists (select 1 from public.coach_sports cs where cs.coach_id = s.coach_id and cs.sport_id = s.sport_id and cs.status = 'approved')) then
      raise exception 'the sport must be one of the coach''s approved specializations' using errcode = '23514'; end if;
    select * into sp from public.sports where id = s.sport_id;
    if found and (not sp.is_active) then raise exception 'sport is not active' using errcode = '23514'; end if;
    if found and sp.requires_review and not p_qualification_checked then
      raise exception 'this sport requires the super admin to confirm qualifications and regulatory suitability first' using errcode = '23514'; end if;
  end if;
  update public.services set status = p_decision, qualification_checked = (p_decision = 'published' and p_qualification_checked) where id = p_service;
  perform public.log_audit('service.' || p_decision, 'service', p_service::text, jsonb_build_object('price_kwd', s.price_kwd, 'qualification_checked', p_qualification_checked));
end $$;
-- Emergency power: take a service offline immediately (cannot publish anything).
create function public.admin_unpublish_service(p_service uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  update public.services set status = 'archived' where id = p_service and status <> 'archived';
  if not found then raise exception 'service not found or already archived' using errcode = 'P0002'; end if;
  perform public.log_audit('service.unpublish', 'service', p_service::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 300), 'emergency', not public.is_super_admin()));
end $$;

-- ============================================================ availability slots
create table public.service_slots (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (service_id, starts_at)
);
create index service_slots_service_idx on public.service_slots (service_id, starts_at);
alter table public.service_slots enable row level security;
create policy "Slots: own coach, admins, or published services" on public.service_slots for select to authenticated
  using ((select public.is_admin()) or (select public.owns_service(service_id))
         or exists (select 1 from public.services s where s.id = service_id and s.status = 'published' and s.is_available
                    and (s.platform_owned or exists (select 1 from public.coach_profiles c where c.id = s.coach_id and c.status = 'active'))));
create policy "Coach adds slots to own services" on public.service_slots for insert to authenticated
  with check ((select public.owns_service(service_id)) and starts_at > now());
create policy "Coach removes own slots" on public.service_slots for delete to authenticated using ((select public.owns_service(service_id)));
revoke all on public.service_slots from anon, authenticated;
grant select, delete on public.service_slots to authenticated;
grant insert (service_id, starts_at) on public.service_slots to authenticated;

-- ============================================================ bookings
alter table public.bookings
  add column coach_id uuid references public.coach_profiles(id) on delete set null,
  add column slot_id uuid references public.service_slots(id) on delete set null,
  add column participants int not null default 1 check (participants between 1 and 50),
  add column guardian_consent boolean not null default false;
create index bookings_coach_idx on public.bookings (coach_id);
create index bookings_slot_idx on public.bookings (slot_id);

create function public.slot_taken(p_slot uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(b.participants), 0)::int from public.bookings b
    join public.service_slots sl on sl.id = b.slot_id join public.services s on s.id = sl.service_id
   where b.slot_id = p_slot and b.booking_status <> 'cancelled' and s.status = 'published';
$$;
revoke all on function public.slot_taken(uuid) from public, anon;
grant execute on function public.slot_taken(uuid) to authenticated;

-- Public availability: published services only, future slots, remaining seats (no personal data).
create function public.public_slots(p_service uuid) returns table (id uuid, starts_at timestamptz, remaining int)
language sql stable security definer set search_path = public as $$
  select sl.id, sl.starts_at, greatest(0, s.capacity - public.slot_taken(sl.id))
    from public.service_slots sl join public.services s on s.id = sl.service_id
   where sl.service_id = p_service and s.status = 'published' and s.is_available and sl.starts_at > now() + interval '1 hour'
     and (s.platform_owned or exists (select 1 from public.coach_profiles c where c.id = s.coach_id and c.status = 'active'))
   order by sl.starts_at limit 200;
$$;
revoke all on function public.public_slots(uuid) from public;
grant execute on function public.public_slots(uuid) to anon, authenticated;

create or replace function public.bookings_before_insert() returns trigger language plpgsql set search_path = public as $$
declare s record; sl record;
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.booking_status <> 'pending' or new.payment_status <> 'pending' then
      raise exception 'customers cannot set booking_status or payment_status' using errcode = '42501';
    end if;
  end if;
  select sv.price_kwd, sv.is_available, sv.status, sv.coach_id, sv.capacity, sv.min_age, sv.format, sv.platform_owned into s from public.services sv where sv.id = new.service_id;
  if not found or not s.is_available or s.status <> 'published'
     or (not s.platform_owned and not exists (select 1 from public.coach_profiles c where c.id = s.coach_id and c.status = 'active')) then
    raise exception 'service is not available' using errcode = '23514';
  end if;
  new.price_kwd := s.price_kwd;     -- server-side price, always
  new.coach_id := s.coach_id;
  if new.participants > s.capacity or (s.format = 'private' and new.participants <> 1) then
    raise exception 'participants exceed the service capacity' using errcode = '23514';
  end if;
  if s.min_age is not null and s.min_age < 18 and not new.guardian_consent then
    raise exception 'guardian consent is required for services open to minors' using errcode = '23514';
  end if;
  if new.slot_id is not null or exists (select 1 from public.service_slots x where x.service_id = new.service_id and x.starts_at > now()) then
    if new.slot_id is null then raise exception 'choose an available slot' using errcode = '23514'; end if;
    select * into sl from public.service_slots x where x.id = new.slot_id and x.service_id = new.service_id;
    if not found then raise exception 'slot not found' using errcode = '23514'; end if;
    perform pg_advisory_xact_lock(hashtext(new.slot_id::text));
    if public.slot_taken(new.slot_id) + new.participants > s.capacity then raise exception 'slot is full' using errcode = '23514'; end if;
    new.scheduled_at := sl.starts_at;
  end if;
  if new.scheduled_at < now() + interval '1 hour' or new.scheduled_at > now() + interval '90 days' then
    raise exception 'scheduled_at must be between 1 hour and 90 days from now' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;

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
  new.updated_at := now();
  return new;
end $$;

-- Booking status changes: the Super Admin may set any status; the Emergency Admin may only cancel (through admin_cancel_booking).
drop policy "Admins update bookings" on public.bookings;
create policy "Super admin updates bookings" on public.bookings for update to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy "Coaches view bookings of their own services" on public.bookings for select to authenticated using (coach_id = (select public.my_coach_id()));
create policy "Coaches update status of bookings of their own services" on public.bookings for update to authenticated
  using (coach_id = (select public.my_coach_id())) with check (coach_id = (select public.my_coach_id()));
grant insert (slot_id, participants, guardian_consent) on public.bookings to authenticated;

create function public.admin_cancel_booking(p_booking uuid, p_reason text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  update public.bookings set booking_status = 'cancelled' where id = p_booking and booking_status <> 'cancelled';
  if not found then raise exception 'booking not found or already cancelled' using errcode = 'P0002'; end if;
  perform public.log_audit('booking.cancel', 'booking', p_booking::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 300), 'emergency', not public.is_super_admin()));
end $$;

-- ============================================================ Super Admin management
create function public.owner_set_emergency_admin(p_user uuid) returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  if exists (select 1 from public.admins where user_id = p_user and role = 'super') then raise exception 'the super admin cannot be the emergency admin' using errcode = '23514'; end if;
  if not exists (select 1 from auth.users where id = p_user and email_confirmed_at is not null) then raise exception 'user not found or e-mail not verified' using errcode = 'P0002'; end if;
  delete from public.admins where role = 'emergency';
  insert into public.admins (user_id, role, granted_by) values (p_user, 'emergency', auth.uid());
  perform public.log_audit('admin.emergency_assign', 'user', p_user::text);
end $$;
create function public.owner_clear_emergency_admin() returns void language plpgsql security definer set search_path = public as $$
declare v_old uuid;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  delete from public.admins where role = 'emergency' returning user_id into v_old;
  if v_old is not null then perform public.log_audit('admin.emergency_revoke', 'user', v_old::text); end if;
end $$;
create function public.owner_list_users() returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, coach_status text, admin_role text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  return query select u.id, u.email::text, u.created_at, u.last_sign_in_at, c.status, a.role
    from auth.users u left join public.coach_profiles c on c.user_id = u.id left join public.admins a on a.user_id = u.id
    order by u.created_at desc limit 500;
end $$;
-- Individual personal records are available to the Super Admin only when needed, and every look is audited. No health measurements, no credentials.
create function public.admin_view_member(p_user uuid, p_reason text) returns table (user_id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz)
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'state a reason for viewing a personal record' using errcode = '22023'; end if;
  perform public.log_audit('member.view', 'user', p_user::text, jsonb_build_object('reason', left(p_reason, 300)));
  return query select u.id, u.email::text, p.full_name, u.created_at, u.last_sign_in_at from auth.users u left join public.profiles p on p.user_id = u.id where u.id = p_user;
end $$;
create function public.owner_platform_stats() returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'administrators only' using errcode = '42501'; end if;
  return jsonb_build_object('users', (select count(*) from auth.users), 'coaches_active', (select count(*) from public.coach_profiles where status = 'active' and not is_demo),
    'coaches_pending', (select count(*) from public.coach_profiles where status = 'pending_activation'), 'services_published', (select count(*) from public.services where status = 'published'),
    'services_submitted', (select count(*) from public.services where status = 'submitted'), 'bookings', (select count(*) from public.bookings), 'workouts', (select count(*) from public.workouts));
end $$;

create table public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.platform_settings enable row level security;   -- no policies, no grants: owner_get_settings / owner_set_setting only
revoke all on public.platform_settings from anon, authenticated;
insert into public.platform_settings (key, value) values ('commission_percent', '0'::jsonb), ('bookings_are_demo', 'true'::jsonb);
create function public.owner_get_settings() returns setof public.platform_settings language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  return query select * from public.platform_settings order by key;
end $$;
create function public.owner_set_setting(p_key text, p_value jsonb) returns void language plpgsql security definer set search_path = public as $$
declare v_old jsonb;
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  if p_key = 'commission_percent' and (jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}')::numeric not between 0 and 50) then raise exception 'commission must be between 0 and 50' using errcode = '22023'; end if;
  select value into v_old from public.platform_settings where key = p_key;
  if not found then raise exception 'unknown setting' using errcode = 'P0002'; end if;
  update public.platform_settings set value = p_value, updated_at = now() where key = p_key;
  perform public.log_audit('setting.update', 'setting', p_key, jsonb_build_object('old', v_old, 'new', p_value));
end $$;
create function public.owner_upsert_sport(p_slug text, p_name_ar text, p_name_en text, p_category text, p_requires_review boolean, p_is_active boolean, p_sort int default 100) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'super admin only' using errcode = '42501'; end if;
  insert into public.sports (slug, name_ar, name_en, category, requires_review, is_active, sort_order) values (p_slug, p_name_ar, p_name_en, p_category, p_requires_review, p_is_active, p_sort)
  on conflict (slug) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, category = excluded.category, requires_review = excluded.requires_review, is_active = excluded.is_active, sort_order = excluded.sort_order;
  perform public.log_audit('sport.upsert', 'sport', p_slug, jsonb_build_object('active', p_is_active, 'requires_review', p_requires_review));
end $$;

-- Expose only what each function needs: nothing is callable by anonymous visitors except public_slots.
revoke all on function
  public.owner_invite_coach(text, text), public.owner_cancel_invitation(uuid), public.owner_list_invitations(), public.claim_coach_invitation(),
  public.owner_set_coach_status(uuid, text), public.owner_review_coach_sport(uuid, uuid, boolean), public.admin_list_coaches(), public.admin_suspend_coach(uuid, text),
  public.coach_trainees(), public.coach_set_service_status(uuid, text), public.owner_review_service(uuid, text, boolean), public.admin_unpublish_service(uuid, text),
  public.admin_cancel_booking(uuid, text), public.owner_set_emergency_admin(uuid), public.owner_clear_emergency_admin(), public.owner_list_users(),
  public.admin_view_member(uuid, text), public.owner_platform_stats(), public.owner_get_settings(), public.owner_set_setting(text, jsonb),
  public.owner_upsert_sport(text, text, text, text, boolean, boolean, int)
  from public, anon;
grant execute on function
  public.owner_invite_coach(text, text), public.owner_cancel_invitation(uuid), public.owner_list_invitations(), public.claim_coach_invitation(),
  public.owner_set_coach_status(uuid, text), public.owner_review_coach_sport(uuid, uuid, boolean), public.admin_list_coaches(), public.admin_suspend_coach(uuid, text),
  public.coach_trainees(), public.coach_set_service_status(uuid, text), public.owner_review_service(uuid, text, boolean), public.admin_unpublish_service(uuid, text),
  public.admin_cancel_booking(uuid, text), public.owner_set_emergency_admin(uuid), public.owner_clear_emergency_admin(), public.owner_list_users(),
  public.admin_view_member(uuid, text), public.owner_platform_stats(), public.owner_get_settings(), public.owner_set_setting(text, jsonb),
  public.owner_upsert_sport(text, text, text, text, boolean, boolean, int)
  to authenticated;

-- Private coach documents: a coach (pending or active) may only touch their own folder; only the Super Admin can read them. Minimise what is collected.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coach-documents', 'coach-documents', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
create policy "Coach manages own documents" on storage.objects for all to authenticated
  using (bucket_id = 'coach-documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.my_coach_profile_id()) is not null)
  with check (bucket_id = 'coach-documents' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.my_coach_profile_id()) is not null);
create policy "Super admin reads coach documents" on storage.objects for select to authenticated
  using (bucket_id = 'coach-documents' and (select public.is_super_admin()));

-- ============================================================ seed: sports (potential catalog entries, NOT proof of permission to operate commercially)
insert into public.sports (slug, name_ar, name_en, category, requires_review, sort_order) values
 ('football','كرة القدم','Football','team',false,10), ('futsal','كرة الصالات','Futsal','team',false,11),
 ('basketball','كرة السلة','Basketball','team',false,12), ('volleyball','الكرة الطائرة','Volleyball','team',false,13), ('handball','كرة اليد','Handball','team',false,14),
 ('padel','البادل','Padel','racket',false,20), ('tennis','التنس','Tennis','racket',false,21), ('table-tennis','تنس الطاولة','Table tennis','racket',false,22),
 ('badminton','الريشة الطائرة','Badminton','racket',false,23), ('squash','الاسكواش','Squash','racket',false,24),
 ('swimming','السباحة','Swimming','aquatic',true,30), ('aqua-fitness','لياقة مائية','Aquatic fitness','aquatic',true,31),
 ('gymnastics','الجمباز','Gymnastics','mind_body',true,40), ('yoga','اليوغا','Yoga','mind_body',false,41), ('pilates','البيلاتس','Pilates','mind_body',false,42), ('flexibility','تدريب المرونة','Flexibility training','mind_body',false,43),
 ('running','الجري','Running','fitness',false,50), ('athletics','ألعاب القوى','Athletics','fitness',false,51), ('rope-skipping','نط الحبل','Rope skipping','fitness',false,52),
 ('functional-fitness','اللياقة الوظيفية','Functional fitness','fitness',false,53), ('strength-training','تدريب القوة','Strength training','fitness',false,54),
 ('karate','الكاراتيه','Karate','combat',true,60), ('judo','الجودو','Judo','combat',true,61), ('taekwondo','التايكوندو','Taekwondo','combat',true,62),
 ('wrestling','المصارعة','Wrestling','combat',true,63), ('boxing','الملاكمة (تدريب مُشرف عليه)','Supervised boxing training','combat',true,64),
 ('nutrition-plan','نظام غذائي مخصص','Personalised nutrition plan','nutrition',true,70), ('nutrition-consult','استشارة تغذية','Nutrition consultation','nutrition',true,71);

-- ============================================================ seed: clearly labelled DEMO coach profiles. They are NOT accounts: no auth.users rows, nobody can log in as them.
insert into public.coach_profiles (id, user_id, display_name, bio, experience_years, qualifications, formats, locations, participant_categories, accessibility, status, is_demo, activated_at) values
 ('c0000000-0000-4000-8000-000000000001', null, 'مدرب تجريبي – كرة القدم','ملف تجريبي لعرض شكل صفحة المدرب. ليس شخصاً حقيقياً.',8,'بيانات تجريبية','{in_person,hybrid}','{الكويت العاصمة,حولي}','{youth,adults,children}','بيانات تجريبية','active',true,now()),
 ('c0000000-0000-4000-8000-000000000002', null, 'مدربة تجريبية – يوغا وبيلاتس','ملف تجريبي لعرض شكل صفحة المدربة. ليست شخصاً حقيقياً.',6,'بيانات تجريبية','{online,in_person}','{الفروانية,الجهراء}','{women,adults,seniors}','بيانات تجريبية','active',true,now()),
 ('c0000000-0000-4000-8000-000000000003', null, 'مدرب تجريبي – قوة ولياقة','ملف تجريبي لعرض شكل صفحة المدرب. ليس شخصاً حقيقياً.',10,'بيانات تجريبية','{online,in_person,hybrid}','{السالمية,مبارك الكبير}','{adults,men,women}','بيانات تجريبية','active',true,now());
insert into public.coach_sports (coach_id, sport_id, status)
select t.coach_id, s.id, 'approved' from (values
  ('c0000000-0000-4000-8000-000000000001'::uuid,'football'), ('c0000000-0000-4000-8000-000000000001'::uuid,'futsal'),
  ('c0000000-0000-4000-8000-000000000002'::uuid,'yoga'), ('c0000000-0000-4000-8000-000000000002'::uuid,'pilates'),
  ('c0000000-0000-4000-8000-000000000003'::uuid,'strength-training'), ('c0000000-0000-4000-8000-000000000003'::uuid,'functional-fitness')) as t(coach_id, slug)
join public.sports s on s.slug = t.slug;
insert into public.services (id, name, description, price_kwd, is_demo, coach_id, sport_id, format, delivery, location, capacity, min_age, max_age, duration_minutes, status)
select v.id, v.name, v.descr, v.price, true, v.coach, s.id, v.format, v.delivery, v.loc, v.cap, v.minage, v.maxage, v.dur, 'published'
from (values
 ('e0000000-0000-4000-8000-000000000001'::uuid,'تدريب كرة قدم فردي (تجريبي)','خدمة تجريبية لعرض الحجز: جلسة تطوير مهارات فردية.',10.000,'c0000000-0000-4000-8000-000000000001'::uuid,'football','private','in_person','حولي',1,12,40,60),
 ('e0000000-0000-4000-8000-000000000002'::uuid,'تدريب كرة صالات جماعي (تجريبي)','خدمة تجريبية: حصة جماعية للشباب مع موافقة ولي الأمر لمن هم دون 18.',4.000,'c0000000-0000-4000-8000-000000000001'::uuid,'futsal','group','in_person','الكويت العاصمة',12,10,17,75),
 ('e0000000-0000-4000-8000-000000000003'::uuid,'يوغا للمبتدئات – أونلاين (تجريبي)','خدمة تجريبية: حصة يوغا مباشرة عبر الإنترنت.',6.000,'c0000000-0000-4000-8000-000000000002'::uuid,'yoga','group','online','',15,18,70,60),
 ('e0000000-0000-4000-8000-000000000004'::uuid,'بيلاتس فردي (تجريبي)','خدمة تجريبية: جلسة بيلاتس فردية.',12.000,'c0000000-0000-4000-8000-000000000002'::uuid,'pilates','private','in_person','الفروانية',1,16,70,50),
 ('e0000000-0000-4000-8000-000000000005'::uuid,'برنامج قوة فردي (تجريبي)','خدمة تجريبية: جلسة تدريب قوة فردية.',11.000,'c0000000-0000-4000-8000-000000000003'::uuid,'strength-training','private','hybrid','السالمية',1,16,60,60),
 ('e0000000-0000-4000-8000-000000000006'::uuid,'لياقة وظيفية جماعية (تجريبي)','خدمة تجريبية: حصة لياقة وظيفية لمجموعة صغيرة.',5.000,'c0000000-0000-4000-8000-000000000003'::uuid,'functional-fitness','group','in_person','مبارك الكبير',8,16,60,60)
) as v(id, name, descr, price, coach, slug, format, delivery, loc, cap, minage, maxage, dur)
join public.sports s on s.slug = v.slug;
-- Demo availability for the next 60 days (17:00 and 19:00 Kuwait time). Demo data only: it is not refreshed automatically.
insert into public.service_slots (service_id, starts_at)
select s.id, (d::date + t)::timestamp at time zone 'Asia/Kuwait'
from public.services s, generate_series(current_date + 2, current_date + 60, interval '1 day') d, (values (time '17:00'), (time '19:00')) as x(t)
where s.id::text like 'e0000000-%';

commit;
