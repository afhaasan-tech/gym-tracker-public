\set ON_ERROR_STOP off
drop table if exists t_results cascade;
create table t_results(n serial, ok boolean, label text);
drop table if exists t_ids; create table t_ids(k text primary key, v text); grant all on t_ids to public;
delete from bookings;
create or replace function t_as(u uuid, aal text default 'aal2') returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', aal)::text, false); set role authenticated; end $$;
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


insert into auth.users(id,email,email_confirmed_at) values
 ('a0000000-0000-4000-8000-00000000000a','super@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000d','member@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000f','member2@t.test',now()) on conflict do nothing;
delete from services where id='b0000000-0000-4000-8000-000000000001';
insert into services(id,name,description,price_kwd,is_demo,format,delivery,capacity,status,platform_owned,is_available) values
 ('b0000000-0000-4000-8000-000000000001','Pay test svc','x',2.500,true,'private','online',1,'published',true,true);
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_ok($$insert into bookings(service_id,scheduled_at) values ('b0000000-0000-4000-8000-000000000001', now()+interval '3 days')$$, 'member creates a booking (pending/pending, price from server)');
insert into t_ids select 'b1', id::text from bookings where scheduled_at < now()+interval '4 days';
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b1') and price_kwd=2.5 and payment_status='pending'$$,1,'booking has server price 2.500 and payment_status pending');
-- direct tampering
select t_err($$update bookings set payment_status='paid' where id=(select v::uuid from t_ids where k='b1')$$,'member cannot set payment_status=paid directly');
select t_err($$update bookings set payment_status='awaiting_payment' where id=(select v::uuid from t_ids where k='b1')$$,'member cannot set payment_status=awaiting_payment directly');
select t_err($$update bookings set price_kwd=0.001 where id=(select v::uuid from t_ids where k='b1')$$,'member cannot change the price');
select t_err($$insert into bookings(service_id,scheduled_at,payment_status) values ('b0000000-0000-4000-8000-000000000001', now()+interval '4 days','paid')$$,'member cannot insert an already-paid booking');
select t_err($$select payment_start((select v::uuid from t_ids where k='b1'),'a0000000-0000-4000-8000-00000000000d')$$,'member cannot call payment_start');
select t_err($$select payment_apply(gen_random_uuid(),'CAPTURED',2.5,'KWD','t','{}','webhook')$$,'member cannot call payment_apply');
select t_err($$insert into payment_attempts(booking_id,user_id,idempotency_key,amount_kwd,expires_at) values ((select v::uuid from t_ids where k='b1'),auth.uid(),'k',2.5,now()+interval '1 hour')$$,'member cannot insert payment attempts');
select t_anon();
select t_err($$update bookings set payment_status='paid'$$,'anon cannot update bookings');
select t_err($$select payment_apply(gen_random_uuid(),'CAPTURED',2.5,'KWD','t','{}','webhook')$$,'anon cannot call payment_apply');
select t_err($$select * from payment_attempts$$,'anon cannot read payment attempts');
-- super admin in the browser (aal2) cannot bypass either
select t_as('a0000000-0000-4000-8000-00000000000a','aal2');
select t_err($$update bookings set payment_status='paid' where id=(select v::uuid from t_ids where k='b1')$$,'browser super admin (aal2) cannot set payment_status=paid');
select t_err($$select payment_apply(gen_random_uuid(),'CAPTURED',2.5,'KWD','t','{}','webhook')$$,'browser super admin cannot call payment_apply');
select t_count($$select 1 from payment_events$$,0,'admin can read (empty) payment events through RLS');
-- trusted server path
reset role; set role service_role; select set_config('request.jwt.claims','',false);
select t_err($$update bookings set payment_status='paid' where id=(select v::uuid from t_ids where k='b1')$$,'even service_role cannot mark paid without a verified captured attempt');
select t_err($$select payment_start((select v::uuid from t_ids where k='b1'),'a0000000-0000-4000-8000-00000000000f')$$,'non-owner cannot start payment (PA001)');
select t_ok($$insert into t_ids select 'a1', o_attempt_id::text from payment_start((select v::uuid from t_ids where k='b1'),'a0000000-0000-4000-8000-00000000000d')$$,'owner starts payment: attempt created');
select t_count($$select 1 from payment_attempts where booking_id=(select v::uuid from t_ids where k='b1') and amount_kwd=2.500 and status='created'$$,1,'attempt amount is the server price 2.500');
select t_ok($$select * from payment_start((select v::uuid from t_ids where k='b1'),'a0000000-0000-4000-8000-00000000000d')$$,'double click: second start returns the same open attempt');
select t_count($$select 1 from payment_attempts where booking_id=(select v::uuid from t_ids where k='b1')$$,1,'double click created NO second attempt');
select t_err($$insert into payment_attempts(booking_id,user_id,idempotency_key,amount_kwd,expires_at) values ((select v::uuid from t_ids where k='b1'),'a0000000-0000-4000-8000-00000000000d','k2',2.5,now()+interval '1 hour')$$,'unique index blocks a second open attempt');
select t_ok($$select payment_set_checkout((select v::uuid from t_ids where k='a1'),'sess1','https://sandbox.upayments.com?session_id=sess1','{}')$$,'checkout recorded');
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b1') and payment_status='awaiting_payment'$$,1,'booking is awaiting_payment');
-- verification rules
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a1'),'CAPTURED',0.001,'KWD','trk1','{}','webhook')->>'outcome')='rejected_amount_or_currency_mismatch'$$,1,'captured with wrong amount (0.001) is rejected');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a1'),'CAPTURED',2.5,'USD','trk1','{}','webhook')->>'outcome')='rejected_amount_or_currency_mismatch'$$,1,'captured with wrong currency is rejected');
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b1') and payment_status='awaiting_payment'$$,1,'rejected events leave the booking unpaid');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a1'),'PENDING',null,null,'trk1','{}','webhook')->>'outcome')='ignored_non_terminal'$$,1,'PENDING changes nothing');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a1'),'CAPTURED',2.5,'KWD','trk1','{}','webhook')->>'outcome')='applied'$$,1,'verified CAPTURED applies');
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b1') and payment_status='paid'$$,1,'booking is paid');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a1'),'CAPTURED',2.5,'KWD','trk1','{}','webhook')->>'outcome')='duplicate'$$,1,'duplicate CAPTURED is reported as duplicate');
select t_count($$select 1 from payment_events where outcome='applied' and result='CAPTURED'$$,1,'duplicate processed exactly once (1 applied event)');
select t_count($$select 1 from payment_events where outcome='duplicate'$$,1,'duplicate is audited');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a1'),'FAILED',null,null,'trk1','{}','webhook')->>'outcome')='ignored_downgrade'$$,1,'late FAILED cannot downgrade a paid booking');
select t_err($$update bookings set payment_status='failed' where id=(select v::uuid from t_ids where k='b1')$$,'paid is terminal even for service_role');
select t_err($$select payment_start((select v::uuid from t_ids where k='b1'),'a0000000-0000-4000-8000-00000000000d')$$,'paid booking cannot start a new payment (PA003)');
-- decline + expiry + late capture on a second booking
reset role; set role authenticated; select t_as('a0000000-0000-4000-8000-00000000000d');
select t_ok($$insert into bookings(service_id,scheduled_at) values ('b0000000-0000-4000-8000-000000000001', now()+interval '5 days')$$,'second booking');
insert into t_ids select 'b2', id::text from bookings where scheduled_at > now()+interval '4 days';
reset role; set role service_role; select set_config('request.jwt.claims','',false);
select t_ok($$insert into t_ids select 'a2', o_attempt_id::text from payment_start((select v::uuid from t_ids where k='b2'),'a0000000-0000-4000-8000-00000000000d')$$,'attempt 2');
select t_ok($$select payment_set_checkout((select v::uuid from t_ids where k='a2'),'sess2','https://x','{}')$$,'checkout 2');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a2'),'NOT CAPTURED',null,null,'trk2','{}','webhook')->>'outcome')='applied'$$,1,'declined payment applies');
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b2') and payment_status='failed'$$,1,'declined booking is failed');
select t_ok($$insert into t_ids select 'a3', o_attempt_id::text from payment_start((select v::uuid from t_ids where k='b2'),'a0000000-0000-4000-8000-00000000000d')$$,'retry after failure creates a fresh attempt');
select t_ok($$select payment_set_checkout((select v::uuid from t_ids where k='a3'),'sess3','https://y','{}')$$,'checkout 3');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a3'),'EXPIRED',null,null,null,'{}','reconcile')->>'outcome')='ignored_not_open_or_not_due'$$,1,'cannot expire an attempt before its expiry time');
reset role; update payment_attempts set expires_at=now()-interval '1 minute' where id=(select v::uuid from t_ids where k='a3'); set role service_role;
select t_err($$select payment_start((select v::uuid from t_ids where k='b2'),'a0000000-0000-4000-8000-00000000000d')$$,'overdue open attempt blocks a new one until reconciled (PA004)');
select t_count($$select 1 from payment_overdue(10)$$,1,'overdue attempt is listed for reconciliation');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a3'),'EXPIRED',null,null,null,'{}','reconcile')->>'outcome')='applied'$$,1,'abandoned attempt expires');
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b2') and payment_status='expired'$$,1,'booking is expired');
select t_count($$select 1 where (payment_apply((select v::uuid from t_ids where k='a3'),'CAPTURED',2.5,'KWD','trk3','{}','webhook')->>'outcome')='late_capture_applied'$$,1,'late verified capture after expiry is NOT lost');
select t_count($$select 1 from bookings where id=(select v::uuid from t_ids where k='b2') and payment_status='paid'$$,1,'late capture marks the booking paid');
-- visibility
reset role; set role authenticated; select t_as('a0000000-0000-4000-8000-00000000000d');
select t_count($$select 1 from payment_attempts$$,3,'member reads own attempts');
select t_err($$select checkout_url from payment_attempts$$,'member cannot read checkout_url / gateway_response columns');
select t_as('a0000000-0000-4000-8000-00000000000f');
select t_count($$select 1 from payment_attempts$$,0,'another member sees none of them');
select t_as('a0000000-0000-4000-8000-00000000000a','aal2');
select t_count($$select 1 from payment_events$$,16,'admin (aal2) reads the audit trail (16 events)');
select t_as('a0000000-0000-4000-8000-00000000000a','aal1');
select t_count($$select 1 from payment_events$$,0,'admin without MFA reads nothing');
select t_su();
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
