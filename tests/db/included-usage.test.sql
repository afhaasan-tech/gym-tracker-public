\set ON_ERROR_STOP off
-- Included usage (20261124): Monthly / Yearly subscribers get NO automatic VORA Coins; their AI use is included per plan and counted
-- per day by a server-side atomic counter. Covers: the catalogue, no grant on activation / purchase, billing in trainer_access,
-- the counter (caps, media, refund, day rollover, who is refused), privileges, the owner's configuration (step-up + audit), and
-- that subscribers on a plan with a coin allocation are unaffected. Parallel behaviour: included-usage-concurrency.sh.
drop table if exists t_results cascade;
create table t_results(n serial, ok boolean, label text);
create or replace function t_anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); set role anon; end $$;
create or replace function t_su() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); end $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;
create or replace function t_mem(u uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('session_id', u, 'sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, false); set role authenticated; end $$;
create or replace function t_owner(step boolean, aal text default 'aal2') returns void language plpgsql as $$ begin reset role;
  perform set_config('request.jwt.claims', json_build_object('session_id', 'a0000000-0000-4000-8000-00000000000a', 'sub', 'a0000000-0000-4000-8000-00000000000a', 'role','authenticated','aal', aal,
     'amr', case when step then json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint - 30)) else json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint - 7200)) end)::text, false); set role authenticated; end $$;
create or replace function t_err(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected an error, got none)');
  exception when others then insert into t_results(ok,label) values (true, label||' -> '||left(sqlerrm,70)); end; end $$;
create or replace function t_code(q text, code text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected '||code||', got no error)');
  exception when others then insert into t_results(ok,label) values (sqlstate = code, label||' -> '||sqlstate||' '||left(sqlerrm,60)); end; end $$;
