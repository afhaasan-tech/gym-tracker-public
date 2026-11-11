-- Kuwait-first multi-sport discovery platform: sports catalog, independent trainers, owner-approved services, slots, bookings.
-- Roles: OWNER = public.admins (managed in SQL only); TRAINER = approved row in trainer_profiles; MEMBER = any signed-in user.
-- Everything privileged happens through SECURITY DEFINER functions that check the caller; the UI is never trusted.
-- All bookings stay DEMONSTRATIONS: no payment, no fulfilment. payment_status remains server-only.

-- ---------------------------------------------------------------- sports catalog
create table public.sports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name_ar text not null check (char_length(btrim(name_ar)) between 1 and 60),
  name_en text not null check (char_length(btrim(name_en)) between 1 and 60),
  category text not null check (category in ('team','racket','aquatic','mind_body','fitness','combat','nutrition')),
  requires_review boolean not null default false,  -- owner must confirm qualifications / regulatory suitability before a service can be published
  is_active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.sports enable row level security;
create policy "Public sees active sports" on public.sports for select to anon using (is_active);
create policy "Members see active sports, owner sees all" on public.sports for select to authenticated using (is_active or (select public.is_admin()));
create policy "Owner adds sports" on public.sports for insert to authenticated with check ((select public.is_admin()));
create policy "Owner edits sports" on public.sports for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.sports from anon, authenticated;
grant select on public.sports to anon, authenticated;
grant insert (slug, name_ar, name_en, category, requires_review, is_active, sort_order) on public.sports to authenticated;
grant update (name_ar, name_en, category, requires_review, is_active, sort_order) on public.sports to authenticated;

-- ---------------------------------------------------------------- trainers (independent coaches only)
create table public.trainer_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  bio text not null default '' check (char_length(bio) <= 1000),
  experience_years int check (experience_years is null or experience_years between 0 and 60),
  qualifications text not null default '' check (char_length(qualifications) <= 1000),
  formats text[] not null default '{}' check (formats <@ array['online','in_person','hybrid']),
  locations text[] not null default '{}' check (cardinality(locations) <= 12),
  participant_categories text[] not null default '{}' check (participant_categories <@ array['adults','women','men','youth','children','seniors','special_needs']),
  accessibility text not null default '' check (char_length(accessibility) <= 500),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','suspended')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);
create table public.trainer_sports (
  trainer_id uuid not null references public.trainer_profiles(user_id) on delete cascade,
  sport_id uuid not null references public.sports(id) on delete cascade,
  primary key (trainer_id, sport_id)
);

create function public.is_trainer() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trainer_profiles where user_id = auth.uid() and status = 'approved');
$$;
revoke all on function public.is_trainer() from public, anon;
grant execute on function public.is_trainer() to authenticated;

-- Changing public profile content, or the sports a trainer lists, sends an approved profile back for review.
create function public.trainer_profiles_before_write() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;
  if tg_op = 'UPDATE' and old.status in ('approved','rejected') and (
       new.display_name is distinct from old.display_name or new.bio is distinct from old.bio
    or new.experience_years is distinct from old.experience_years or new.qualifications is distinct from old.qualifications
    or new.formats is distinct from old.formats or new.locations is distinct from old.locations
    or new.participant_categories is distinct from old.participant_categories or new.accessibility is distinct from old.accessibility) then
    new.status := case old.status when 'approved' then 'submitted' else 'draft' end;
  end if;
  return new;
end $$;
create trigger trainer_profiles_before_write before insert or update on public.trainer_profiles
  for each row execute function public.trainer_profiles_before_write();

create function public.trainer_sports_after_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.trainer_profiles set status = 'submitted' where user_id = coalesce(new.trainer_id, old.trainer_id) and status = 'approved';
  return null;
end $$;
revoke all on function public.trainer_sports_after_change() from public, anon, authenticated;
create trigger trainer_sports_after_change after insert or delete on public.trainer_sports
  for each row execute function public.trainer_sports_after_change();

alter table public.trainer_profiles enable row level security;
alter table public.trainer_sports enable row level security;
create policy "Public sees approved trainers" on public.trainer_profiles for select to anon using (status = 'approved');
create policy "Members see approved trainers, own profile, owner sees all" on public.trainer_profiles for select to authenticated
  using (status = 'approved' or (select auth.uid()) = user_id or (select public.is_admin()));
create policy "Member creates own trainer application" on public.trainer_profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Trainer edits own application" on public.trainer_profiles for update to authenticated
  using ((select auth.uid()) = user_id and status <> 'suspended') with check ((select auth.uid()) = user_id);
