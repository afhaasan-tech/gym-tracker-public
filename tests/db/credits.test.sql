\set ON_ERROR_STOP off
drop table if exists t_results cascade;
create table t_results(n serial, ok boolean, label text);
create or replace function t_as(u uuid, aal text default 'aal2') returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('session_id', u, 'sub', u, 'role', 'authenticated', 'aal', aal)::text, false); set role authenticated; end $$;
create or replace function t_anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); set role anon; end $$;
create or replace function t_su() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); end $$;
create or replace function t_err(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected an error, got none)');
  exception when others then insert into t_results(ok,label) values (true, label||' -> '||left(sqlerrm,70)); end; end $$;
create or replace function t_ok(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (true,label);
  exception when others then insert into t_results(ok,label) values (false, label||' (unexpected error: '||left(sqlerrm,90)||')'); end; end $$;
create or replace function t_count(q text, expected int, label text) returns void language plpgsql as $$
declare n int; begin begin execute 'select count(*) from ('||q||') s' into n; insert into t_results(ok,label) values (n=expected, label||' [got '||n||', want '||expected||']');
  exception when others then insert into t_results(ok,label) values (false, label||' (error: '||left(sqlerrm,90)||')'); end; end $$;

create or replace function t_affected(q text, expected int, label text) returns void language plpgsql as $$
declare n int; begin begin execute q; get diagnostics n = row_count; insert into t_results(ok,label) values (n=expected, label||' [affected '||n||', want '||expected||']');
  exception when others then insert into t_results(ok,label) values (false, label||' (error: '||left(sqlerrm,90)||')'); end; end $$;


drop table if exists t_ids; create table t_ids(k text primary key, v text); grant all on t_ids to public;
create or replace function t_user(u uuid, verified boolean) returns void language plpgsql as $$ begin
  insert into auth.users(id,email,email_confirmed_at) values (u, u::text||'@credits.test', case when verified then now() end); insert into user_session_state(user_id, active_session_id) values (u, u); end $$;
create or replace function t_bal(u uuid) returns jsonb language plpgsql as $$ declare r jsonb; begin
  reset role; perform set_config('request.jwt.claims', json_build_object('session_id', u, 'sub', u, 'role','authenticated')::text, false); set role authenticated; r := public.my_credit_balance(); reset role; return r; end $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;
-- ---------- A. one-time trial grant
select t_user('c0000000-0000-4000-8000-000000000001', false), t_user('c0000000-0000-4000-8000-000000000002', true);
select t_count($$select 1 from trial_grants where user_id='c0000000-0000-4000-8000-000000000001'$$,0,'unverified account gets no trial');
select t_count($$select 1 from trial_grants where user_id='c0000000-0000-4000-8000-000000000002'$$,1,'account created already verified gets the trial');
update auth.users set email_confirmed_at = now() where id = 'c0000000-0000-4000-8000-000000000001';
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001' and amount=2500 and source='promo' and entry_type='grant'$$,1,'verifying the e-mail grants exactly 2,500 promo credits');
update auth.users set email_confirmed_at = null where id = 'c0000000-0000-4000-8000-000000000001'; update auth.users set email_confirmed_at = now() where id = 'c0000000-0000-4000-8000-000000000001'; update auth.users set email_confirmed_at = now() where id = 'c0000000-0000-4000-8000-000000000001';
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001' and entry_type='grant'$$,1,'re-verifying / repeated updates never grant twice');
select t_count($$select 1 where credit_grant_trial('c0000000-0000-4000-8000-000000000001') = false$$,1,'direct second grant call returns false');
select t_err($$insert into trial_grants(user_id,credits) values ('c0000000-0000-4000-8000-000000000001',2500)$$,'trial_grants primary key blocks a duplicate row');
select t_count($$select 1 where t_bal('c0000000-0000-4000-8000-000000000001') = '{"promo":2500,"reward":0,"subscription":0,"purchased":0,"total":2500,"held":0}'::jsonb$$,1,'my_credit_balance shows 2500 promo, nothing held');

-- ---------- B. reserve -> settle / release (service role = the AI Edge Function)
select t_srv();
select t_ok($$insert into t_ids select 'r1', o_reservation_id::text from credit_reserve('c0000000-0000-4000-8000-000000000001'::uuid,'quick_question','idem-key-0001')$$,'reserve a 50-credit quick question');
select t_su();
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001' and entry_type='reserve' and amount=-50 and source='promo'$$,1,'reservation deducted 50 from promo');
select t_srv();
select t_count($$select 1 where t_bal('c0000000-0000-4000-8000-000000000001') = '{"promo":2450,"reward":0,"subscription":0,"purchased":0,"total":2450,"held":50}'::jsonb$$,1,'balance 2450 and 50 held');
select t_srv();
select t_count($$select 1 from credit_reserve('c0000000-0000-4000-8000-000000000001'::uuid,'quick_question','idem-key-0001') where o_reused and o_reservation_id=(select v::uuid from t_ids where k='r1')$$,1,'retry with the same idempotency key returns the same reservation');
select t_su();
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001' and entry_type='reserve'$$,1,'retry did NOT hold credits twice');
select t_srv();
select t_err($$select credit_reserve('c0000000-0000-4000-8000-000000000001'::uuid,'full_workout_plan','idem-key-0001')$$,'same key for another operation is rejected');
select t_count($$select 1 where credit_settle((select v::uuid from t_ids where k='r1'),'c0000000-0000-4000-8000-000000000001'::uuid)='settled'$$,1,'settle after confirmed delivery');
select t_count($$select 1 where credit_settle((select v::uuid from t_ids where k='r1'),'c0000000-0000-4000-8000-000000000001'::uuid)='settled'$$,1,'settling twice is idempotent');
select t_su();
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001'$$,2,'settling twice wrote nothing new (grant + one reserve)');
select t_srv();
select t_err($$select credit_release((select v::uuid from t_ids where k='r1'),'c0000000-0000-4000-8000-000000000001'::uuid,'x')$$,'a settled reservation cannot be released');
select t_err($$select credit_settle((select v::uuid from t_ids where k='r1'),'c0000000-0000-4000-8000-000000000002'::uuid)$$,'another user cannot settle my reservation');
select t_ok($$insert into t_ids select 'r2', o_reservation_id::text from credit_reserve('c0000000-0000-4000-8000-000000000001'::uuid,'full_workout_plan','idem-key-0002')$$,'reserve a 1500-credit plan');
select t_count($$select 1 where credit_release((select v::uuid from t_ids where k='r2'),'c0000000-0000-4000-8000-000000000001'::uuid,'provider error')='released'$$,1,'confirmed failure releases the hold');
select t_count($$select 1 where credit_release((select v::uuid from t_ids where k='r2'),'c0000000-0000-4000-8000-000000000001'::uuid,'again')='released'$$,1,'release is idempotent');
select t_su();
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001' and reservation_id=(select v::uuid from t_ids where k='r2') and entry_type='release' and amount=1500$$,1,'exactly one mirror release row');
select t_srv();
select t_err($$select credit_settle((select v::uuid from t_ids where k='r2'),'c0000000-0000-4000-8000-000000000001'::uuid)$$,'a released reservation cannot be settled (no charge after refund)');
select t_count($$select 1 where t_bal('c0000000-0000-4000-8000-000000000001') = '{"promo":2450,"reward":0,"subscription":0,"purchased":0,"total":2450,"held":0}'::jsonb$$,1,'after settle + release the balance is 2450');
select t_srv();

-- ---------- C. limits, order of spending, configuration
select t_su();
select t_user('c0000000-0000-4000-8000-000000000003', false);
select t_su();
update credit_settings set trial_credits = 0;
select t_user('c0000000-0000-4000-8000-000000000004', true); update credit_settings set trial_credits = 2500;
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000004'$$,0,'trial amount is configurable (0 grants nothing)');
select t_count($$select 1 from trial_grants where user_id='c0000000-0000-4000-8000-000000000004'$$,1,'...but still records that the trial was used');
select t_ok($$select credit_grant('c0000000-0000-4000-8000-000000000003'::uuid,'purchased',100,'purchase','p1','test')$$,'grant purchased credits');
select t_count($$select 1 where credit_grant('c0000000-0000-4000-8000-000000000003'::uuid,'purchased',100,'purchase','p1','test')=false$$,1,'same grant key twice is ignored');
select t_err($$select credit_reserve('c0000000-0000-4000-8000-000000000003'::uuid,'full_workout_plan','idem-key-0003')$$,'insufficient credits are refused (PC001)');
select t_count($$select 1 from credit_reservations where user_id='c0000000-0000-4000-8000-000000000003'$$,0,'a refused reservation leaves nothing behind');
select t_err($$select credit_reserve('c0000000-0000-4000-8000-000000000003'::uuid,'does_not_exist','idem-key-0004')$$,'unknown operation is refused');
reset role; update ai_operations set enabled=false where key='quick_question'; select t_srv();
select t_err($$select credit_reserve('c0000000-0000-4000-8000-000000000003'::uuid,'quick_question','idem-key-0005')$$,'disabled operation is refused');
reset role; update ai_operations set enabled=true, credits=77 where key='quick_question'; select t_srv();
select t_count($$select 1 from credit_reserve('c0000000-0000-4000-8000-000000000003'::uuid,'quick_question','idem-key-0006') where o_credits=77$$,1,'owner-changed price (77) is used by the next reservation');
reset role; insert into ai_operations(key,label_ar,label_en,credits) values ('test_350','ت','t',350); update ai_operations set credits=50 where key='quick_question';
select t_su(); select t_user('c0000000-0000-4000-8000-000000000005', true);
select t_srv();
select t_ok($$select credit_grant('c0000000-0000-4000-8000-000000000005'::uuid,'reward',100,'grant','g1','t'), credit_grant('c0000000-0000-4000-8000-000000000005'::uuid,'subscription',100,'grant','g2','t'), credit_grant('c0000000-0000-4000-8000-000000000005'::uuid,'purchased',100,'purchase','g3','t')$$,'grant reward/subscription/purchased');
select t_ok($$select * from credit_reserve('c0000000-0000-4000-8000-000000000005'::uuid,'test_350','idem-key-0007')$$,'reserve 350 across sources (promo 2500 covers it)');
select t_su();
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000005' and entry_type='reserve' and source='promo' and amount=-350$$,1,'free promo credits are spent first');
select t_srv();
select t_count($$select 1 where t_bal('c0000000-0000-4000-8000-000000000005') ->> 'purchased' = '100'$$,1,'purchased credits untouched while promo covers the cost');
select t_srv();

-- ---------- D. expiry rules
select t_count($$select 1 where credit_expire_source('c0000000-0000-4000-8000-000000000005'::uuid,'subscription','term ended')=100$$,1,'subscription pool expires with the term (100 removed)');
select t_count($$select 1 where t_bal('c0000000-0000-4000-8000-000000000005') ->> 'subscription' = '0'$$,1,'subscription balance is 0 after expiry');
select t_err($$select credit_expire_source('c0000000-0000-4000-8000-000000000005'::uuid,'purchased','x')$$,'purchased credits can never be expired');
select t_srv();
select t_ok($$insert into t_ids select 'r9', o_reservation_id::text from credit_reserve('c0000000-0000-4000-8000-000000000005'::uuid,'quick_question','idem-key-0009')$$,'reservation to abandon');
reset role; update credit_reservations set expires_at = now() - interval '1 minute' where id=(select v::uuid from t_ids where k='r9'); select t_srv();
select t_count($$select 1 where credit_release_expired(10)=1$$,1,'abandoned reservation is released after its expiry');
select t_srv();

-- ---------- E. nobody but the service functions can touch the books
reset role; select t_as('c0000000-0000-4000-8000-000000000001');
select t_count($$select 1 from credit_ledger$$,4,'member reads only own ledger rows (grant, 2 holds, 1 release)');
select t_count($$select 1 from credit_reservations$$,2,'member reads only own reservations');
select t_count($$select 1 from ai_operations$$,6,'member reads operation prices');
select t_err($$insert into credit_ledger(user_id,source,entry_type,amount) values (auth.uid(),'purchased','grant',999999)$$,'member cannot insert credits');
select t_err($$update credit_ledger set amount=999999$$,'member cannot update the ledger');
select t_err($$delete from credit_ledger$$,'member cannot delete ledger rows');
select t_err($$insert into trial_grants(user_id,credits) values (auth.uid(),1)$$,'member cannot write trial grants');
select t_err($$update ai_operations set credits=0$$,'member cannot change prices');
select t_err($$update credit_settings set trial_credits=999999$$,'member cannot read/change settings');
select t_err($$select credit_grant(auth.uid(),'purchased',1000,'purchase','hack','x')$$,'member cannot call credit_grant');
select t_err($$select credit_reserve(auth.uid(),'quick_question','hack-key-1')$$,'member cannot call credit_reserve directly');
select t_err($$select credit_settle(gen_random_uuid(),auth.uid())$$,'member cannot call credit_settle');
select t_err($$select credit_grant_trial(auth.uid())$$,'member cannot call credit_grant_trial');
select t_as('c0000000-0000-4000-8000-000000000002');
select t_count($$select 1 from credit_ledger where user_id='c0000000-0000-4000-8000-000000000001'$$,0,'another member sees none of those rows');
select t_anon();
select t_err($$select * from credit_ledger$$,'anonymous cannot read the ledger');
select t_err($$select my_credit_balance()$$,'anonymous cannot call my_credit_balance');
select t_su();
select t_err($$insert into credit_ledger(user_id,source,entry_type,amount) values ('c0000000-0000-4000-8000-000000000005','purchased','adjust',-100000)$$,'even a superuser cannot push a balance negative (trigger)');
select t_err($$update credit_ledger set amount=1 where id=1$$,'even a superuser cannot edit the ledger (append-only)');
select t_err($$delete from credit_ledger where id=1$$,'even a superuser cannot delete ledger rows');
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
