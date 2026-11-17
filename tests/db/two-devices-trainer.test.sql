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

-- ================= C. support tickets (service path + the member form)
select t_srv();
select t_count($$select 1 where support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC234', 'billing', 'normal', 'دفعت وما وصلني الاشتراك', '[{"role":"user","text":"hi"}]'::jsonb) > now() - interval '1 minute'$$,1,'service_role creates a ticket through the function');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC234', 'billing', 'normal', 'x', '[]'::jsonb)$$,'duplicate ticket ref refused');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'VR-ABC235', 'gossip', 'normal', 'x', '[]'::jsonb)$$,'unknown category refused');
select t_err($$select support_ticket_create('d4000000-0000-4000-8000-000000000001'::uuid, 'bad ref', 'other', 'low', 'x', '[]'::jsonb)$$,'malformed ref refused');
select t_err($$select support_ticket_create(gen_random_uuid(), 'VR-ABC238', 'other', 'low', 'x', '[]'::jsonb)$$,'unknown user refused');
select t_err($$select * from support_tickets$$,'service_role has no direct read on tickets');
select t_err($$insert into support_tickets(ticket_ref, user_id, category, summary) values ('VR-ZZZ222', 'd4000000-0000-4000-8000-000000000001', 'other', 'x')$$,'service_role has no direct insert on tickets');
select t_err($$select support_ticket_open('other', 'this is a long enough summary')$$,'service_role cannot call the member form');
-- the member form works from an UNTRUSTED session (locked-out member), needs a confirmed e-mail
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000002ff');
select t_count($$select 1 where is_trusted_session()$$,0,'user 2 session ff is untrusted');
select t_ok($$insert into t_ids select 'tk1', support_ticket_open('device_limit', '   ما أقدر أدخل من جهازي الجديد   ')$$,'untrusted but verified member opens a ticket');
select t_count($$select 1 from t_ids where k='tk1' and v ~ '^VR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'$$,1,'ref is VR- + 6 unambiguous characters');
select t_count($$select 1 from support_tickets$$,0,'untrusted session cannot READ tickets (even its own)');
select t_err($$select support_ticket_open('gossip', 'this is a long enough summary')$$,'form: unknown category refused');
select t_err($$select support_ticket_open('other', '   short   ')$$,'form: summary shorter than 10 after trim refused');
select t_err($$select support_ticket_open('other', repeat('x', 1001))$$,'form: summary longer than 1000 refused');
select t_err($$select support_ticket_open('other', null)$$,'form: null summary refused');
select t_ok($$select support_ticket_open('other', repeat('x', 1000))$$,'form: 1000 characters accepted (2)');
select t_ok($$select support_ticket_open('billing', 'ticket number three ok')$$,'form: ticket 3');
select t_ok($$select support_ticket_open('renewal', 'ticket number four ok')$$,'form: ticket 4');
select t_ok($$select support_ticket_open('technical', 'ticket number five ok')$$,'form: ticket 5');
select t_err($$select support_ticket_open('technical', 'ticket number six is refused')$$,'form: 6th ticket within 24h refused');
select t_su(); select t_count($$select 1 from support_tickets where user_id='d4000000-0000-4000-8000-000000000002'$$,5,'exactly five tickets stored');
select t_count($$select 1 from support_tickets where user_id='d4000000-0000-4000-8000-000000000002' and summary='ما أقدر أدخل من جهازي الجديد' and priority='normal' and status='open' and transcript='[]'$$,1,'summary trimmed, defaults applied');
select t_count($$select 1 from security_events where user_id='d4000000-0000-4000-8000-000000000002' and event='support.ticket_created'$$,5,'ticket creation is recorded');
set session_replication_role = replica; update support_tickets set created_at = now() - interval '25 hours' where user_id='d4000000-0000-4000-8000-000000000002' and summary='ticket number three ok'; set session_replication_role = default;
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000002ff');
select t_ok($$select support_ticket_open('other', 'allowed again after 24 hours')$$,'form: the limit is a rolling 24h window');
select t_sess('d4000000-0000-4000-8000-000000000003', 'd4000000-0000-4000-8000-0000000003ff');
select t_err($$select support_ticket_open('other', 'unverified e-mail must be refused')$$,'form: unverified e-mail refused');
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000002a1');
select t_count($$select 1 from support_tickets$$,6,'owner on a TRUSTED session sees own tickets');
select t_count($$select 1 from support_tickets where retain_until between created_at + interval '5 months' and created_at + interval '7 months'$$,6,'retention is 6 months');
select t_err($$insert into support_tickets(ticket_ref, user_id, category, summary) values ('VR-ZZZ223', auth.uid(), 'other', 'x')$$,'member cannot insert tickets directly');
select t_err($$update support_tickets set status='resolved'$$,'member cannot update tickets');
select t_err($$delete from support_tickets$$,'member cannot delete tickets');
select t_err($$select support_ticket_create(auth.uid(), 'VR-ABC239', 'other', 'low', 'x', '[]'::jsonb)$$,'member cannot call support_ticket_create');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 from support_tickets$$,1,'user 1 (trusted) sees only their own ticket, none of user 2');
select t_anon();
select t_err($$select * from support_tickets$$,'anon cannot read tickets');
select t_err($$select support_ticket_open('other', 'anon must not open tickets')$$,'anon cannot call support_ticket_open');
select t_err($$select support_ticket_create(gen_random_uuid(), 'VR-ABC240', 'other', 'low', 'x', '[]'::jsonb)$$,'anon cannot call support_ticket_create');
select t_err($$select is_trusted_session()$$,'anon cannot call is_trusted_session');

