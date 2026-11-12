do $$ declare f text; bad text := '';
begin
  foreach f in array array['admins_guard()','audit_log_immutable()','bookings_before_insert()','bookings_before_update()','coach_profiles_before_write()','profiles_before_write()','services_before_write()','rls_auto_enable()'] loop
    if to_regprocedure('public.'||f) is not null and (has_function_privilege('anon', 'public.'||f, 'EXECUTE') or has_function_privilege('authenticated', 'public.'||f, 'EXECUTE')) then bad := bad || f || ' '; end if;
  end loop;
  if bad = '' then raise notice 'PASS trigger/event functions are not executable by anon or authenticated'; else raise exception 'FAIL still executable: %', bad; end if;
  if (select proconfig::text from pg_proc where proname='audit_log_immutable') like '%search_path%' then raise notice 'PASS audit_log_immutable has a fixed search_path'; else raise exception 'FAIL search_path'; end if;
  create function public.zz_probe() returns int language sql as 'select 1';
  if has_function_privilege('anon','public.zz_probe()','EXECUTE') or has_function_privilege('authenticated','public.zz_probe()','EXECUTE') then raise exception 'FAIL new functions are still callable by default'; else raise notice 'PASS new functions are deny-by-default'; end if;
  drop function public.zz_probe();
end $$;