create or replace function t_ok(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (true,label);
  exception when others then insert into t_results(ok,label) values (false, label||' (unexpected error: '||left(sqlerrm,90)||')'); end; end $$;
create or replace function t_count(q text, expected int, label text) returns void language plpgsql as $$
declare n int; begin begin execute 'select count(*) from ('||q||') s' into n; insert into t_results(ok,label) values (n=expected, label||' [got '||n||', want '||expected||']');
  exception when others then insert into t_results(ok,label) values (false, label||' (error: '||left(sqlerrm,90)||')'); end; end $$;
-- a paid order, as the payment webhook would produce it
create or replace function t_buy(u uuid, kind text, item text, idem text) returns uuid language plpgsql as $$
declare o jsonb; begin
  o := public.purchase_create(u, kind, item, idem);
  perform public.purchase_apply((o->>'id')::uuid, 'CAPTURED', (o->>'amount_kwd')::numeric, 'KWD', 'trk-'||idem, '{}'::jsonb, 'webhook');
  return (o->>'id')::uuid;
end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;

-- users: 1 = monthly (activated directly), 2 = monthly (bought), 3 = yearly (bought), 4 = trial never used, 5 = coins only,
--        6 = old "pro" plan (coin allocation), 7 = lapsed monthly, 8 = nothing at all (trial over, no coins), 9 = plan without included AI
select t_su();
delete from auth.users where email like '%@inc.test';
insert into auth.users(id,email,email_confirmed_at) select ('a9000000-0000-4000-8000-00000000000'||i)::uuid, 'i'||i||'@inc.test', now() from generate_series(1,9) i;
insert into trainer_trials(user_id, conversation_id, ended_at) select ('a9000000-0000-4000-8000-00000000000'||i)::uuid, gen_random_uuid(), now() from generate_series(5,8) i;
update plans set ai_daily_requests = 40, ai_daily_media = 10 where key in ('monthly','yearly');     -- the migrated defaults, whatever ran before

-- ================= A. catalogue
select t_count($$select 1 from plans where key in ('monthly','yearly') and enabled and monthly_credits is null and ai_daily_requests = 40 and ai_daily_media = 10$$,2,'monthly + yearly: NO coin allocation, included usage 40 requests / 10 media per day (provisional defaults)');
select t_count($$select 1 from plans where key in ('essential','pro','elite') and monthly_credits in (10000,25000,55000)$$,3,'the old plans keep their coin allocation (rows untouched)');
select t_count($$select 1 from information_schema.columns where table_schema='public' and table_name='plans' and column_name='monthly_credits'$$,1,'plans.monthly_credits is kept, so an allocation can be configured later');
select t_anon();
select t_count($$select 1 from jsonb_array_elements(public_plans()) e where e @> '{"key":"monthly","period_days":30,"ai_daily_requests":40,"ai_daily_media":10,"includes_nutrition":true,"provisional":true}' and e->'monthly_credits' = 'null'::jsonb and (e->>'price_kwd')::numeric = 7.000$$,1,'public_plans(): monthly with the two caps and monthly_credits null');
select t_count($$select 1 from jsonb_array_elements(public_plans()) e where e @> '{"key":"yearly","period_days":365,"ai_daily_requests":40,"ai_daily_media":10}' and e->'monthly_credits' = 'null'::jsonb and (e->>'price_kwd')::numeric = 70.000$$,1,'public_plans(): yearly with the two caps and monthly_credits null');
select t_count($$select 1 from jsonb_array_elements(public_plans()) e where e ?& array['key','name_ar','name_en','price_kwd','monthly_credits','provisional','pause_eligible','includes_nutrition','period_days','ai_daily_requests','ai_daily_media']$$,2,'public_plans(): every earlier key is still there');

-- ================= B. no coins are granted on activation or purchase of monthly / yearly
select t_su(); drop table if exists t_ledger0; create table t_ledger0 as select count(*) n from credit_ledger;
select t_srv();
select t_ok($$select subscription_activate('a9000000-0000-4000-8000-000000000001'::uuid, 'monthly', now() + interval '30 days', false, 'inc-act-month-1')$$,'monthly activated directly');
select t_ok($$select subscription_activate('a9000000-0000-4000-8000-000000000001'::uuid, 'monthly', now() + interval '30 days', false, 'inc-act-month-1')$$,'replayed activation');
select t_ok($$select t_buy('a9000000-0000-4000-8000-000000000002','subscription','monthly','inc-buy-month-1')$$,'monthly bought (paid order fulfilled)');
select t_ok($$select t_buy('a9000000-0000-4000-8000-000000000003','subscription','yearly','inc-buy-year-01')$$,'yearly bought (paid order fulfilled)');
select t_ok($$select t_buy('a9000000-0000-4000-8000-000000000007','subscription','monthly','inc-buy-lapsed1')$$,'user 7 bought a month (will lapse)');
select t_su();
select t_count($$select 1 from credit_ledger where user_id in ('a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000003','a9000000-0000-4000-8000-000000000007') and (source = 'subscription' or entry_type = 'grant' and idempotency_key like any (array['inc-%','order:%']))$$,0,'NO subscription coins for the four monthly / yearly subscribers (activation and purchase)');
select t_count($$select 1 where (select count(*) from credit_ledger) = (select n from t_ledger0)$$,1,'the ledger did not grow: nothing was distributed automatically');
select t_count($$select 1 where public.credit_source_balance('a9000000-0000-4000-8000-000000000002', 'subscription') = 0 and public.credit_source_balance('a9000000-0000-4000-8000-000000000003', 'subscription') = 0 and public.credit_source_balance('a9000000-0000-4000-8000-000000000003', 'purchased') = 0$$,1,'no subscription or purchased balance appeared (yearly: not 120,000, not anything)');
select t_count($$select 1 from subscriptions where user_id in ('a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000003') and status='active'$$,3,'the three subscriptions are active all the same');
select t_count($$select 1 from purchase_orders where user_id in ('a9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000003') and status='paid' and fulfilled_at is not null and coins is null$$,2,'both orders are paid and fulfilled');
update subscriptions set current_period_end = now() - interval '1 day' where user_id = 'a9000000-0000-4000-8000-000000000007';
-- a coin pack still grants coins (the purchase flow itself is unchanged)
select t_srv(); select t_ok($$select t_buy('a9000000-0000-4000-8000-000000000005','coins','starter','inc-buy-coins-1')$$,'coins member buys the Starter pack');
select t_su(); select t_count($$select 1 from credit_ledger where user_id='a9000000-0000-4000-8000-000000000005' and source='purchased' and amount=500$$,1,'a coin pack still grants its coins');
-- an allocation stays CONFIGURABLE: on a plan that has one, activation grants it once (old "pro": 25,000), exactly as before
update plans set enabled = true where key = 'pro';
select t_srv(); select t_ok($$select subscription_activate('a9000000-0000-4000-8000-000000000006'::uuid, 'pro', now() + interval '30 days', false, 'inc-act-pro-001')$$,'old pro plan activated');
select t_su(); update plans set enabled = false where key = 'pro';
select t_count($$select 1 from credit_ledger where user_id='a9000000-0000-4000-8000-000000000006' and source='subscription' and entry_type='grant' and amount=25000$$,1,'a plan WITH an allocation still grants it once (unchanged rule)');
-- user 9: a plan with neither coins nor included AI
insert into plans(key, name_ar, name_en, price_kwd, monthly_credits, enabled, ai_daily_requests, ai_daily_media) values ('zz_noai', 'بدون', 'No AI', 1.000, null, true, null, null) on conflict (key) do update set monthly_credits = null, ai_daily_requests = null, ai_daily_media = null, enabled = true;
select t_srv(); select t_ok($$select subscription_activate('a9000000-0000-4000-8000-000000000009'::uuid, 'zz_noai', now() + interval '30 days', false, 'inc-act-noai-01')$$,'plan without included AI activated');
select t_su(); update plans set enabled = false where key = 'zz_noai';

-- ================= C. trainer_access: billing + caps (and every earlier key)
select t_srv();
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000001') @> '{"tier":"subscriber","plan_key":"monthly","billing":"included","daily_requests":40,"daily_media":10,"nutrition":true,"library":true,"period":"monthly","auto_renew":false}'$$,1,'monthly: billing included, 40 / 10');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000003') @> '{"tier":"subscriber","plan_key":"yearly","billing":"included","daily_requests":40,"daily_media":10,"period":"yearly"}'$$,1,'yearly: billing included, 40 / 10');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000006') @> '{"tier":"subscriber","plan_key":"pro","billing":"coins","daily_requests":null,"daily_media":null,"library":true}'$$,1,'old pro plan (coin allocation): billing coins, no daily caps');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000009') @> '{"tier":"subscriber","plan_key":"zz_noai","billing":"coins","daily_requests":null}'$$,1,'a plan without included AI: billing coins');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000005') @> '{"tier":"coins","billing":"coins","daily_requests":null,"purchased_coins":500}'$$,1,'coins tier: billing coins');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000004') @> '{"tier":"trial","billing":null,"daily_requests":null,"daily_media":null}'$$,1,'trial: billing null');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000008') @> '{"tier":"none","billing":null}'$$,1,'none: billing null');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000007') @> '{"tier":"none","billing":null,"library":false}'$$,1,'lapsed monthly: no included usage any more');
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000001') ?& array['tier','purchased_coins','plan_key','nutrition','library','period','period_end','auto_renew','trial','billing','daily_requests','daily_media']$$,1,'trainer_access: every earlier key + the three new ones');

