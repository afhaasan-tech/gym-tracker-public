-- STAGING ONLY (never applied to production, where these objects already exist): the minimal slice of the production baseline that the
-- Phase-1 migrations depend on (admins, is_admin/is_super_admin, audit_log, log_audit), copied from 20261112_marketplace_roles.sql.
create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table public.admins enable row level security;
alter table public.admins add column role text not null default 'super' check (role in ('super', 'emergency')), add column granted_by uuid references auth.users(id) on delete set null;
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
create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid()) and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
create function public.is_super_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'super') and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
revoke all on function public.is_admin(), public.is_super_admin(), public.admins_guard() from public, anon;
grant execute on function public.is_admin(), public.is_super_admin() to authenticated;
create table public.audit_log (id bigint generated always as identity primary key, at timestamptz not null default now(), actor_id uuid, actor_role text, action text not null, target_type text, target_id text, details jsonb not null default '{}');
create function public.audit_log_immutable() returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('app.allow_audit_purge', true), '') = 'on' then return coalesce(new, old); end if;
  raise exception 'the audit log is append-only' using errcode = '42501';
end $$;
create trigger audit_log_immutable before update or delete on public.audit_log for each row execute function public.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.audit_log_immutable();
alter table public.audit_log enable row level security;
create policy "Privileged admins read the audit log" on public.audit_log for select to authenticated using ((select public.is_admin()));
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated;
create function public.log_audit(p_action text, p_type text, p_target text, p_details jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into public.audit_log (actor_id, actor_role, action, target_type, target_id, details)
  values (auth.uid(), (select role from public.admins where user_id = auth.uid()), p_action, p_type, p_target, coalesce(p_details, '{}'));
$$;
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;
-- dev-only mailbox used by the mock mailer (the real mailer is not configured). Plain codes live here ONLY in staging.
create table public.dev_mock_outbox (id bigint generated always as identity primary key, at timestamptz not null default now(), to_email text not null, subject text not null, body text not null);
alter table public.dev_mock_outbox enable row level security;
revoke all on public.dev_mock_outbox from anon, authenticated;
grant insert, select on public.dev_mock_outbox to service_role;
