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
create or replace function t_u4(u uuid, verified boolean default true) returns void language plpgsql as $$ begin insert into auth.users(id,email,email_confirmed_at) values (u, u::text||'@m4.test', case when verified then now() end); end $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;
create or replace function t_sess(u uuid, s uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('session_id', s, 'sub', u, 'role','authenticated','aal','aal1')::text, false); set role authenticated; end $$;
-- operator shortcut: challenge + verify for (user, device hash, session) as the Edge Function would do it
create or replace function t_trust(u uuid, h text, s uuid) returns boolean language plpgsql as $$ begin perform public.device_challenge_create(u, h, '123456'); return public.device_challenge_verify(u, h, '123456', s, 'dev'); end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;
select t_su(); select t_u4('d4000000-0000-4000-8000-000000000001'), t_u4('d4000000-0000-4000-8000-000000000002'), t_u4('d4000000-0000-4000-8000-000000000003', false), t_u4('d4000000-0000-4000-8000-000000000004');

-- ================= A. two trusted devices / two active sessions
select t_srv();
select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000001', repeat('a',64), 'd4000000-0000-4000-8000-0000000000a1')$$,1,'device A verified');
select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000001', repeat('b',64), 'd4000000-0000-4000-8000-0000000000b1')$$,1,'device B verified');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a1');
select t_count($$select 1 where is_trusted_session()$$,1,'device A session is trusted');
select t_ok($$select my_credit_balance()$$,'device A session reads the balance');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b1');
select t_count($$select 1 where is_trusted_session()$$,1,'device B session is trusted AT THE SAME TIME');
select t_ok($$select my_credit_balance()$$,'device B session reads the balance');
select t_count($$select 1 from trusted_devices where revoked_at is null$$,2,'member sees both devices');
select t_err($$select * from user_active_sessions$$,'member cannot read active sessions');
select t_err($$insert into user_active_sessions(user_id, session_id) values (auth.uid(), gen_random_uuid())$$,'member cannot make a session trusted');
select t_err($$select device_session_activate(auth.uid(), null, gen_random_uuid())$$,'member cannot call device_session_activate');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000ff');
select t_count($$select 1 where is_trusted_session()$$,0,'a third, unverified session of the same user is NOT trusted');
select t_err($$select my_credit_balance()$$,'unverified session cannot read the balance');
select t_srv();
select t_err($$select * from user_active_sessions$$,'service_role cannot read active sessions directly');
select t_err($$select device_session_activate('d4000000-0000-4000-8000-000000000001'::uuid, null, gen_random_uuid())$$,'service_role cannot call device_session_activate');
-- the same device signs in again: only THAT device's previous session is replaced
select t_count($$select 1 where device_status('d4000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), 'd4000000-0000-4000-8000-0000000000a2') = 'trusted'$$,1,'known device A, new session => trusted');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 where is_trusted_session()$$,1,'device A new session is trusted');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a1');
select t_count($$select 1 where is_trusted_session()$$,0,'device A OLD session lost trust (one session per device)');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b1');
select t_count($$select 1 where is_trusted_session()$$,1,'device B is unaffected by device A signing in again');
select t_su(); select t_count($$select 1 from user_active_sessions where user_id='d4000000-0000-4000-8000-000000000001'$$,2,'exactly two active rows');
-- third device: the least recently seen device (B) is evicted
select t_srv();
select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000001', repeat('c',64), 'd4000000-0000-4000-8000-0000000000c1')$$,1,'device C verified (third device)');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000c1');
select t_count($$select 1 where is_trusted_session()$$,1,'third device is trusted');
select t_count($$select 1 from trusted_devices where revoked_at is null$$,2,'still only two non-revoked devices');
select t_count($$select 1 from trusted_devices where revoked_at is not null$$,1,'the evicted device is marked revoked');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b1');
select t_count($$select 1 where is_trusted_session()$$,0,'the OLDEST device (B) was evicted: its session is no longer trusted');
select t_err($$select my_credit_balance()$$,'evicted session cannot read the balance');
select t_count($$select 1 from credit_ledger$$,0,'evicted session sees no ledger rows');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 where is_trusted_session()$$,1,'the more recent device (A) stays trusted');
select t_su();
select t_count($$select 1 from user_active_sessions where user_id='d4000000-0000-4000-8000-000000000001'$$,2,'never more than two active rows');
select t_count($$select 1 from security_events where user_id='d4000000-0000-4000-8000-000000000001' and event='device.evicted'$$,1,'device.evicted is recorded');
-- the evicted device can only come back through a new e-mail code
select t_srv();
select t_count($$select 1 where device_status('d4000000-0000-4000-8000-000000000001'::uuid, repeat('b',64), 'd4000000-0000-4000-8000-0000000000b2') = 'challenge_required'$$,1,'evicted device must verify again');
-- revoke
select t_su(); insert into t_ids select 'devC', id::text from trusted_devices where user_id='d4000000-0000-4000-8000-000000000001' and device_hash=repeat('c',64); select t_srv();
select t_ok($$select device_revoke('d4000000-0000-4000-8000-000000000001'::uuid, (select v::uuid from t_ids where k='devC'))$$,'revoke device C');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000c1');
select t_count($$select 1 where is_trusted_session()$$,0,'revoking a device removes its trust');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 where is_trusted_session()$$,1,'revoking C does not touch device A');
select t_srv();
select t_ok($$select device_revoke('d4000000-0000-4000-8000-000000000002'::uuid, (select id from (select v::uuid id from t_ids where k='devC') x))$$,'revoke with ANOTHER user id is a no-op');
select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000001', repeat('b',64), 'd4000000-0000-4000-8000-0000000000b2')$$,1,'device B re-verified after eviction');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000b2');
select t_count($$select 1 where is_trusted_session()$$,1,'re-verified device is trusted again');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 where is_trusted_session()$$,1,'and device A is still trusted (2 devices, nothing to evict)');