create policy "Public sees specializations of approved trainers" on public.trainer_sports for select to anon
  using (exists (select 1 from public.trainer_profiles t where t.user_id = trainer_id and t.status = 'approved'));
create policy "Members see specializations" on public.trainer_sports for select to authenticated
  using ((select auth.uid()) = trainer_id or (select public.is_admin()) or exists (select 1 from public.trainer_profiles t where t.user_id = trainer_id and t.status = 'approved'));
create policy "Trainer adds own specializations" on public.trainer_sports for insert to authenticated with check ((select auth.uid()) = trainer_id);
create policy "Trainer removes own specializations" on public.trainer_sports for delete to authenticated using ((select auth.uid()) = trainer_id);
revoke all on public.trainer_profiles, public.trainer_sports from anon, authenticated;
grant select on public.trainer_profiles, public.trainer_sports to anon, authenticated;
grant insert (display_name, bio, experience_years, qualifications, formats, locations, participant_categories, accessibility) on public.trainer_profiles to authenticated;
grant update (display_name, bio, experience_years, qualifications, formats, locations, participant_categories, accessibility) on public.trainer_profiles to authenticated;
grant insert, delete on public.trainer_sports to authenticated;

create function public.submit_trainer_application() returns void language plpgsql security definer set search_path = public as $$
declare t public.trainer_profiles;
begin
  select * into t from public.trainer_profiles where user_id = auth.uid();
  if not found then raise exception 'no application' using errcode = 'P0002'; end if;
  if t.status not in ('draft','rejected') then raise exception 'application already submitted' using errcode = '23514'; end if;
  if cardinality(t.formats) = 0 or cardinality(t.locations) = 0 and not ('online' = any (t.formats))
     or not exists (select 1 from public.trainer_sports where trainer_id = t.user_id) then
    raise exception 'choose at least one sport, one training format and a location (or online)' using errcode = '23514';
  end if;
  update public.trainer_profiles set status = 'submitted' where user_id = t.user_id;
end $$;
revoke all on function public.submit_trainer_application() from public, anon;
grant execute on function public.submit_trainer_application() to authenticated;

