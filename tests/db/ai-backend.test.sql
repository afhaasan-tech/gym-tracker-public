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

create or replace function t_user(u uuid) returns void language plpgsql as $$ begin
  insert into auth.users(id,email,email_confirmed_at) values (u, u::text||'@aibackend.test', now()); insert into user_session_state(user_id, active_session_id) values (u, u); end $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;
select t_su(); select t_user('c1000000-0000-4000-8000-000000000001'), t_user('c1000000-0000-4000-8000-000000000002');

-- budget gate
select t_srv();
select t_count($$select 1 where ai_budget_authorize(1000) = false$$,1,'gate is CLOSED by default (live calls disabled, cap 0)');
select t_su(); update ai_budget set live_calls_enabled = true; select t_srv();
select t_count($$select 1 where ai_budget_authorize(1000) = false$$,1,'switch on but cap 0 still refuses');
select t_su(); update ai_budget set monthly_cap_usd_micro = 100000, per_call_cap_usd_micro = 40000; select t_srv();
select t_count($$select 1 where ai_budget_authorize(50000) = false$$,1,'estimate above the per-call cap is refused');
select t_count($$select 1 where ai_budget_authorize(40000) = true$$,1,'within caps is authorised (40000 of 100000)');
select t_count($$select 1 where ai_budget_authorize(40000) = true$$,1,'second call authorised (80000)');
select t_count($$select 1 where ai_budget_authorize(30000) = false$$,1,'a call that would exceed the monthly cap is refused');
select t_ok($$select ai_budget_settle(40000, 10000)$$,'settle replaces estimate with the real cost');
select t_count($$select 1 where ai_budget_authorize(40000) = true$$,1,'after a cheaper real cost there is room again');
select t_count($$select 1 where ai_budget_authorize(-5) = false$$,1,'negative estimates are refused');
select t_su(); update ai_budget set period_start = (date_trunc('month', now()) - interval '1 month')::date, spent_usd_micro = 99999; select t_srv();
select t_count($$select 1 where ai_budget_authorize(40000) = true$$,1,'a new month resets the spend counter');
select t_su(); update ai_budget set live_calls_enabled = false; select t_srv();
select t_count($$select 1 where ai_budget_authorize(1) = false$$,1,'switching the gate off stops everything again');

-- rate limiter
select t_count($$select 1 from rate_limit_hit('u:1', 3, interval '1 minute') where allowed$$,1,'hit 1 allowed');
select t_ok($$select * from rate_limit_hit('u:1', 3, interval '1 minute')$$,'hit 2');
select t_ok($$select * from rate_limit_hit('u:1', 3, interval '1 minute')$$,'hit 3');
select t_count($$select 1 from rate_limit_hit('u:1', 3, interval '1 minute') where not allowed and retry_after between 1 and 60$$,1,'hit 4 refused with a retry-after');
select t_count($$select 1 from rate_limit_hit('u:2', 3, interval '1 minute') where allowed$$,1,'another bucket is independent');
select t_su(); update rate_limit_events set created_at = now() - interval '3 days'; select t_srv();
select t_count($$select 1 where rate_limit_purge() >= 3$$,1,'purge removes old events');
select t_count($$select 1 from rate_limit_hit('u:1', 3, interval '1 minute') where allowed$$,1,'window slides: allowed again');

-- routes, jobs, privacy
select t_su();
select t_count($$select 1 from ai_routes$$,5,'five routes seeded (one per operation)');
insert into credit_reservations(id,user_id,operation_key,credits,idempotency_key,expires_at) values ('c1000000-0000-4000-8000-0000000000f1','c1000000-0000-4000-8000-000000000001','quick_question',50,'job-res-0001',now()+interval '10 minutes');
select t_srv();
select t_ok($$insert into ai_jobs(user_id,idempotency_key,operation_key,reservation_id,persona,language,request_text) values ('c1000000-0000-4000-8000-000000000001','job-key-0001','quick_question','c1000000-0000-4000-8000-0000000000f1','rashid','ar','سؤال')$$,'service role records a job');
select t_err($$insert into ai_jobs(user_id,idempotency_key,operation_key,persona,language) values ('c1000000-0000-4000-8000-000000000001','job-key-0001','quick_question','rashid','ar')$$,'same idempotency key cannot create a second job');
select t_err($$insert into ai_jobs(user_id,idempotency_key,operation_key,persona,language) values ('c1000000-0000-4000-8000-000000000001','job-key-0002','quick_question','coach_x','ar')$$,'unknown persona is rejected');
select t_su(); update ai_jobs set status='done', response_text='رد خاص', provider='mock', cost_usd_micro=0 where idempotency_key='job-key-0001';
select t_as('c1000000-0000-4000-8000-000000000001');
select t_count($$select 1 from ai_jobs where response_text='رد خاص'$$,1,'member reads their own AI answer');
select t_err($$select provider from ai_jobs$$,'member cannot read provider/cost columns');
select t_err($$update ai_jobs set response_text='x'$$,'member cannot edit jobs');
select t_err($$insert into ai_jobs(user_id,idempotency_key,operation_key,persona,language) values (auth.uid(),'job-key-0003','quick_question','sarah','en')$$,'member cannot create jobs');
select t_as('c1000000-0000-4000-8000-000000000002');
select t_count($$select 1 from ai_jobs$$,0,'another member sees none of those AI conversations');
select t_err($$select * from ai_budget$$,'member cannot read the budget gate');
select t_err($$select * from ai_routes$$,'member cannot read routing configuration');
select t_err($$select ai_budget_authorize(1)$$,'member cannot call the budget gate');
select t_err($$select rate_limit_hit('x',1,interval '1 minute')$$,'member cannot call the rate limiter');
select t_anon();
select t_err($$select * from ai_jobs$$,'anonymous cannot read AI jobs');
select t_err($$select ai_budget_authorize(1)$$,'anonymous cannot call the budget gate');
select t_su();
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