-- ================= B. cross-user isolation + legacy (backfilled) rows + session.evicted
select t_srv();
select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000002', repeat('a',64), 'd4000000-0000-4000-8000-0000000002a1')$$,1,'user 2 verifies a device with the SAME device hash');
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000002a1');
select t_count($$select 1 where is_trusted_session()$$,1,'user 2 session trusted');
select t_count($$select 1 from trusted_devices$$,1,'user 2 sees only their own device');
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 where is_trusted_session()$$,0,'user 2 cannot borrow a trusted session id of user 1');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000002a1');
select t_count($$select 1 where is_trusted_session()$$,0,'user 1 cannot borrow a trusted session id of user 2');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 where is_trusted_session()$$,1,'user 2 verifying did not evict user 1');
-- legacy rows (as the backfill creates them: no device) count towards the limit and the oldest is evicted
select t_su();
insert into user_active_sessions(user_id, session_id, activated_at) values ('d4000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-0000000004e1', now() - interval '2 days'), ('d4000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-0000000004e2', now() - interval '1 day');
select t_sess('d4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-0000000004e1');
select t_count($$select 1 where is_trusted_session()$$,1,'backfilled legacy session is trusted');
select t_srv();
select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000004', repeat('d',64), 'd4000000-0000-4000-8000-0000000004d1')$$,1,'user 4 verifies a device while two sessions are active');
select t_sess('d4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-0000000004e1');
select t_count($$select 1 where is_trusted_session()$$,0,'the OLDEST active session was evicted');
select t_sess('d4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-0000000004e2');
select t_count($$select 1 where is_trusted_session()$$,1,'the newer one stays');
select t_sess('d4000000-0000-4000-8000-000000000004', 'd4000000-0000-4000-8000-0000000004d1');
select t_count($$select 1 where is_trusted_session()$$,1,'the new device is trusted');
select t_su();
select t_count($$select 1 from security_events where user_id='d4000000-0000-4000-8000-000000000004' and event='session.evicted'$$,1,'session.evicted is recorded');
select t_count($$select 1 from user_session_state where user_id='d4000000-0000-4000-8000-000000000004' and active_session_id='d4000000-0000-4000-8000-0000000004d1'$$,1,'legacy user_session_state still mirrors the latest activation');

-- ================= C. support tickets
select t_srv();
select t_count($$select 1 where support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC234', 'billing', 'normal', 'دفعت وما وصلني الاشتراك', '[{"role":"user","text":"hi"}]'::jsonb) > now() - interval '1 minute'$$,1,'service_role creates a ticket through the function');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC234', 'billing', 'normal', 'x', '[]'::jsonb)$$,'duplicate ticket ref refused');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC235', 'gossip', 'normal', 'x', '[]'::jsonb)$$,'unknown category refused');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC236', 'other', 'urgent', 'x', '[]'::jsonb)$$,'unknown priority refused');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'bad ref', 'other', 'low', 'x', '[]'::jsonb)$$,'malformed ref refused');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC237', 'other', 'low', '  ', '[]'::jsonb)$$,'empty summary refused');
select t_err($$select support_ticket_create(gen_random_uuid(), 'VR-ABC238', 'other', 'low', 'x', '[]'::jsonb)$$,'unknown user refused');
select t_err($$select * from support_tickets$$,'service_role has no direct read on tickets');
select t_err($$insert into support_tickets(ticket_ref, user_id, category, summary) values ('VR-ZZZ222', 'd4000000-0000-4000-8000-000000000001', 'other', 'x')$$,'service_role has no direct insert on tickets');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 from support_tickets where ticket_ref='VR-ABC234' and status='open' and priority='normal'$$,1,'owner (trusted session) sees the ticket');
select t_count($$select 1 from support_tickets where retain_until between created_at + interval '5 months' and created_at + interval '7 months'$$,1,'retention is 6 months');
select t_err($$insert into support_tickets(ticket_ref, user_id, category, summary) values ('VR-ZZZ223', auth.uid(), 'other', 'x')$$,'member cannot insert tickets');
select t_err($$update support_tickets set status='resolved'$$,'member cannot update tickets');
select t_err($$delete from support_tickets$$,'member cannot delete tickets');
select t_err($$select support_ticket_create(auth.uid(), 'VR-ABC239', 'other', 'low', 'x', '[]'::jsonb)$$,'member cannot call support_ticket_create');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000ff');
select t_count($$select 1 from support_tickets$$,0,'owner from an UNTRUSTED session sees no tickets');
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000002a1');
select t_count($$select 1 from support_tickets$$,0,'another (trusted) user sees no tickets of user 1');
select t_anon();
select t_err($$select * from support_tickets$$,'anon cannot read tickets');
select t_err($$select support_ticket_create(gen_random_uuid(), 'VR-ABC240', 'other', 'low', 'x', '[]'::jsonb)$$,'anon cannot call support_ticket_create');
select t_err($$select is_trusted_session()$$,'anon cannot call is_trusted_session');