create function public.owner_review_trainer(p_user uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'owner only' using errcode = '42501'; end if;
  if p_status not in ('approved','rejected','suspended') then raise exception 'invalid status' using errcode = '22023'; end if;
  update public.trainer_profiles set status = p_status, approved_at = case when p_status = 'approved' then now() else approved_at end where user_id = p_user;
  if not found then raise exception 'trainer not found' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.owner_review_trainer(uuid, text) from public, anon;
grant execute on function public.owner_review_trainer(uuid, text) to authenticated;

-- ---------------------------------------------------------------- services (extends the demo services table; the 4 platform demos stay published)
alter table public.services
  add column trainer_id uuid references public.trainer_profiles(user_id) on delete set null,
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
  add column updated_at timestamptz not null default now(),
  add constraint services_age_order check (min_age is null or max_age is null or max_age >= min_age);
create index services_trainer_idx on public.services (trainer_id);
create index services_sport_idx on public.services (sport_id);

create function public.owns_service(p_service uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.services where id = p_service and trainer_id = auth.uid());
$$;
revoke all on function public.owns_service(uuid) from public, anon;
grant execute on function public.owns_service(uuid) to authenticated;

create function public.services_before_write() returns trigger language plpgsql set search_path = public as $$
declare adm boolean;
begin
  new.updated_at := now();
  if current_user in ('postgres','supabase_admin','service_role') then return new; end if;   -- trusted functions set status themselves
  adm := public.is_admin();
  if tg_op = 'INSERT' then
    if not adm and not public.is_trainer() then raise exception 'only approved trainers can propose services' using errcode = '42501'; end if;
    new.trainer_id := case when adm then null else auth.uid() end;
    new.status := 'draft'; new.qualification_checked := false; new.is_demo := true; new.is_available := true;
    if not adm and new.sport_id is not null and not exists (select 1 from public.trainer_sports ts where ts.trainer_id = auth.uid() and ts.sport_id = new.sport_id) then
      raise exception 'choose one of your approved specializations' using errcode = '23514';
    end if;
  else
    if new.name is distinct from old.name or new.description is distinct from old.description or new.price_kwd is distinct from old.price_kwd
       or new.sport_id is distinct from old.sport_id or new.format is distinct from old.format or new.delivery is distinct from old.delivery
       or new.location is distinct from old.location or new.capacity is distinct from old.capacity or new.min_age is distinct from old.min_age
       or new.max_age is distinct from old.max_age or new.accessibility is distinct from old.accessibility or new.duration_minutes is distinct from old.duration_minutes then
      new.qualification_checked := false;
      new.status := case old.status when 'rejected' then 'draft' when 'published' then 'submitted' else old.status end;   -- price or content changes need owner approval again
    end if;
  end if;
  return new;
end $$;
create trigger services_before_write before insert or update on public.services for each row execute function public.services_before_write();

drop policy "Signed-in users view available services" on public.services;
create policy "Public sees published services" on public.services for select to anon using (status = 'published' and is_available);
create policy "Members see published services, trainers their own, owner all" on public.services for select to authenticated
  using ((status = 'published' and is_available) or trainer_id = (select auth.uid()) or (select public.is_admin()));
create policy "Trainer or owner proposes services" on public.services for insert to authenticated
  with check ((select public.is_admin()) or (trainer_id = (select auth.uid()) and (select public.is_trainer())));
create policy "Trainer edits own services, owner any" on public.services for update to authenticated
  using ((select public.is_admin()) or (trainer_id = (select auth.uid()) and (select public.is_trainer())))
  with check ((select public.is_admin()) or (trainer_id = (select auth.uid()) and (select public.is_trainer())));
revoke all on public.services from anon;
grant select on public.services to anon;
grant insert (name, description, price_kwd, sport_id, format, delivery, location, capacity, min_age, max_age, accessibility, duration_minutes) on public.services to authenticated;
grant update (name, description, price_kwd, sport_id, format, delivery, location, capacity, min_age, max_age, accessibility, duration_minutes) on public.services to authenticated;

create function public.trainer_set_service_status(p_service uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('submitted','archived') then raise exception 'invalid status' using errcode = '22023'; end if;
  if not public.is_trainer() then raise exception 'approved trainers only' using errcode = '42501'; end if;
  update public.services set status = p_status
   where id = p_service and trainer_id = auth.uid()
     and ((p_status = 'submitted' and status in ('draft','rejected')) or (p_status = 'archived' and status <> 'archived'));
  if not found then raise exception 'service not found or status change not allowed' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.trainer_set_service_status(uuid, text) from public, anon;
grant execute on function public.trainer_set_service_status(uuid, text) to authenticated;

create function public.owner_review_service(p_service uuid, p_decision text, p_qualification_checked boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare s record; sp record;
begin
  if not public.is_admin() then raise exception 'owner only' using errcode = '42501'; end if;
  if p_decision not in ('published','rejected') then raise exception 'invalid decision' using errcode = '22023'; end if;
  select * into s from public.services where id = p_service;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;
  if p_decision = 'published' then
    if s.status <> 'submitted' and s.trainer_id is not null then raise exception 'only submitted services can be published' using errcode = '23514'; end if;
    if s.trainer_id is not null and not exists (select 1 from public.trainer_profiles t where t.user_id = s.trainer_id and t.status = 'approved') then
      raise exception 'trainer is not approved' using errcode = '23514'; end if;
    select * into sp from public.sports where id = s.sport_id;
    if found and (not sp.is_active) then raise exception 'sport is not active' using errcode = '23514'; end if;
    if found and sp.requires_review and not p_qualification_checked then
      raise exception 'this sport requires the owner to confirm qualifications and regulatory suitability first' using errcode = '23514'; end if;
  end if;
  update public.services set status = p_decision, qualification_checked = (p_decision = 'published' and p_qualification_checked) where id = p_service;
end $$;
revoke all on function public.owner_review_service(uuid, text, boolean) from public, anon;
grant execute on function public.owner_review_service(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------- availability slots
create table public.service_slots (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (service_id, starts_at)
);
create index service_slots_service_idx on public.service_slots (service_id, starts_at);
alter table public.service_slots enable row level security;
create policy "Trainer sees own slots, owner all, members see slots of published services" on public.service_slots for select to authenticated
  using ((select public.is_admin()) or (select public.owns_service(service_id))
         or exists (select 1 from public.services s where s.id = service_id and s.status = 'published' and s.is_available));
create policy "Trainer adds slots to own services" on public.service_slots for insert to authenticated
  with check ((select public.owns_service(service_id)) and starts_at > now());
create policy "Trainer removes own slots" on public.service_slots for delete to authenticated using ((select public.owns_service(service_id)));
revoke all on public.service_slots from anon, authenticated;
grant select, delete on public.service_slots to authenticated;
grant insert (service_id, starts_at) on public.service_slots to authenticated;

alter table public.bookings
  add column trainer_id uuid references public.trainer_profiles(user_id) on delete set null,
  add column slot_id uuid references public.service_slots(id) on delete set null,
  add column participants int not null default 1 check (participants between 1 and 50),
  add column guardian_consent boolean not null default false;
create index bookings_trainer_idx on public.bookings (trainer_id);
create index bookings_slot_idx on public.bookings (slot_id);

create function public.slot_taken(p_slot uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(participants), 0)::int from public.bookings where slot_id = p_slot and booking_status <> 'cancelled';
$$;
revoke all on function public.slot_taken(uuid) from public, anon;
grant execute on function public.slot_taken(uuid) to authenticated;

-- Public availability: published services only, future slots, remaining seats (no personal data).
create function public.public_slots(p_service uuid) returns table (id uuid, starts_at timestamptz, remaining int)
language sql stable security definer set search_path = public as $$
  select sl.id, sl.starts_at, greatest(0, s.capacity - public.slot_taken(sl.id))
    from public.service_slots sl join public.services s on s.id = sl.service_id
   where sl.service_id = p_service and s.status = 'published' and s.is_available and sl.starts_at > now() + interval '1 hour'
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
  select sv.price_kwd, sv.is_available, sv.status, sv.trainer_id, sv.capacity, sv.min_age, sv.format into s from public.services sv where sv.id = new.service_id;
  if not found or not s.is_available or s.status <> 'published'
     or (s.trainer_id is not null and not exists (select 1 from public.trainer_profiles t where t.user_id = s.trainer_id and t.status = 'approved')) then
    raise exception 'service is not available' using errcode = '23514';
  end if;
  new.price_kwd := s.price_kwd;     -- server-side price, always
  new.trainer_id := s.trainer_id;
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

create policy "Trainers view bookings of their own services" on public.bookings for select to authenticated using (trainer_id = (select auth.uid()));
create policy "Trainers update status of bookings of their own services" on public.bookings for update to authenticated
  using (trainer_id = (select auth.uid()) and (select public.is_trainer())) with check (trainer_id = (select auth.uid()));
grant insert (slot_id, participants, guardian_consent) on public.bookings to authenticated;

-- ---------------------------------------------------------------- owner administration
create function public.owner_list_users() returns table (user_id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz, trainer_status text, is_owner boolean)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'owner only' using errcode = '42501'; end if;
  return query select u.id, u.email::text, u.created_at, u.last_sign_in_at, t.status, exists (select 1 from public.admins a where a.user_id = u.id)
    from auth.users u left join public.trainer_profiles t on t.user_id = u.id
    where u.email not like '%@demo.invalid' order by u.created_at desc limit 500;
end $$;
revoke all on function public.owner_list_users() from public, anon;
grant execute on function public.owner_list_users() to authenticated;

create table public.platform_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.platform_settings enable row level security;
create policy "Owner reads settings" on public.platform_settings for select to authenticated using ((select public.is_admin()));
create policy "Owner edits settings" on public.platform_settings for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.platform_settings from anon, authenticated;
grant select on public.platform_settings to authenticated;
grant update (value) on public.platform_settings to authenticated;
insert into public.platform_settings (key, value) values ('commission_percent', '0'::jsonb), ('bookings_are_demo', 'true'::jsonb);

-- Private applicant documents: each member may only touch their own folder; the owner can read all. Minimise what is collected.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trainer-documents', 'trainer-documents', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
create policy "Applicant manages own documents" on storage.objects for all to authenticated
  using (bucket_id = 'trainer-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'trainer-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owner reads applicant documents" on storage.objects for select to authenticated
  using (bucket_id = 'trainer-documents' and (select public.is_admin()));

-- ---------------------------------------------------------------- seed: sports (potential catalog entries, NOT proof of permission to operate commercially)
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

-- ---------------------------------------------------------------- seed: clearly labelled DEMO trainers (no login possible) with published demo services
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, banned_until, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000001','authenticated','authenticated','demo-trainer-1@demo.invalid','',now(),'infinity','{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000002','authenticated','authenticated','demo-trainer-2@demo.invalid','',now(),'infinity','{}','{}',now(),now(),'','','',''),
 ('00000000-0000-0000-0000-000000000000','d0000000-0000-4000-8000-000000000003','authenticated','authenticated','demo-trainer-3@demo.invalid','',now(),'infinity','{}','{}',now(),now(),'','','','');
insert into public.trainer_profiles (user_id, display_name, bio, experience_years, qualifications, formats, locations, participant_categories, accessibility, status, is_demo, approved_at) values
 ('d0000000-0000-4000-8000-000000000001','مدرب تجريبي – كرة القدم','ملف تجريبي لعرض شكل صفحة المدرب. ليس شخصاً حقيقياً.',8,'بيانات تجريبية','{in_person,hybrid}','{الكويت العاصمة,حولي}','{youth,adults,children}','بيانات تجريبية','draft',true,null),
 ('d0000000-0000-4000-8000-000000000002','مدربة تجريبية – يوغا وبيلاتس','ملف تجريبي لعرض شكل صفحة المدربة. ليست شخصاً حقيقياً.',6,'بيانات تجريبية','{online,in_person}','{الفروانية,الجهراء}','{women,adults,seniors}','بيانات تجريبية','draft',true,null),
 ('d0000000-0000-4000-8000-000000000003','مدرب تجريبي – قوة ولياقة','ملف تجريبي لعرض شكل صفحة المدرب. ليس شخصاً حقيقياً.',10,'بيانات تجريبية','{online,in_person,hybrid}','{السالمية,مبارك الكبير}','{adults,men,women}','بيانات تجريبية','draft',true,null);
insert into public.trainer_sports (trainer_id, sport_id)
select t.user_id, s.id from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid,'football'), ('d0000000-0000-4000-8000-000000000001'::uuid,'futsal'),
  ('d0000000-0000-4000-8000-000000000002'::uuid,'yoga'), ('d0000000-0000-4000-8000-000000000002'::uuid,'pilates'),
  ('d0000000-0000-4000-8000-000000000003'::uuid,'strength-training'), ('d0000000-0000-4000-8000-000000000003'::uuid,'functional-fitness')) as t(user_id, slug)
join public.sports s on s.slug = t.slug;
update public.trainer_profiles set status = 'approved', approved_at = now() where is_demo;   -- after the specializations exist, so the review trigger does not reset them
insert into public.services (id, name, description, price_kwd, is_demo, trainer_id, sport_id, format, delivery, location, capacity, min_age, max_age, duration_minutes, status)
select v.id, v.name, v.descr, v.price, true, v.trainer, s.id, v.format, v.delivery, v.loc, v.cap, v.minage, v.maxage, v.dur, 'published'
from (values
 ('e0000000-0000-4000-8000-000000000001'::uuid,'تدريب كرة قدم فردي (تجريبي)','خدمة تجريبية لعرض الحجز: جلسة تطوير مهارات فردية.',10.000,'d0000000-0000-4000-8000-000000000001'::uuid,'football','private','in_person','حولي',1,12,40,60),
 ('e0000000-0000-4000-8000-000000000002'::uuid,'تدريب كرة صالات جماعي (تجريبي)','خدمة تجريبية: حصة جماعية للشباب مع موافقة ولي الأمر لمن هم دون 18.',4.000,'d0000000-0000-4000-8000-000000000001'::uuid,'futsal','group','in_person','الكويت العاصمة',12,10,17,75),
 ('e0000000-0000-4000-8000-000000000003'::uuid,'يوغا للمبتدئات – أونلاين (تجريبي)','خدمة تجريبية: حصة يوغا مباشرة عبر الإنترنت.',6.000,'d0000000-0000-4000-8000-000000000002'::uuid,'yoga','group','online','',15,18,70,60),
 ('e0000000-0000-4000-8000-000000000004'::uuid,'بيلاتس فردي (تجريبي)','خدمة تجريبية: جلسة بيلاتس فردية.',12.000,'d0000000-0000-4000-8000-000000000002'::uuid,'pilates','private','in_person','الفروانية',1,16,70,50),
 ('e0000000-0000-4000-8000-000000000005'::uuid,'برنامج قوة فردي (تجريبي)','خدمة تجريبية: جلسة تدريب قوة فردية.',11.000,'d0000000-0000-4000-8000-000000000003'::uuid,'strength-training','private','hybrid','السالمية',1,16,60,60),
 ('e0000000-0000-4000-8000-000000000006'::uuid,'لياقة وظيفية جماعية (تجريبي)','خدمة تجريبية: حصة لياقة وظيفية لمجموعة صغيرة.',5.000,'d0000000-0000-4000-8000-000000000003'::uuid,'functional-fitness','group','in_person','مبارك الكبير',8,16,60,60)
) as v(id, name, descr, price, trainer, slug, format, delivery, loc, cap, minage, maxage, dur)
join public.sports s on s.slug = v.slug;
-- Demo availability for the next 60 days (17:00 and 19:00 Kuwait time). Demo data only: it is not refreshed automatically.
insert into public.service_slots (service_id, starts_at)
select s.id, (d::date + t)::timestamp at time zone 'Asia/Kuwait'
from public.services s, generate_series(current_date + 2, current_date + 60, interval '1 day') d, (values (time '17:00'), (time '19:00')) as x(t)
where s.id::text like 'e0000000-%';