-- ================= D. trainer operations, routes, job columns, plans
select t_su();
select t_count($$select 1 from ai_operations where (key, credits) in (('trainer_message',50),('trainer_image',300),('trainer_audio',100),('trainer_video',500)) and enabled$$,4,'trainer prices: message 50, image 300, audio 100, video 500');
select t_count($$select 1 from ai_operations where key like 'agent\_%'$$,0,'no agent_* operations exist');
select t_count($$select 1 from ai_routes where operation_key in ('trainer_message','trainer_image') and provider='anthropic' and model like 'claude-%'$$,2,'message/image route to anthropic');
select t_count($$select 1 from ai_routes where operation_key in ('trainer_audio','trainer_video') and provider='gemini' and model='gemini-2.5-flash'$$,2,'audio/video route to gemini-2.5-flash');
select t_ok($$update ai_routes set fallback_provider='gemini', fallback_model='gemini-2.5-flash' where operation_key='trainer_image'; update ai_routes set fallback_provider=null, fallback_model=null where operation_key='trainer_image'$$,'gemini is an allowed fallback provider');
select t_err($$update ai_routes set provider='openai' where operation_key='trainer_message'$$,'unknown provider still refused');
select t_count($$select 1 from information_schema.columns where table_name='ai_jobs' and column_name='agent_role'$$,0,'ai_jobs has no agent_role column');
select t_count($$select 1 from plans where (key, includes_nutrition) in (('essential',false),('pro',true),('elite',true),('vip',true))$$,4,'nutrition: essential no; pro/elite/vip yes');
select t_count($$select 1 from jsonb_array_elements(public_plans()) e where (e->>'key', (e->>'includes_nutrition')::boolean) in (('essential',false),('pro',true))$$,2,'public_plans() returns includes_nutrition');
select t_anon(); select t_ok($$select public_plans()$$,'anon can still call public_plans');
select t_srv();
select t_ok($$insert into ai_jobs(user_id, idempotency_key, operation_key, persona, language, conversation_id, tier, media_kinds) values ('d4000000-0000-4000-8000-000000000001', 'm4-idem-0001', 'trainer_image', 'rashid', 'ar', 'c0000000-0000-4000-8000-000000000001', 'trial', array['image'])$$,'job row with conversation_id / tier / media_kinds');
select t_err($$insert into ai_jobs(user_id, idempotency_key, operation_key, persona, language, tier) values ('d4000000-0000-4000-8000-000000000001', 'm4-idem-0009', 'trainer_message', 'rashid', 'ar', 'vip')$$,'unknown tier refused');
select t_sess('d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-0000000000a2');
select t_count($$select 1 from ai_jobs where tier='trial' and conversation_id='c0000000-0000-4000-8000-000000000001' and media_kinds = array['image']$$,1,'member reads own job incl. the new columns');
select t_count($$select 1 from ai_operations where key='trainer_video' and credits=500$$,1,'member can read a trainer price before confirming');