-- ================= D. privileges: the counter is server-side only
select t_anon();
select t_err($$select trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false)$$,'anon cannot call trainer_usage_consume');
select t_err($$select trainer_usage_refund('a9000000-0000-4000-8000-000000000001', false)$$,'anon cannot call trainer_usage_refund');
select t_err($$select my_trainer_usage()$$,'anon cannot call my_trainer_usage');
select t_err($$select * from trainer_usage$$,'anon cannot read trainer_usage');
select t_err($$select owner_set_plan_usage('monthly', 1000, 1000)$$,'anon cannot call owner_set_plan_usage');
select t_mem('a9000000-0000-4000-8000-000000000001');
select t_err($$select trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false)$$,'a member cannot call trainer_usage_consume');
select t_err($$select trainer_usage_refund('a9000000-0000-4000-8000-000000000001', false)$$,'a member cannot call trainer_usage_refund (no self-refund)');
select t_err($$select * from trainer_usage$$,'a member cannot read trainer_usage');
select t_err($$insert into trainer_usage(user_id, day) values ('a9000000-0000-4000-8000-000000000001', current_date)$$,'a member cannot write trainer_usage');
select t_err($$update plans set ai_daily_requests = 100000 where key = 'monthly'$$,'a member cannot edit the plan caps');
select t_err($$select trainer_usage_purge()$$,'a member cannot call trainer_usage_purge');
select t_srv();
select t_err($$select * from trainer_usage$$,'service_role cannot read the table directly (functions only)');
select t_err($$update trainer_usage set requests = 0$$,'service_role cannot reset counters directly');
select t_err($$select my_trainer_usage()$$,'service_role cannot call my_trainer_usage');
select t_err($$select owner_set_plan_usage('monthly', 1000, 1000)$$,'service_role cannot call owner_set_plan_usage');

