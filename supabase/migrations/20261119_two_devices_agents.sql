-- VORA Phase 1 / milestone 4 (forward-only): TWO trusted devices / active sessions per account, three AI agents
-- (coach, nutritionist, support) and support tickets. Nothing from earlier milestones is dropped except the two
-- ai_routes CHECK constraints, which are replaced by wider ones (a CHECK constraint cannot be altered in place).
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

-- ============================================================ 3. AI agents: prices, routes, job column
insert into public.ai_operations (key, label_ar, label_en, credits) values
  ('agent_coach', 'المدرب الذكي', 'AI coach', 50),
  ('agent_nutritionist', 'أخصائي التغذية الذكي', 'AI nutritionist', 50),
  ('agent_support', 'الدعم الفني (مجاني)', 'Support chat (free)', 0)
on conflict (key) do nothing;

alter table public.ai_routes drop constraint if exists ai_routes_provider_check;
alter table public.ai_routes drop constraint if exists ai_routes_fallback_provider_check;
alter table public.ai_routes add constraint ai_routes_provider_check check (provider in ('mock','anthropic','gemini'));
alter table public.ai_routes add constraint ai_routes_fallback_provider_check check (fallback_provider in ('mock','anthropic','gemini'));

-- Planned live routing; nothing runs live until the budget gate and the function's own switch are on.
insert into public.ai_routes (operation_key, provider, model, max_output_tokens) values
  ('agent_coach', 'anthropic', 'claude-haiku-5-5', 1200),
  ('agent_nutritionist', 'anthropic', 'claude-sonnet-5-5', 2500),
  ('agent_support', 'anthropic', 'claude-haiku-5-5', 900)
on conflict (operation_key) do nothing;

alter table public.ai_jobs add column if not exists agent_role text check (agent_role in ('coach','nutritionist','support'));
grant select (agent_role) on public.ai_jobs to authenticated;

-- ============================================================ 4. support tickets
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

-- The only write path (called by the ai-agents Edge Function with the service key). Returns created_at.
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

-- ============================================================ 5. deny by default, then grant precisely
revoke all on function public.is_trusted_session(), public.device_session_activate(uuid, uuid, uuid), public.device_status(uuid, text, uuid),
  public.device_challenge_verify(uuid, text, text, uuid, text), public.device_revoke(uuid, uuid),
  public.support_ticket_create(uuid, text, text, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.device_status(uuid, text, uuid), public.device_challenge_verify(uuid, text, text, uuid, text), public.device_revoke(uuid, uuid),
  public.support_ticket_create(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.is_trusted_session() to authenticated, service_role;
commit;