-- ================= E. the ONE free trial conversation
select t_su(); select t_u4('d4000000-0000-4000-8000-000000000005'), t_u4('d4000000-0000-4000-8000-000000000006'), t_u4('d4000000-0000-4000-8000-000000000007');
select t_srv();
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"trial","nutrition":false,"plan_key":null,"trial":{"available":true,"started":false,"ended":false,"remaining":10,"max_messages":10,"conversation_id":null}}'$$,1,'fresh account: tier trial, not started, 10 messages');
select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000005'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) = '{"allowed":true,"remaining":9}'$$,1,'first message starts the trial (remaining 9)');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"trial","trial":{"started":true,"remaining":9,"conversation_id":"c0000000-0000-4000-8000-000000000001"}}'$$,1,'trial is bound to the conversation');
select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000005'::uuid, 'c0000000-0000-4000-8000-000000000002'::uuid) @> '{"allowed":false,"reason":"trial_ended"}'$$,1,'a SECOND conversation is refused');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"trial","trial":{"remaining":9}}'$$,1,'the refused attempt consumed nothing');
select t_count($$select 1 where trainer_trial_refund('d4000000-0000-4000-8000-000000000005'::uuid)$$,1,'refund gives one message back');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"trial":{"remaining":10,"started":true}}'$$,1,'remaining back to 10 after refund');
select t_count($$select 1 where not trainer_trial_refund('d4000000-0000-4000-8000-000000000005'::uuid)$$,1,'refund never goes below zero used');
select t_count($$select 1 from generate_series(1,10) g where (trainer_trial_consume('d4000000-0000-4000-8000-000000000005'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid)->>'allowed')::boolean$$,10,'ten messages allowed');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"none","trial":{"available":false,"ended":true,"remaining":0}}'$$,1,'limit reached => tier none');
select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000005'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) @> '{"allowed":false,"reason":"trial_ended"}'$$,1,'11th message refused');
select t_count($$select 1 where trainer_trial_refund('d4000000-0000-4000-8000-000000000005'::uuid)$$,1,'a failed 10th message can still be refunded');
select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000005'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) = '{"allowed":true,"remaining":0}'$$,1,'and re-sent once');
select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000005'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) @> '{"allowed":false}'$$,1,'then refused again');
select t_err($$insert into trainer_trials(user_id, conversation_id) values ('d4000000-0000-4000-8000-000000000005', gen_random_uuid())$$,'service_role cannot write trials directly');
select t_err($$select * from trainer_trials$$,'service_role cannot read trials directly');
select t_err($$update trainer_settings set trial_max_messages = 50$$,'service_role cannot change trial settings');
select t_su();
select t_count($$select 1 from trainer_trials where user_id='d4000000-0000-4000-8000-000000000005' and ended_at is not null and messages_used = 10$$,1,'ended_at stamped, used = max');
select t_err($$insert into trainer_trials(user_id, conversation_id) values ('d4000000-0000-4000-8000-000000000005', gen_random_uuid())$$,'a second trial row for the same account is impossible (primary key)');
select t_count($$select 1 from security_events where user_id='d4000000-0000-4000-8000-000000000005' and event='trainer.trial_started'$$,1,'trial start recorded once');
-- window
select t_srv(); select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000006'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) @> '{"allowed":true,"remaining":9}'$$,1,'user 6 starts a trial (same conversation id as user 5 is fine: per account)');
select t_su(); update trainer_trials set started_at = now() - interval '25 hours' where user_id='d4000000-0000-4000-8000-000000000006'; select t_srv();
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000006'::uuid) @> '{"tier":"none","trial":{"ended":true,"remaining":0}}'$$,1,'window passed => tier none (even with 9 messages left)');
select t_count($$select 1 where trainer_trial_consume('d4000000-0000-4000-8000-000000000006'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid) @> '{"allowed":false,"reason":"trial_ended"}'$$,1,'window passed => refused');
select t_count($$select 1 where trainer_trial_refund('d4000000-0000-4000-8000-000000000006'::uuid)$$,1,'refund after the window');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000006'::uuid) @> '{"tier":"none"}'$$,1,'...does not reopen the window');
select t_su(); select t_count($$select 1 from trainer_trials where user_id='d4000000-0000-4000-8000-000000000006' and ended_at is not null$$,1,'ended_at stays stamped');
select t_err($$update trainer_settings set trial_max_messages = 51$$,'settings: max messages capped at 50');
select t_err($$update trainer_settings set trial_window_hours = 169$$,'settings: window capped at 168h');
select t_err($$insert into trainer_settings(id) values (2)$$,'settings: single row');
-- clients
select t_sess('d4000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-0000000005ff');
select t_count($$select 1 where my_trainer_access() @> '{"tier":"none"}'$$,1,'my_trainer_access works WITHOUT a trusted session');
select t_count($$select 1 where not (my_trainer_access() ?| array['provider_customer_token','provider_card_token','user_id'])$$,1,'my_trainer_access exposes no tokens');
select t_err($$select trainer_access(auth.uid())$$,'member cannot call trainer_access');
select t_err($$select trainer_trial_consume(auth.uid(), gen_random_uuid())$$,'member cannot call trainer_trial_consume');
select t_err($$select trainer_trial_refund(auth.uid())$$,'member cannot call trainer_trial_refund');
select t_err($$select * from trainer_trials$$,'member cannot read trials');
select t_err($$update trainer_trials set messages_used = 0$$,'member cannot reset the trial');
select t_err($$delete from trainer_trials$$,'member cannot delete the trial');
select t_err($$select * from trainer_settings$$,'member cannot read trial settings');
select t_anon();
select t_err($$select my_trainer_access()$$,'anon cannot call my_trainer_access');
select t_err($$select trainer_access(gen_random_uuid())$$,'anon cannot call trainer_access');
select t_err($$select trainer_trial_consume(gen_random_uuid(), gen_random_uuid())$$,'anon cannot call trainer_trial_consume');
select t_err($$select trainer_trial_refund(gen_random_uuid())$$,'anon cannot call trainer_trial_refund');