-- ================= E. the counter: consume, media, refund
select t_srv();
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) = '{"allowed":true,"remaining_requests":39,"remaining_media":10}'::jsonb$$,1,'first request of the day: allowed, 39 / 10 left');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', true) = '{"allowed":true,"remaining_requests":38,"remaining_media":9}'::jsonb$$,1,'a request with an attachment: one request + one media unit');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', null) @> '{"allowed":true,"remaining_requests":37,"remaining_media":9}'$$,1,'p_media null counts as no media');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and day = trainer_usage_day() and requests = 3 and media = 1$$,1,'one row for today: 3 requests, 1 media');
select t_count($$select 1 where trainer_usage_day() = (now() at time zone 'Asia/Kuwait')::date$$,1,'the day is the Kuwait calendar day');
select t_srv();
select t_count($$select 1 where trainer_usage_refund('a9000000-0000-4000-8000-000000000001', true)$$,1,'refund of a media request');
select t_count($$select 1 where trainer_usage_refund('a9000000-0000-4000-8000-000000000001', false)$$,1,'refund of a text request');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and requests = 1 and media = 0$$,1,'after two refunds: 1 request, 0 media');
select t_srv();
select t_count($$select 1 where trainer_usage_refund('a9000000-0000-4000-8000-000000000001', true)$$,1,'refund down to zero (media already 0 stays 0)');
select t_count($$select 1 where not trainer_usage_refund('a9000000-0000-4000-8000-000000000001', false)$$,1,'a refund with nothing used returns false');
select t_count($$select 1 where not trainer_usage_refund('a9000000-0000-4000-8000-000000000003', false)$$,1,'a refund for a member with no row today returns false');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and requests = 0 and media = 0$$,1,'the counter never goes below zero');
select t_srv(); select t_err($$select trainer_usage_consume(null, false)$$,'a null user is refused');

