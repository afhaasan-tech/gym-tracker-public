-- VORA Phase 1 / M2 security review: least privilege for service_role + tamper resistance (finding F-10 in docs/VORA-PRIVILEGED-FUNCTIONS-REVIEW.md).
-- Before: service_role (the key every Edge Function holds) had full DML + TRUNCATE on the audit log and on the credit ledger.
-- After: books and audit evidence can only be changed through the SECURITY DEFINER functions (which run as the table owner), never by a leaked service key.
begin;

do $$ declare t text; begin
  -- tables only ever touched through definer functions: service_role needs no direct privileges at all
  foreach t in array array['credit_ledger','credit_reservations','credit_wallets','trial_grants','credit_settings','ai_budget','rate_limit_events'] loop
    if to_regclass('public.' || t) is not null then execute format('revoke all on public.%I from service_role', t); end if;
  end loop;
  -- catalogue/config tables: read-only for the Edge Function (owner changes go through owner RPCs added later)
  foreach t in array array['ai_operations','ai_routes'] loop
    if to_regclass('public.' || t) is not null then execute format('revoke all on public.%I from service_role', t); execute format('grant select on public.%I to service_role', t); end if;
  end loop;
  -- the AI coach function writes jobs directly, but must never delete or truncate them
  if to_regclass('public.ai_jobs') is not null then
    revoke all on public.ai_jobs from service_role; grant select, insert, update on public.ai_jobs to service_role;
  end if;
  -- the audit log: append-only for everyone except the table owner
  if to_regclass('public.audit_log') is not null then
    revoke update, delete, truncate on public.audit_log from service_role, anon, authenticated;
    if not exists (select 1 from pg_trigger where tgname = 'audit_log_no_truncate') then
      execute 'create trigger audit_log_no_truncate before truncate on public.audit_log for each statement execute function public.audit_log_immutable()';
    end if;
  end if;
  -- the credit ledger also gets a TRUNCATE guard for the owner role
  if to_regclass('public.credit_ledger') is not null and not exists (select 1 from pg_trigger where tgname = 'credit_ledger_no_truncate') then
    execute 'create trigger credit_ledger_no_truncate before truncate on public.credit_ledger for each statement execute function public.credit_ledger_guard()';
  end if;
end $$;
commit;
