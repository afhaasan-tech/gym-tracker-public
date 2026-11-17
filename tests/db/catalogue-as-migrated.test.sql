-- Read-only. Runs straight after the migrations, before any other suite touches the scratch database: the shop catalogue and the
-- privileges of the exercise library exactly as the migrations leave them (plans: 20261121 + 20261124, no automatic coins). Creates nothing and changes nothing.
do $$ declare n int; bad text := ''; t text; r text; p text;
begin
  select count(*) into n from public.plans where enabled;
  if n = 2 and (select count(*) from public.plans where enabled and provisional and includes_nutrition and monthly_credits is null and ai_daily_requests = 40 and ai_daily_media = 10 and (key, period_days, price_kwd) in (('monthly', 30, 7.000), ('yearly', 365, 70.000))) = 2
    then raise notice 'PASS on sale: monthly (30 days) and yearly (365 days) only, both with nutrition, both provisional, NO coin allocation, included usage 40 requests / 10 media per day'; else raise exception 'FAIL enabled plans: %', n; end if;
  if (select count(*) from public.plans where key in ('essential','pro','elite','vip') and not enabled) = 4 then raise notice 'PASS the four old plans are kept, switched off'; else raise exception 'FAIL old plans'; end if;
  if (select count(*) from public.coin_packs where enabled) = 3 and (select count(*) from public.coin_packs where enabled and provisional and (key, coins, price_kwd) in (('starter', 500, 0.990), ('plus', 1500, 2.490), ('value', 3500, 4.990))) = 3
    then raise notice 'PASS on sale: starter 500 / 0.990, plus 1500 / 2.490, value 3500 / 4.990 (provisional)'; else raise exception 'FAIL enabled coin packs'; end if;
  if (select count(*) from public.coin_packs where key in ('coins_500','coins_1200','coins_3000') and not enabled) = 3 then raise notice 'PASS the three old packs are kept, switched off'; else raise exception 'FAIL old packs'; end if;
  if (select count(*) from jsonb_array_elements(public.public_plans()) e where e ? 'period_days') = 2 then raise notice 'PASS public_plans() returns period_days'; else raise exception 'FAIL public_plans'; end if;

  foreach t in array array['muscles','exercise_library'] loop
    foreach r in array array['anon','authenticated','service_role'] loop
      foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] loop
        if has_table_privilege(r, 'public.'||t, p) then bad := bad || r||':'||t||':'||p||' '; end if;
      end loop;
    end loop;
    if not (select relrowsecurity from pg_class where oid = ('public.'||t)::regclass) then bad := bad || t||':rls_off '; end if;
  end loop;
  if bad = '' then raise notice 'PASS muscles / exercise_library: RLS on, no table privilege for anon, authenticated or service_role'; else raise exception 'FAIL %', bad; end if;

  if has_function_privilege('anon','public.public_muscles()','EXECUTE') and has_function_privilege('authenticated','public.public_muscles()','EXECUTE')
     and not has_function_privilege('anon','public.premium_exercises(text,text)','EXECUTE') and has_function_privilege('authenticated','public.premium_exercises(text,text)','EXECUTE')
     and not has_function_privilege('anon','public.premium_exercise(text)','EXECUTE') and has_function_privilege('authenticated','public.premium_exercise(text)','EXECUTE')
     and not has_function_privilege('anon','public.library_candidates(text[],text,int)','EXECUTE') and not has_function_privilege('authenticated','public.library_candidates(text[],text,int)','EXECUTE')
     and has_function_privilege('service_role','public.library_candidates(text[],text,int)','EXECUTE')
     and not has_function_privilege('anon','public.library_guard()','EXECUTE') and not has_function_privilege('authenticated','public.library_guard()','EXECUTE') and not has_function_privilege('service_role','public.library_guard()','EXECUTE')
    then raise notice 'PASS function grants: public_muscles open; premium_* authenticated only; library_candidates service_role only; library_guard nobody';
    else raise exception 'FAIL library function grants'; end if;
  -- the three replaced functions keep exactly the grants they had
  if has_function_privilege('service_role','public.purchase_create(uuid,text,text,text)','EXECUTE') and not has_function_privilege('authenticated','public.purchase_create(uuid,text,text,text)','EXECUTE')
     and has_function_privilege('service_role','public.trainer_access(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.trainer_access(uuid)','EXECUTE') and not has_function_privilege('anon','public.trainer_access(uuid)','EXECUTE')
     and has_function_privilege('anon','public.public_plans()','EXECUTE')
    then raise notice 'PASS replaced functions (purchase_create, trainer_access, public_plans) keep their grants'; else raise exception 'FAIL grants of replaced functions'; end if;
end $$;