-- ================= F. caps follow the CURRENT plan; the owner edits them (super admin + step-up + audit)
select t_mem('a9000000-0000-4000-8000-000000000001');
select t_code($$select owner_set_plan_usage('monthly', 3, 1)$$,'42501','a normal member cannot edit the included usage');
select t_owner(false, 'aal1');
select t_code($$select owner_set_plan_usage('monthly', 3, 1)$$,'42501','the owner without MFA is refused');
select t_owner(false);
select t_code($$select owner_set_plan_usage('monthly', 3, 1)$$,'PO001','the owner with MFA but no RECENT verification is refused (step-up)');
select t_su(); select t_count($$select 1 from plans where key='monthly' and ai_daily_requests = 40 and ai_daily_media = 10$$,1,'refused edits changed nothing');
select t_owner(true);
select t_code($$select owner_set_plan_usage('monthly', -1, 1)$$,'22023','negative cap refused');
select t_code($$select owner_set_plan_usage('monthly', 10001, 1)$$,'22023','absurd cap refused');
select t_code($$select owner_set_plan_usage('monthly', 3, 10001)$$,'22023','absurd media cap refused');
select t_code($$select owner_set_plan_usage('no_such_plan', 3, 1)$$,'P0002','unknown plan refused');
select t_ok($$select owner_set_plan_usage('monthly', 3, 1)$$,'the owner with a fresh step-up sets monthly to 3 requests / 1 media per day');
select t_su();
select t_count($$select 1 from audit_log where action='plan.usage' and target_id='monthly' and details @> '{"old":{"ai_daily_requests":40,"ai_daily_media":10},"new":{"ai_daily_requests":3,"ai_daily_media":1}}'$$,1,'the edit is in the audit log with old and new values');
select t_count($$select 1 from plans where key='yearly' and ai_daily_requests = 40$$,1,'the other plan is untouched');
select t_owner(true);
select t_ok($$select owner_upsert_plan('monthly', 'شهري', 'Monthly', 7.000, null, '{}', false, true, 1)$$,'the existing plan function still works');
select t_su(); select t_count($$select 1 from plans where key='monthly' and ai_daily_requests = 3 and ai_daily_media = 1 and monthly_credits is null$$,1,'owner_upsert_plan does not reset the included usage');
select t_srv();
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000001') @> '{"billing":"included","daily_requests":3,"daily_media":1}'$$,1,'trainer_access shows the new caps at once');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', true) = '{"allowed":true,"remaining_requests":2,"remaining_media":0}'::jsonb$$,1,'1/3: media request allowed (the only media unit)');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', true) = '{"allowed":false,"reason":"daily_media_limit_reached","remaining_requests":2,"remaining_media":0}'::jsonb$$,1,'second media request refused: media cap reached, text still available');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and requests = 1 and media = 1$$,1,'a refused request counts nothing');
select t_srv();
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":true,"remaining_requests":1}'$$,1,'2/3');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":true,"remaining_requests":0,"remaining_media":0}'$$,1,'3/3: the last unit');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) = '{"allowed":false,"reason":"daily_limit_reached","remaining_requests":0,"remaining_media":0}'::jsonb$$,1,'4th request refused: daily_limit_reached');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', true) @> '{"allowed":false,"reason":"daily_limit_reached"}'$$,1,'and a media request too');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and requests = 3 and media = 1$$,1,'the counter stops exactly at the cap');
-- a refund frees exactly one unit
select t_srv();
select t_count($$select 1 where trainer_usage_refund('a9000000-0000-4000-8000-000000000001', false)$$,1,'refund at the cap');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":true,"remaining_requests":0}'$$,1,'the refunded unit can be used again');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":false}'$$,1,'and only that one');
-- the yearly member has her own counter and her own plan caps
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000003', false) = '{"allowed":true,"remaining_requests":39,"remaining_media":10}'::jsonb$$,1,'another member is not affected (own counter, own plan: 40 / 10)');
-- raising the cap takes effect at once for the same day
select t_owner(true); select t_ok($$select owner_set_plan_usage('monthly', 5, 1)$$,'owner raises monthly to 5 / 1');
select t_srv(); select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":true,"remaining_requests":1}'$$,1,'the raised cap applies immediately (4/5)');
-- media cap null = no media included; requests null = AI use not included (the plan is billed in coins)
select t_owner(true); select t_ok($$select owner_set_plan_usage('monthly', 5, null)$$,'owner sets media to "not included"');
select t_srv();
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000001') @> '{"billing":"included","daily_requests":5,"daily_media":0}'$$,1,'media not included => daily_media 0');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', true) @> '{"allowed":false,"reason":"daily_media_limit_reached"}'$$,1,'a media request is refused when the plan includes no media');
select t_owner(true); select t_ok($$select owner_set_plan_usage('monthly', null, null)$$,'owner switches included AI off for monthly');
select t_srv();
select t_count($$select 1 where trainer_access('a9000000-0000-4000-8000-000000000001') @> '{"tier":"subscriber","billing":"coins","daily_requests":null}'$$,1,'without included usage the subscriber is billed in coins');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":false,"reason":"not_included"}'$$,1,'and the counter refuses');
select t_owner(true); select t_ok($$select owner_set_plan_usage('monthly', 3, 1)$$,'owner restores 3 / 1 for the next checks');

