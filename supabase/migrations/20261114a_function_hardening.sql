-- VORA Phase 1: deny-by-default for functions (findings of the Phase-1 security review). Forward-only, no data touched.
-- Trigger functions are never meant to be called through the API; PostgreSQL only checks EXECUTE when a trigger is CREATED,
-- so revoking it does not affect trigger firing. slot_taken is intentionally left callable: bookings_before_insert (invoker) uses it.
begin;
do $$ declare f text; begin
  foreach f in array array['admins_guard','audit_log_immutable','bookings_before_insert','bookings_before_update','coach_profiles_before_write','profiles_before_write','services_before_write','rls_auto_enable'] loop
    -- rls_auto_enable exists only on Supabase-hosted projects, so every function is looked up first
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f and p.pronargs = 0) then
      execute format('revoke execute on function public.%I() from public, anon, authenticated', f);
    end if;
  end loop;
end $$;
alter function public.audit_log_immutable() set search_path = public;
-- from now on new functions in schema public are NOT callable by anon/authenticated unless a migration grants EXECUTE explicitly
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;   -- the implicit PUBLIC grant is global, not per schema
commit;
