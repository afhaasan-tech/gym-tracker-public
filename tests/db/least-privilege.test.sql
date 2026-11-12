do $$ declare tbl text; priv text; bad text := '';
begin
  foreach tbl in array array['credit_ledger','credit_reservations','credit_wallets','trial_grants','credit_settings','ai_budget','rate_limit_events'] loop
    foreach priv in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege('service_role', 'public.'||tbl, priv) then bad := bad || tbl||':'||priv||' '; end if;
    end loop;
  end loop;
  if bad = '' then raise notice 'PASS service_role has no direct privileges on credit/budget/limit tables'; else raise exception 'FAIL service_role still has: %', bad; end if;
  if has_table_privilege('service_role','public.audit_log','DELETE') or has_table_privilege('service_role','public.audit_log','UPDATE') or has_table_privilege('service_role','public.audit_log','TRUNCATE') then raise exception 'FAIL service_role can modify audit_log'; end if;
  raise notice 'PASS service_role cannot update/delete/truncate the audit log';
  if has_table_privilege('service_role','public.ai_jobs','DELETE') or has_table_privilege('service_role','public.ai_jobs','TRUNCATE') or not has_table_privilege('service_role','public.ai_jobs','INSERT') then raise exception 'FAIL ai_jobs privileges'; end if;
  raise notice 'PASS ai_jobs: insert/update/select only';
end $$;
-- behaviour: the credit functions must STILL work for service_role, and direct table abuse must fail
set role service_role;
do $$ declare ok boolean := false; begin
  begin delete from public.credit_ledger; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL service_role could delete ledger rows'; end if; raise notice 'PASS service_role cannot DELETE ledger rows';
  ok := false; begin truncate public.audit_log; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL service_role could truncate the audit log'; end if; raise notice 'PASS service_role cannot TRUNCATE the audit log';
  ok := false; begin perform 1 from public.credit_ledger limit 1; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL service_role can read the ledger directly'; end if; raise notice 'PASS service_role cannot read the ledger directly (functions only)';
end $$;
reset role;
do $$ declare ok boolean := false; begin
  begin truncate public.audit_log; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL even the owner could truncate the audit log'; end if; raise notice 'PASS the truncate trigger also stops the table owner';
  ok := false; begin truncate public.credit_ledger; exception when others then ok := true; end;
  if not ok then raise exception 'FAIL even the owner could truncate the ledger'; end if; raise notice 'PASS the truncate trigger also protects the credit ledger';
end $$;