-- ================= G. who is refused: only an included-billing subscriber may consume
select t_srv();
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000004', false) = '{"allowed":false,"reason":"not_included","remaining_requests":0,"remaining_media":0}'::jsonb$$,1,'trial member refused');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000005', false) @> '{"allowed":false,"reason":"not_included"}'$$,1,'coins member refused');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000006', false) @> '{"allowed":false,"reason":"not_included"}'$$,1,'subscriber on a coin-allocation plan refused (pays coins as before)');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000007', false) @> '{"allowed":false,"reason":"not_included"}'$$,1,'lapsed subscriber refused');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000008', true) @> '{"allowed":false,"reason":"not_included"}'$$,1,'member with nothing refused');
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000009', false) @> '{"allowed":false,"reason":"not_included"}'$$,1,'subscriber on a plan without included AI refused');
select t_count($$select 1 where trainer_usage_consume(gen_random_uuid(), false) @> '{"allowed":false,"reason":"not_included"}'$$,1,'unknown user refused');
select t_su(); select t_count($$select 1 from trainer_usage where user_id in ('a9000000-0000-4000-8000-000000000004','a9000000-0000-4000-8000-000000000005','a9000000-0000-4000-8000-000000000006','a9000000-0000-4000-8000-000000000007','a9000000-0000-4000-8000-000000000008','a9000000-0000-4000-8000-000000000009')$$,0,'a refusal creates no counter row');
-- old-plan subscriber: the coin flow is untouched (reserve / settle against the granted allocation)
select t_su(); drop table if exists t_bal0; create table t_bal0 as select coalesce(sum(amount),0) n from credit_ledger where user_id='a9000000-0000-4000-8000-000000000006';
select t_srv();
select t_ok($$select credit_settle((select o_reservation_id from credit_reserve('a9000000-0000-4000-8000-000000000006', 'trainer_message', 'inc-old-plan-res-1')), 'a9000000-0000-4000-8000-000000000006')$$,'old-plan subscriber reserves and settles coins as before');
select t_su(); select t_count($$select 1 where (select sum(amount) from credit_ledger where user_id='a9000000-0000-4000-8000-000000000006') = (select n from t_bal0) - (select credits from ai_operations where key='trainer_message')$$,1,'her balance was charged exactly the operation price');
select t_count($$select 1 from credit_reservations where user_id in ('a9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','a9000000-0000-4000-8000-000000000003')$$,0,'the counter never creates a coin reservation for an included subscriber');

-- ================= H. day rollover: yesterday's usage does not count today
select t_su();
update trainer_usage set day = day - 1 where user_id = 'a9000000-0000-4000-8000-000000000001';
select t_srv();
select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', true) = '{"allowed":true,"remaining_requests":2,"remaining_media":0}'::jsonb$$,1,'a new day starts with the full allowance (3 / 1)');
select t_su();
select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001'$$,2,'yesterday and today are separate rows');
select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and day = trainer_usage_day() and requests = 1 and media = 1$$,1,'today: 1 request, 1 media');
select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and day = trainer_usage_day() - 1 and requests >= 3$$,1,'yesterday is unchanged');
-- a refund only touches today
select t_srv(); select t_count($$select 1 where trainer_usage_refund('a9000000-0000-4000-8000-000000000001', true)$$,1,'refund today');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001' and day = trainer_usage_day() - 1 and requests >= 3$$,1,'the refund did not touch yesterday');
-- housekeeping
update trainer_usage set day = day - 200 where user_id = 'a9000000-0000-4000-8000-000000000001' and day < trainer_usage_day();
select t_srv(); select t_count($$select 1 where trainer_usage_purge() = 1$$,1,'purge removes rows older than 90 days');
select t_su(); select t_count($$select 1 from trainer_usage where user_id='a9000000-0000-4000-8000-000000000001'$$,1,'today''s row is kept');

