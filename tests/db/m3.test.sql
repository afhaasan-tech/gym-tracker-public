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

create or replace function t_u(u uuid) returns void language plpgsql as $$ begin insert into auth.users(id,email,email_confirmed_at) values (u, u::text||'@m3.test', now()); end $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;
-- claims for a given session (session_id may differ from the user id)
create or replace function t_sess(u uuid, s uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('session_id', s, 'sub', u, 'role','authenticated','aal','aal1')::text, false); set role authenticated; end $$;
create or replace function t_owner(step boolean, aal text default 'aal2') returns void language plpgsql as $$ begin reset role;
  perform set_config('request.jwt.claims', json_build_object('session_id', 'a0000000-0000-4000-8000-00000000000a', 'sub', 'a0000000-0000-4000-8000-00000000000a', 'role','authenticated','aal', aal,
     'amr', case when step then json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint - 30)) else json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint - 7200)) end)::text, false); set role authenticated; end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;
select t_su(); select t_u('c2000000-0000-4000-8000-000000000001'), t_u('c2000000-0000-4000-8000-000000000002'), t_u('c2000000-0000-4000-8000-000000000003');
drop table if exists t_ids; create table t_ids(k text primary key, v text); grant all on t_ids to public;

-- ================= A. trusted devices, 6-digit challenge, single active session
select t_srv();
select t_count($$select 1 where device_status('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), gen_random_uuid()) = 'challenge_required'$$,1,'unknown device => challenge required');
select t_err($$select device_challenge_create('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), '12345')$$,'code must be exactly 6 digits');
select t_err($$select device_challenge_create('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), 'abcdef')$$,'code must be numeric');
select t_ok($$insert into t_ids select 'c1', device_challenge_create('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), '123456')::text$$,'challenge created');
select t_su();
select t_count($$select 1 from device_challenges where code_hash is not null and encode(code_hash,'escape') !~ '123456'$$,1,'only a keyed hash of the code is stored (no plaintext)');
select t_srv();
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), '000000', gen_random_uuid(), 'x') = false$$,1,'wrong code is refused');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000001'::uuid, repeat('b',64), '123456', gen_random_uuid(), 'x') = false$$,1,'right code from ANOTHER device is refused');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('a',64), '123456', gen_random_uuid(), 'x') = false$$,1,'right code for ANOTHER user is refused');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), '123456', 'c2000000-0000-4000-8000-000000000001', 'iPhone Safari') = true$$,1,'correct code trusts the device and activates the session');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), '123456', gen_random_uuid(), 'x') = false$$,1,'a used code cannot be replayed');
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001');
select t_count($$select 1 where is_trusted_session()$$,1,'the verified session is trusted');
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000ff');
select t_count($$select 1 where is_trusted_session()$$,0,'any other session of the same user is NOT trusted');
select t_srv();
select t_count($$select 1 where device_status('c2000000-0000-4000-8000-000000000001'::uuid, repeat('a',64), 'c2000000-0000-4000-8000-0000000000ee') = 'trusted'$$,1,'known device => trusted, new session becomes the only active one');
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000ee');
select t_count($$select 1 where is_trusted_session()$$,1,'the new session is trusted');
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001');
select t_count($$select 1 where is_trusted_session()$$,0,'the OLD session lost trust immediately (single active session)');
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000ee');
select t_count($$select 1 from trusted_devices where label is null or label='iPhone Safari'$$,1,'member sees own device list');
select t_err($$select device_status(auth.uid(), repeat('a',64), gen_random_uuid())$$,'member cannot call device_status');
select t_err($$select device_challenge_verify(auth.uid(), repeat('a',64), '123456', gen_random_uuid(), 'x')$$,'member cannot call device_challenge_verify');
select t_err($$select device_code_hash(gen_random_uuid(), '123456')$$,'member cannot compute code hashes');
select t_err($$select value from internal_secrets$$,'nobody reads the pepper');
select t_err($$select * from device_challenges$$,'member cannot read challenges');
select t_err($$select * from user_session_state$$,'member cannot read session state');
select t_err($$insert into trusted_devices(user_id,device_hash) values (auth.uid(), repeat('z',64))$$,'member cannot add a trusted device');
select t_sess('c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002');
select t_count($$select 1 from trusted_devices$$,0,'another user sees none of those devices');
-- brute force: 5 wrong guesses burn the challenge
select t_srv();
select t_ok($$insert into t_ids select 'c2', device_challenge_create('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '654321')::text$$,'challenge for user 2');
select t_ok($$select device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '000001', gen_random_uuid(), 'x'), device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '000002', gen_random_uuid(), 'x'), device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '000003', gen_random_uuid(), 'x'), device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '000004', gen_random_uuid(), 'x'), device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '000005', gen_random_uuid(), 'x')$$,'five wrong guesses');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '654321', 'c2000000-0000-4000-8000-000000000002', 'x') = false$$,1,'after 5 failures even the CORRECT code no longer works');
-- expiry and resend invalidation
select t_ok($$insert into t_ids select 'c3', device_challenge_create('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '111111', 60)::text$$,'new challenge');
select t_su(); update device_challenges set expires_at = now() - interval '1 second' where id = (select v::uuid from t_ids where k='c3'); select t_srv();
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '111111', 'c2000000-0000-4000-8000-000000000002', 'x') = false$$,1,'an expired code is refused');
select t_ok($$insert into t_ids select 'c4', device_challenge_create('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '222222')::text$$,'resend: new code');
select t_ok($$insert into t_ids select 'c5', device_challenge_create('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '333333')::text$$,'resend again');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '222222', 'c2000000-0000-4000-8000-000000000002', 'x') = false$$,1,'the previous code is invalid after a resend');
select t_count($$select 1 where device_challenge_verify('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '333333', 'c2000000-0000-4000-8000-000000000002', 'x') = true$$,1,'the latest code works');
select t_ok($$select device_challenge_create('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '555555')$$,'5th code within the hour is still allowed');
select t_count($$select 1 where device_challenge_create('c2000000-0000-4000-8000-000000000002'::uuid, repeat('c',64), '444444') is null$$,1,'6th code within an hour is refused (NULL) and logged');
select t_su(); insert into t_ids select 'dev2', id::text from trusted_devices where user_id='c2000000-0000-4000-8000-000000000002'; select t_srv();
select t_ok($$select device_revoke('c2000000-0000-4000-8000-000000000002'::uuid, (select v::uuid from t_ids where k='dev2'))$$,'revoke device');
select t_sess('c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-000000000002');
select t_count($$select 1 where is_trusted_session()$$,0,'revoking the device ends the trusted session');
select t_su();
select t_count($$select 1 where (select count(distinct event) from security_events where event in ('device.trusted','device.verify_failed','device.challenge_burned','device.revoked','device.challenge_rate_limited')) = 5$$,1,'security events are recorded (trusted/failed/burned/revoked/rate-limited)');
select t_err($$update security_events set event='x'$$,'security events are append-only (update)');
select t_err($$truncate security_events$$,'security events are append-only (truncate)');

-- ================= B. consent + private data
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000ee');
select t_err($$insert into member_health_profile(user_id, allergies) values (auth.uid(), array['peanut'])$$,'health data is refused without explicit consent (PC010)');
select t_ok($$select consent_set('health_data_storage', true, 'v1')$$,'grant health consent');
select t_ok($$insert into member_health_profile(user_id, allergies, conditions) values (auth.uid(), array['peanut'], 'asthma')$$,'health data accepted after consent');
select t_ok($$insert into member_preferences(user_id, goals, experience, coach_persona, coach_name, coach_tone, coach_language) values (auth.uid(), array['strength'], 'beginner', 'sarah', 'سارة', 'playful', 'ar')$$,'preferences saved (persona/name/tone/language)');
select t_err($$insert into member_preferences(user_id, coach_persona) values ('c2000000-0000-4000-8000-000000000002','rashid')$$,'cannot write another member preferences');
select t_err($$update member_preferences set coach_persona='bob'$$,'invalid persona rejected');
select t_err($$update member_preferences set experience='god'$$,'invalid experience rejected');
select t_err($$update member_preferences set appearance = jsonb_build_object('x', repeat('a', 3000))$$,'oversized appearance rejected');
select t_count($$select 1 from consents where purpose='health_data_storage' and granted$$,1,'consent history visible to the owner of the data');
select t_ok($$select consent_set('health_data_storage', false, 'v1')$$,'withdraw health consent');
select t_count($$select 1 from member_health_profile$$,0,'withdrawing consent ERASES the stored health profile');
select t_count($$select 1 from consents where purpose='health_data_storage'$$,2,'consent history is append-only (grant + withdrawal)');
select t_err($$insert into member_health_profile(user_id, conditions) values (auth.uid(), 'x')$$,'health data refused again after withdrawal (no consent)');
select t_count($$select 1 where (my_data_export() -> 'preferences' ->> 'coach_persona') = 'sarah'$$,1,'export contains own preferences');
select t_count($$select 1 where jsonb_array_length(my_data_export() -> 'consents') = 2$$,1,'export contains consent history');
select t_sess('c2000000-0000-4000-8000-000000000002', 'c2000000-0000-4000-8000-0000000000dd');
select t_err($$select consent_set('analytics', true, 'v1')$$,'untrusted session cannot change consents');
select t_err($$select my_data_export()$$,'untrusted session cannot export');
select t_count($$select 1 from member_preferences$$,0,'untrusted session sees no preferences');
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000ee');
select t_err($$select consent_set('not_a_purpose', true, 'v1')$$,'unknown consent purpose rejected');
select t_anon();
select t_err($$select * from member_preferences$$,'anonymous cannot read preferences');
select t_err($$select * from consents$$,'anonymous cannot read consents');

-- ================= C. owner configuration (prices, limits, flags) with step-up + audit
select t_su(); delete from admins where false;
select t_owner(false, 'aal1');
select t_err($$select owner_set_operation_cost('quick_question', 60, true)$$,'owner without MFA (aal1) is refused');
select t_owner(false);
select t_err($$select owner_set_operation_cost('quick_question', 60, true)$$,'owner with MFA but no RECENT verification is refused (step-up PO001)');
select t_count($$select 1 where (owner_get_commerce_config() ->> 'step_up_ok')::boolean = false$$,1,'config readable with MFA; shows step-up needed');
select t_owner(true);
select t_ok($$select owner_set_operation_cost('quick_question', 60, true)$$,'owner with fresh step-up changes a price');
select t_err($$select owner_set_operation_cost('quick_question', -1, true)$$,'negative price rejected');
select t_err($$select owner_set_operation_cost('quick_question', 5000000, true)$$,'absurd price rejected');
select t_err($$select owner_set_operation_cost('nope', 10, true)$$,'unknown operation rejected');
select t_ok($$select owner_set_credit_settings(3000, 15)$$,'trial and reservation TTL are configurable');
select t_err($$select owner_set_ai_budget(true, 0, 0)$$,'live AI cannot be enabled without caps');
select t_err($$select owner_set_ai_budget(false, 2000000000, 100)$$,'budget above the 1,000 USD hard ceiling rejected');
select t_err($$select owner_set_flag('live_ai_enabled', true)$$,'live_ai flag refused while the budget gate is off');
select t_ok($$select owner_set_ai_budget(true, 5000000, 50000)$$,'budget gate: live on, $5 monthly, $0.05 per call');
select t_ok($$select owner_set_flag('live_ai_enabled', true)$$,'live_ai flag now allowed (high risk, step-up ok)');
select t_ok($$select owner_set_flag('ai_coach_enabled', true)$$,'ordinary flag');
select t_ok($$select owner_upsert_plan('vip','VIP','VIP',41.5,null,'{"daily_quick":250}'::jsonb,true,true,4)$$,'plan price and fair-use limits are configurable');
select t_count($$select 1 where (public_plans() -> 3 ->> 'provisional')::boolean$$,1,'plans remain flagged provisional');
select t_ok($$select owner_set_ai_budget(false, 0, 0)$$,'budget gate switched off again');
select t_ok($$select owner_set_flag('live_ai_enabled', false)$$,'live flag off');
select t_count($$select 1 where (owner_ai_usage_summary(30) ? 'provider_cost_usd') and not (owner_ai_usage_summary(30)::text like '%request%')$$,1,'usage summary is aggregate only (no message content)');
select t_count($$select 1 where (select count(*) from owner_list_security_events(500)) >= 5$$,1,'owner can list security events');
select t_su();
select t_count($$select 1 from audit_log where action in ('ai_operation.update','credit_settings.update','ai_budget.update','flag.set','plan.upsert')$$,8,'every configuration change was audited');
select t_count($$select 1 from ai_operations where key='quick_question' and credits=60$$,1,'the new price is stored');
select t_srv();
select t_count($$select 1 from credit_reserve('c2000000-0000-4000-8000-000000000001'::uuid,'quick_question','m3-price-0001') where o_credits=60$$,1,'the AI backend charges the owner-configured price');
select t_su(); update ai_operations set credits=50 where key='quick_question'; update credit_settings set trial_credits=2500, reservation_ttl_minutes=10;
select t_sess('c2000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-0000000000ee');
select t_err($$select owner_set_operation_cost('quick_question', 1, true)$$,'a normal member cannot configure prices');
select t_err($$select owner_get_commerce_config()$$,'a normal member cannot read the commerce config');
select t_err($$select owner_credit_adjust(auth.uid(),'promo',100000,'give myself credits now')$$,'a normal member cannot adjust credits');
select t_err($$select owner_list_security_events(5)$$,'a normal member cannot read security events');
select t_count($$select 1 where public_plans() is not null$$,1,'members may read the (provisional) plan list');
select t_count($$select 1 where public_flags() ? 'live_ai_enabled'$$,0,'high-risk flags are not public');
select t_owner(true);
select t_err($$select owner_credit_adjust('c2000000-0000-4000-8000-000000000003', 'promo', 500, 'short')$$,'credit adjustment needs a real reason');
select t_ok($$select owner_credit_adjust('c2000000-0000-4000-8000-000000000003', 'promo', 500, 'goodwill credit for a failed request')$$,'owner adds credits (step-up + reason)');
select t_err($$select owner_credit_adjust('c2000000-0000-4000-8000-000000000003', 'promo', -999999, 'remove too many credits now')$$,'adjustment cannot push a balance negative');
select t_ok($$select owner_credit_adjust('c2000000-0000-4000-8000-000000000003', 'promo', -100, 'correct an earlier goodwill credit')$$,'owner removes credits');
select t_su();
select t_count($$select 1 where (select sum(amount) from credit_ledger where user_id='c2000000-0000-4000-8000-000000000003' and entry_type='adjust') = 400$$,1,'adjustments are in the ledger (+500, -100)');
select t_count($$select 1 from audit_log where action='credit.adjust'$$,2,'credit adjustments are audited with reasons');

-- ================= D. M1/M2 private tables now need the trusted session
select t_sess('c2000000-0000-4000-8000-000000000003', 'c2000000-0000-4000-8000-0000000000aa');
select t_count($$select 1 from credit_ledger$$,0,'untrusted session sees no ledger rows');
select t_err($$select my_credit_balance()$$,'untrusted session cannot read the balance');
select t_count($$select 1 from ai_jobs$$,0,'untrusted session sees no AI conversations');
select t_su();
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