-- ================= F. subscriptions
select t_su(); drop table if exists t_snap; create table t_snap as select * from credit_ledger; grant all on t_snap to public;
select t_srv();
select t_ok($$insert into t_ids select 'sub1', subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'essential', now() + interval '30 days', true, 'act-essential-01')::text$$,'activate essential for user 5 (trial used up)');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"subscriber","plan_key":"essential","nutrition":false,"auto_renew":true}'$$,1,'essential: subscriber WITHOUT nutrition');
select t_count($$select 1 where subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'essential', now() + interval '30 days', true, 'act-essential-01')::text = (select v from t_ids where k='sub1')$$,1,'same idempotency key => same subscription id');
select t_su();
select t_count($$select 1 from subscriptions where user_id='d4000000-0000-4000-8000-000000000005'$$,1,'replay created no second row');
select t_count($$select 1 from credit_ledger where user_id='d4000000-0000-4000-8000-000000000005' and source='subscription' and entry_type='grant' and amount=10000 and idempotency_key='act-essential-01'$$,1,'monthly credits granted exactly once (10000)');
select t_srv();
select t_ok($$select subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'pro', now() + interval '30 days', true, 'act-pro-000001')$$,'upgrade to pro');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"subscriber","plan_key":"pro","nutrition":true}'$$,1,'pro: nutrition included');
select t_ok($$select subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'elite', now() + interval '30 days', false, 'act-elite-0001')$$,'elite');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"plan_key":"elite","nutrition":true,"auto_renew":false}'$$,1,'elite: nutrition included');
select t_ok($$select subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'vip', now() + interval '30 days', true, 'act-vip-000001')$$,'vip (monthly_credits is null)');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"plan_key":"vip","nutrition":true}'$$,1,'vip: nutrition included');
select t_err($$select subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'gold', now() + interval '30 days', true, 'act-gold-00001')$$,'unknown plan refused');
select t_err($$select subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'pro', now() - interval '1 day', true, 'act-past-00001')$$,'period end in the past refused');
select t_err($$select subscription_activate(gen_random_uuid(), 'pro', now() + interval '30 days', true, 'act-nouser-001')$$,'unknown user refused');
select t_err($$select subscription_activate('d4000000-0000-4000-8000-000000000005'::uuid, 'pro', now() + interval '30 days', true, 'short')$$,'short idempotency key refused');
select t_err($$select * from subscriptions$$,'service_role cannot read subscriptions directly');
select t_err($$insert into subscriptions(user_id, plan_key, status, current_period_end) values ('d4000000-0000-4000-8000-000000000006', 'vip', 'active', now() + interval '1 year')$$,'service_role cannot insert subscriptions directly');
select t_err($$select cancel_auto_renewal()$$,'service_role cannot call cancel_auto_renewal');
select t_su();
select t_count($$select 1 from subscriptions where user_id='d4000000-0000-4000-8000-000000000005'$$,4,'four subscription rows in history');
select t_count($$select 1 from subscriptions where user_id='d4000000-0000-4000-8000-000000000005' and status='active'$$,1,'only ONE is active');
select t_count($$select 1 from subscriptions where user_id='d4000000-0000-4000-8000-000000000005' and status='expired' and not auto_renew$$,3,'the replaced ones are expired');
select t_err($$insert into subscriptions(user_id, plan_key, status, current_period_end) values ('d4000000-0000-4000-8000-000000000005', 'pro', 'active', now() + interval '1 day')$$,'a second active row is impossible (partial unique index)');
select t_count($$select 1 from credit_ledger where user_id='d4000000-0000-4000-8000-000000000005' and source='subscription'$$,3,'three grants (essential, pro, elite); vip grants nothing');
select t_count($$select 1 where (select sum(amount) from credit_ledger where user_id='d4000000-0000-4000-8000-000000000005' and source='subscription') = 10000 + 25000 + 55000$$,1,'grant amounts follow plans.monthly_credits');
select t_count($$select 1 from security_events where user_id='d4000000-0000-4000-8000-000000000005' and event='subscription.activated'$$,4,'activations recorded');
-- cancel auto renewal: trusted session only, access continues
select t_srv(); select t_count($$select 1 where t_trust('d4000000-0000-4000-8000-000000000005', repeat('e',64), 'd4000000-0000-4000-8000-0000000005a1')$$,1,'user 5 verifies a device');
select t_sess('d4000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-0000000005ff');
select t_err($$select cancel_auto_renewal()$$,'cancel_auto_renewal refused on an UNTRUSTED session');
select t_count($$select 1 from subscriptions$$,0,'untrusted session reads no subscriptions');
select t_count($$select 1 where my_trainer_access() @> '{"tier":"subscriber","plan_key":"vip","auto_renew":true}'$$,1,'...but my_trainer_access still shows the tier');
select t_sess('d4000000-0000-4000-8000-000000000005', 'd4000000-0000-4000-8000-0000000005a1');
select t_count($$select 1 from subscriptions$$,4,'trusted owner reads own subscriptions');
select t_count($$select id, user_id, plan_key, status, current_period_start, current_period_end, auto_renew, provider, created_at, updated_at from subscriptions where status='active'$$,1,'non-token columns are readable');
select t_err($$select provider_customer_token from subscriptions$$,'provider_customer_token is unreadable');
select t_err($$select provider_card_token from subscriptions$$,'provider_card_token is unreadable');
select t_err($$select * from subscriptions$$,'select * (would include tokens) is refused');
select t_err($$update subscriptions set current_period_end = now() + interval '10 years'$$,'member cannot extend a subscription');
select t_err($$insert into subscriptions(user_id, plan_key, status, current_period_end) values (auth.uid(), 'vip', 'active', now() + interval '1 year')$$,'member cannot insert a subscription');
select t_err($$delete from subscriptions$$,'member cannot delete subscriptions');
select t_err($$select subscription_activate(auth.uid(), 'vip', now() + interval '1 year', true, 'act-self-00001')$$,'member cannot call subscription_activate');
select t_err($$select subscriptions_expire_due()$$,'member cannot call subscriptions_expire_due');
select t_count($$select 1 where cancel_auto_renewal()$$,1,'trusted member cancels auto renewal');
select t_count($$select 1 where my_trainer_access() @> '{"tier":"subscriber","plan_key":"vip","auto_renew":false,"nutrition":true}'$$,1,'access CONTINUES after cancelling (until period end)');
select t_count($$select 1 where not cancel_auto_renewal()$$,1,'cancelling again is a no-op (false)');
select t_sess('d4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-0000000002a1');
select t_count($$select id from subscriptions$$,0,'another trusted user sees no subscriptions of user 5');
select t_count($$select 1 where not cancel_auto_renewal()$$,1,'cancel without a subscription => false');
select t_anon();
select t_err($$select id from subscriptions$$,'anon cannot read subscriptions');
select t_err($$select subscription_activate(gen_random_uuid(), 'pro', now() + interval '30 days', true, 'act-anon-00001')$$,'anon cannot call subscription_activate');
select t_err($$select cancel_auto_renewal()$$,'anon cannot call cancel_auto_renewal');
select t_err($$select subscriptions_expire_due()$$,'anon cannot call subscriptions_expire_due');
-- expiry
select t_su();
select t_count($$select 1 from security_events where user_id='d4000000-0000-4000-8000-000000000005' and event='subscription.auto_renew_cancelled'$$,1,'cancellation recorded');
drop table if exists t_snap2; create table t_snap2 as select * from credit_ledger; grant all on t_snap2 to public;
update subscriptions set current_period_end = now() - interval '1 minute' where user_id='d4000000-0000-4000-8000-000000000005' and status='active';
select t_srv();
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"none","nutrition":false,"plan_key":null}'$$,1,'period over => no access even before the sweep (trial already used)');
select t_count($$select 1 where subscriptions_expire_due() = 1$$,1,'expire sweep marks exactly one row');
select t_count($$select 1 where subscriptions_expire_due() = 0$$,1,'sweep is idempotent');
select t_su();
select t_count($$select 1 from subscriptions where user_id='d4000000-0000-4000-8000-000000000005' and status='active'$$,0,'no active subscription left');
select t_count($$(select * from credit_ledger except select * from t_snap2) union all (select * from t_snap2 except select * from credit_ledger)$$,0,'expiry did NOT change the credit ledger');
select t_count($$select * from t_snap except select * from credit_ledger$$,0,'every ledger row that existed before the subscription tests is still there, unchanged');
-- a subscriber who never used the trial keeps it for later
select t_srv();
select t_ok($$select subscription_activate('d4000000-0000-4000-8000-000000000007'::uuid, 'pro', now() + interval '30 days', true, 'act-u7-pro-001')$$,'user 7 subscribes without ever using the trial');
select t_count($$select 1 where trainer_access('d4000000-0000-4000-8000-000000000007'::uuid) @> '{"tier":"subscriber","trial":{"started":false,"available":true}}'$$,1,'subscriber tier wins; trial untouched');
select t_su(); select t_count($$select 1 from trainer_trials where user_id='d4000000-0000-4000-8000-000000000007'$$,0,'no trial row was created by subscribing');
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