-- ================= D. agents: prices, routes, free support with an empty wallet
select t_su();
select t_count($$select 1 from ai_operations where (key, credits) in (('agent_coach',50),('agent_nutritionist',50),('agent_support',0)) and enabled$$,3,'agent prices: coach 50, nutritionist 50, support 0');
select t_count($$select 1 from ai_routes where operation_key like 'agent\_%' and provider='anthropic'$$,3,'agent routes exist');
select t_ok($$update ai_routes set fallback_provider='gemini', fallback_model='gemini-2.5-flash' where operation_key='agent_support'$$,'gemini is an allowed fallback provider');
select t_ok($$update ai_routes set provider='gemini' where operation_key='agent_support'; update ai_routes set provider='anthropic', fallback_provider=null, fallback_model=null where operation_key='agent_support'$$,'gemini is an allowed provider');
select t_err($$update ai_routes set provider='openai' where operation_key='agent_support'$$,'unknown provider still refused');
select t_count($$select 1 where (select coalesce(sum(amount),0) from credit_ledger where user_id='d4000000-0000-4000-8000-000000000003') = 0$$,1,'user 3 has an EMPTY wallet');
select t_srv();
select t_ok($$insert into t_ids select 'r0', o_reservation_id::text from credit_reserve('d4000000-0000-4000-8000-000000000003'::uuid, 'agent_support', 'm4-idem-0001') where o_credits = 0 and o_status = 'reserved'$$,'reserve agent_support');
select t_count($$select 1 from t_ids where k='r0'$$,1,'a 0-credit reservation works with an empty wallet');
select t_count($$select 1 where credit_settle((select v::uuid from t_ids where k='r0'), 'd4000000-0000-4000-8000-000000000003'::uuid) = 'settled'$$,1,'a 0-credit reservation settles');
select t_err($$select * from credit_reserve('d4000000-0000-4000-8000-000000000003'::uuid, 'agent_coach', 'm4-idem-0002')$$,'agent_coach (50) is refused with an empty wallet');
select t_ok($$insert into t_ids select 'r1', o_reservation_id::text from credit_reserve('d4000000-0000-4000-8000-000000000003'::uuid, 'agent_support', 'm4-idem-0003')$$,'second support reservation');
select t_count($$select 1 where credit_release((select v::uuid from t_ids where k='r1'), 'd4000000-0000-4000-8000-000000000003'::uuid, 'test') = 'released'$$,1,'a 0-credit reservation can be released');
select t_ok($$insert into t_ids select 'r2', o_reservation_id::text from credit_reserve('d4000000-0000-4000-8000-000000000001'::uuid, 'agent_coach', 'm4-idem-0004') where o_credits = 50$$,'coach reservation for a funded user');
select t_ok($$select credit_settle((select v::uuid from t_ids where k='r2'), 'd4000000-0000-4000-8000-000000000001'::uuid)$$,'coach reservation settles');
select t_ok($$insert into ai_jobs(user_id, idempotency_key, operation_key, persona, language, agent_role, request_text) values ('d4000000-0000-4000-8000-000000000003', 'm4-idem-0001', 'agent_support', 'rashid', 'ar', 'support', 'x')$$,'job row with agent_role');
select t_err($$insert into ai_jobs(user_id, idempotency_key, operation_key, persona, language, agent_role) values ('d4000000-0000-4000-8000-000000000003', 'm4-idem-0009', 'agent_support', 'rashid', 'ar', 'doctor')$$,'unknown agent_role refused');
select t_su();
select t_count($$select 1 where (select coalesce(sum(amount),0) from credit_ledger where user_id='d4000000-0000-4000-8000-000000000003') = 0$$,1,'support cost nothing: wallet still 0, never negative');
select t_count($$select 1 where (select coalesce(sum(amount),0) from credit_ledger where user_id='d4000000-0000-4000-8000-000000000001') = 2450$$,1,'coach cost exactly 50 (2500 -> 2450)');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 from ai_operations where key='agent_support' and credits=0$$,1,'member can read the support price (0) before confirming');
select t_su();
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