-- ================= I. my_trainer_usage(): the member reads her own numbers
select t_srv(); select t_count($$select 1 where trainer_usage_consume('a9000000-0000-4000-8000-000000000001', false) @> '{"allowed":true}'$$,1,'one request today');
select t_mem('a9000000-0000-4000-8000-000000000001');
select t_count($$select 1 where my_trainer_usage() @> '{"billing":"included","included":true,"daily_requests":3,"daily_media":1,"used_requests":1,"used_media":0,"remaining_requests":2,"remaining_media":1}'$$,1,'my_trainer_usage: used / remaining for today');
select t_count($$select 1 where (my_trainer_usage()->>'resets_at')::timestamptz > now() and (my_trainer_usage()->>'resets_at')::timestamptz <= now() + interval '24 hours' and (my_trainer_usage()->>'day')::date = (now() at time zone 'Asia/Kuwait')::date$$,1,'resets at the next Kuwait midnight');
select t_mem('a9000000-0000-4000-8000-000000000003');
select t_count($$select 1 where my_trainer_usage() @> '{"included":true,"daily_requests":40,"used_requests":1,"remaining_requests":39,"remaining_media":10}'$$,1,'another member sees only her own numbers');
select t_mem('a9000000-0000-4000-8000-000000000002');
select t_count($$select 1 where my_trainer_usage() @> '{"included":true,"used_requests":0,"used_media":0,"remaining_requests":3}'$$,1,'a subscriber who has not asked anything today');
select t_mem('a9000000-0000-4000-8000-000000000005');
select t_count($$select 1 where my_trainer_usage() @> '{"billing":"coins","included":false}' and not my_trainer_usage() ? 'remaining_requests'$$,1,'coins member: not included');
select t_mem('a9000000-0000-4000-8000-000000000004');
select t_count($$select 1 where my_trainer_usage() @> '{"billing":null,"included":false}'$$,1,'trial member: not included');

-- ================= J. the global provider budget gate is untouched; routes name a current model
select t_su(); drop table if exists t_budget0; create table t_budget0 as select * from ai_budget; update ai_budget set live_calls_enabled = false;
select t_srv(); select t_count($$select 1 where ai_budget_authorize(1) = false$$,1,'gate off: no live call is authorised, whoever asks (included usage has no path around it)');
select t_su(); update ai_budget b set live_calls_enabled = o.live_calls_enabled, spent_usd_micro = o.spent_usd_micro from t_budget0 o where b.id = o.id; drop table t_budget0;
select t_count($$select 1 from ai_routes where provider = 'gemini' and model = 'gemini-2.5-flash' or fallback_provider = 'gemini' and fallback_model = 'gemini-2.5-flash'$$,0,'no route names the deprecated gemini-2.5-flash any more');
select t_count($$select 1 from ai_routes where operation_key in ('trainer_message','trainer_image') and provider = 'anthropic' and model in ('claude-haiku-5-5','claude-sonnet-5-5')$$,2,'text and image stay on Claude Haiku 5.5 / Sonnet 5.5');

-- ================= restore the catalogue for whatever runs next
select t_su();
update plans set ai_daily_requests = 40, ai_daily_media = 10, monthly_credits = null where key in ('monthly','yearly');
delete from plans where key = 'zz_noai' and not exists (select 1 from subscriptions where plan_key = 'zz_noai');
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
