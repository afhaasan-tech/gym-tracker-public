\set ON_ERROR_STOP off
-- Exercise library + monthly / yearly plans (20261121): who may read what, the new catalogue, and the period of a subscription order.
-- The catalogue is also checked read-only straight after the migrations (catalogue-as-migrated.test.sql); the suites that put the
-- old plans / packs back on sale for their own tests switch them off again when they finish.
-- It brings its own fixture muscles / exercises (ids 'zz-test-*'), so it passes with or without the content seed (20261122).
drop table if exists t_results cascade;
create table t_results(n serial, ok boolean, label text);
create or replace function t_anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); set role anon; end $$;
create or replace function t_su() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); end $$;
create or replace function t_err(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected an error, got none)');
  exception when others then insert into t_results(ok,label) values (true, label||' -> '||left(sqlerrm,70)); end; end $$;
create or replace function t_code(q text, code text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected '||code||', got no error)');
  exception when others then insert into t_results(ok,label) values (sqlstate = code, label||' -> '||sqlstate||' '||left(sqlerrm,60)); end; end $$;
-- like t_code, and the message must be exactly this one
create or replace function t_msg(q text, code text, msg text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected '||code||', got no error)');
  exception when others then insert into t_results(ok,label) values (sqlstate = code and sqlerrm = msg, label||' -> '||sqlstate||' '||left(sqlerrm,60)); end; end $$;
create or replace function t_ok(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (true,label);
  exception when others then insert into t_results(ok,label) values (false, label||' (unexpected error: '||left(sqlerrm,90)||')'); end; end $$;
create or replace function t_count(q text, expected int, label text) returns void language plpgsql as $$
declare n int; begin begin execute 'select count(*) from ('||q||') s' into n; insert into t_results(ok,label) values (n=expected, label||' [got '||n||', want '||expected||']');
  exception when others then insert into t_results(ok,label) values (false, label||' (error: '||left(sqlerrm,90)||')'); end; end $$;
drop table if exists t_ids; create table t_ids(k text primary key, v text); grant all on t_ids to public;
create or replace function t_id(key text) returns uuid language sql as $$ select v::uuid from t_ids where k = key $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;
create or replace function t_sess(u uuid, s uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('session_id', s, 'sub', u, 'role','authenticated','aal','aal1')::text, false); set role authenticated; end $$;
create or replace function t_trust(u uuid, h text, s uuid) returns boolean language plpgsql as $$ begin perform public.device_challenge_create(u, h, '123456'); return public.device_challenge_verify(u, h, '123456', s, 'dev'); end $$;
-- a paid order, as the payment webhook would produce it: returns the order id
create or replace function t_buy(u uuid, kind text, item text, idem text) returns uuid language plpgsql as $$
declare o jsonb; begin
  o := public.purchase_create(u, kind, item, idem);
  perform public.purchase_apply((o->>'id')::uuid, 'CAPTURED', (o->>'amount_kwd')::numeric, 'KWD', 'trk-'||idem, '{}'::jsonb, 'webhook');
  return (o->>'id')::uuid;
end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;

-- users: 1 = free (trial never used), 2 = coins only, 3 = lapsed subscriber, 4 = monthly, 5 = yearly, 6 = still on the old "pro" plan
select t_su();
insert into auth.users(id,email,email_confirmed_at) values
 ('f7000000-0000-4000-8000-000000000001','l1@lib.test',now()), ('f7000000-0000-4000-8000-000000000002','l2@lib.test',now()),
 ('f7000000-0000-4000-8000-000000000003','l3@lib.test',now()), ('f7000000-0000-4000-8000-000000000004','l4@lib.test',now()),
 ('f7000000-0000-4000-8000-000000000005','l5@lib.test',now()), ('f7000000-0000-4000-8000-000000000006','l6@lib.test',now());

-- ================= A. the catalogue exactly as the migrations leave it
select t_count($$select 1 from jsonb_array_elements(public_plans())$$,2,'exactly two plans are on sale');
select t_count($$select 1 from jsonb_array_elements(public_plans()) e where e @> '{"key":"monthly","name_ar":"شهري","name_en":"Monthly","period_days":30,"monthly_credits":10000,"includes_nutrition":true,"provisional":true}' and (e->>'price_kwd')::numeric = 7.000$$,1,'monthly: 30 days, nutrition, provisional placeholder price');
select t_count($$select 1 from jsonb_array_elements(public_plans()) e where e @> '{"key":"yearly","name_ar":"سنوي","name_en":"Yearly","period_days":365,"monthly_credits":120000,"includes_nutrition":true,"provisional":true}' and (e->>'price_kwd')::numeric = 70.000$$,1,'yearly: 365 days, nutrition, provisional placeholder price');
select t_count($$select 1 where public_plans()->0 ?& array['key','name_ar','name_en','price_kwd','monthly_credits','provisional','pause_eligible','includes_nutrition','period_days']$$,1,'public_plans keeps every earlier key and adds period_days');
select t_count($$select 1 where public_plans()->0->>'key' = 'monthly' and public_plans()->1->>'key' = 'yearly'$$,1,'monthly first, yearly second');
select t_count($$select 1 from plans where key in ('essential','pro','elite','vip') and not enabled and period_days = 30$$,4,'the four old plans are kept but switched off');
select t_count($$select 1 from jsonb_array_elements(public_coin_packs())$$,3,'exactly three coin packs are on sale');
select t_count($$select 1 from jsonb_array_elements(public_coin_packs()) e where (e @> '{"key":"starter","coins":500,"name_en":"Starter","name_ar":"البداية","provisional":true}' and (e->>'price_kwd')::numeric = 0.990)
  or (e @> '{"key":"plus","coins":1500,"name_en":"Plus","name_ar":"بلس","provisional":true}' and (e->>'price_kwd')::numeric = 2.490)
  or (e @> '{"key":"value","coins":3500,"name_en":"Value","name_ar":"التوفير","provisional":true}' and (e->>'price_kwd')::numeric = 4.990)$$,3,'starter 500 / 0.990, plus 1500 / 2.490, value 3500 / 4.990 (provisional)');
select t_count($$select 1 from coin_packs where key in ('coins_500','coins_1200','coins_3000') and not enabled$$,3,'the three old packs are kept but switched off');
select t_anon();
select t_count($$select 1 from jsonb_array_elements(public_plans())$$,2,'anon reads the plan list');
select t_count($$select 1 from plans$$,2,'anon sees only the enabled plans in the table');
select t_count($$select 1 from coin_packs$$,3,'anon sees only the enabled packs in the table');
select t_srv();
select t_code($$select purchase_create('f7000000-0000-4000-8000-000000000001'::uuid,'subscription','pro','old-plan-0001')$$,'PU002','an old plan cannot be bought');
select t_code($$select purchase_create('f7000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','old-pack-0001')$$,'PU002','an old pack cannot be bought');
select t_err($$select subscription_activate('f7000000-0000-4000-8000-000000000001'::uuid, 'elite', now() + interval '30 days', false, 'act-old-elite-1')$$,'an old plan cannot be activated');

-- ================= B. fixtures: muscles + exercises (superuser, as a migration would)
select t_su();
insert into muscles(id, name_ar, name_en, location_ar, location_en, function_ar, function_en, summary_ar, summary_en, sort_order) values
 ('chest','الصدر','Chest','مقدمة القفص الصدري','Front of the rib cage','دفع الذراعين للأمام','Pushes the arms forward','عضلة الدفع الرئيسية','The main pushing muscle',2),
 ('back','الظهر','Back','خلف الجذع','Back of the torso','سحب الذراعين','Pulls the arms','عضلات السحب','The pulling muscles',1),
 ('hips','الأرداف والأرجل','Hips','الحوض وأعلى الرجل','Pelvis and upper leg','مد الورك','Extends the hip','أقوى عضلات الجسم','The strongest muscles',7)
on conflict (id) do nothing;
insert into exercise_library(id, name_ar, name_en, primary_muscle, secondary_muscles, equipment_ar, equipment_en, difficulty, environments, instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en, alternatives, default_sets, default_reps, rest_seconds, sources, enabled, sort_order) values
 ('zz-test-bench','ضغط صدر تجريبي','Test Bench Press','chest','{triceps,shoulders}','بار وبنش','Barbell and bench','intermediate','{gym}','{"انزل","ادفع"}','{"Lower","Press"}','{"شد لوحي الكتف","ثبت القدمين"}','{"Pin the shoulder blades","Plant the feet"}','{"رفع الورك"}','{"Lifting the hips"}','استخدم مساعد','Use a spotter','{zz-test-pushup,zz-test-off,zz-test-missing}',4,'6-10',120,'[{"org":"TEST","title":"fixture","year":2026}]',true,-1000),
 ('zz-test-pushup','ضغط أرضي تجريبي','Test Push-up','chest','{triceps}','وزن الجسم','Bodyweight','beginner','{home,gym}','{"انزل","ادفع"}','{"Lower","Push"}','{"جسم مستقيم","كوع قريب"}','{"Straight body","Elbows in"}','{"هبوط الورك"}','{"Sagging hips"}','توقف عند الألم','Stop if it hurts','{}',3,'8-15',60,'[]',true,-999),
 ('zz-test-row','سحب تجريبي','Test Row','back','{biceps}','دمبل','Dumbbell','beginner','{gym,home}','{"اسحب"}','{"Row"}','{"ظهر مستقيم","اسحب بالكوع"}','{"Flat back","Lead with the elbow"}','{"تدوير الظهر"}','{"Rounding the back"}','ظهر محايد','Keep a neutral spine','{}',3,'8-12',90,'[]',true,-1000),
 ('zz-test-squat','سكوات تجريبي','Test Squat','hips','{abs}','وزن الجسم','Bodyweight','beginner','{home}','{"انزل"}','{"Squat"}','{"ركبة مع القدم","صدر مرفوع"}','{"Knees track the toes","Chest up"}','{"رفع الكعب"}','{"Heels lifting"}','لا تتجاوز مدى مريح','Stay in a comfortable range','{}',3,'10-15',75,'[]',true,-1000),
 ('zz-test-off','تمرين موقوف','Disabled Test Exercise','chest','{}','لا شيء','None','advanced','{gym,home}','{"x"}','{"x"}','{"x","y"}','{"x","y"}','{"x"}','{"x"}','x','x','{}',3,'5',60,'[]',false,-998);
select t_err($$insert into muscles(id, name_ar, name_en, location_ar, location_en, function_ar, function_en, summary_ar, summary_en) values ('neck','x','x','x','x','x','x','x','x')$$,'a muscle id outside the fixed list is refused');
select t_err($$insert into exercise_library(id, name_ar, name_en, primary_muscle, equipment_ar, equipment_en, difficulty, environments, instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en, default_sets, default_reps, rest_seconds)
  values ('Bad Id','x','x','chest','x','x','beginner','{gym}','{x}','{x}','{x}','{x}','{x}','{x}','x','x',3,'10',60)$$,'an exercise id that is not a slug is refused');
select t_err($$insert into exercise_library(id, name_ar, name_en, primary_muscle, equipment_ar, equipment_en, difficulty, environments, instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en, default_sets, default_reps, rest_seconds)
  values ('zz-test-bad-env','x','x','chest','x','x','beginner','{pool}','{x}','{x}','{x}','{x}','{x}','{x}','x','x',3,'10',60)$$,'an unknown environment is refused');
select t_err($$insert into exercise_library(id, name_ar, name_en, primary_muscle, equipment_ar, equipment_en, difficulty, environments, instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en, default_sets, default_reps, rest_seconds)
  values ('zz-test-no-env','x','x','chest','x','x','beginner','{}','{x}','{x}','{x}','{x}','{x}','{x}','x','x',3,'10',60)$$,'an exercise needs at least one environment');
select t_err($$insert into exercise_library(id, name_ar, name_en, primary_muscle, equipment_ar, equipment_en, difficulty, environments, instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en, default_sets, default_reps, rest_seconds)
  values ('zz-test-bad-muscle','x','x','neck','x','x','beginner','{gym}','{x}','{x}','{x}','{x}','{x}','{x}','x','x',3,'10',60)$$,'an unknown primary muscle is refused');
select t_count($$select 1 from exercise_library where id='zz-test-pushup' and review_status='unreviewed' and enabled$$,1,'defaults: unreviewed, enabled');

-- ================= C. the six members
select t_srv();
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000001', repeat('1',64), 'f7000000-0000-4000-8000-0000000000a1')$$,1,'free member: trusted session');
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000002', repeat('2',64), 'f7000000-0000-4000-8000-0000000000a2')$$,1,'coins member: trusted session');
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000003', repeat('3',64), 'f7000000-0000-4000-8000-0000000000a3')$$,1,'lapsed member: trusted session');
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000004', repeat('4',64), 'f7000000-0000-4000-8000-0000000000a4')$$,1,'monthly member: trusted session');
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000005', repeat('5',64), 'f7000000-0000-4000-8000-0000000000a5')$$,1,'yearly member: trusted session');
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000006', repeat('6',64), 'f7000000-0000-4000-8000-0000000000a6')$$,1,'old-plan member: trusted session');
-- 2: the trial is over and one Starter pack was bought
select t_su(); insert into trainer_trials(user_id, conversation_id, ended_at) values ('f7000000-0000-4000-8000-000000000002', gen_random_uuid(), now()), ('f7000000-0000-4000-8000-000000000003', gen_random_uuid(), now());
select t_srv();
select t_ok($$insert into t_ids select 'c2', t_buy('f7000000-0000-4000-8000-000000000002','coins','starter','lib-coins-0001')::text$$,'coins member buys the Starter pack');
select t_count($$select 1 where purchase_lookup(t_id('c2'), null) @> '{"kind":"coins","item_key":"starter","coins":500,"status":"paid","period_days":null}' and (purchase_lookup(t_id('c2'), null)->>'amount_kwd')::numeric = 0.990$$,1,'order snapshot: 500 coins for 0.990 KWD');
-- 3: a monthly subscription that has run out
select t_ok($$select t_buy('f7000000-0000-4000-8000-000000000003','subscription','monthly','lib-lapsed-001')$$,'lapsed member once bought a month');
select t_su(); update subscriptions set current_period_end = now() - interval '1 day' where user_id = 'f7000000-0000-4000-8000-000000000003';
-- 4: monthly, 5: yearly
select t_srv();
select t_ok($$insert into t_ids select 'm4', t_buy('f7000000-0000-4000-8000-000000000004','subscription','monthly','lib-month-0001')::text$$,'monthly order paid');
select t_count($$select 1 where purchase_lookup(t_id('m4'), null) @> '{"kind":"subscription","item_key":"monthly","period_days":30,"coins":null,"auto_renew":false,"status":"paid"}' and (purchase_lookup(t_id('m4'), null)->>'amount_kwd')::numeric = 7.000$$,1,'monthly order snapshots 30 days and the plan price');
select t_ok($$insert into t_ids select 'y5', t_buy('f7000000-0000-4000-8000-000000000005','subscription','yearly','lib-year-00001')::text$$,'yearly order paid');
select t_count($$select 1 where purchase_lookup(t_id('y5'), null) @> '{"kind":"subscription","item_key":"yearly","period_days":365,"coins":null,"auto_renew":false,"status":"paid"}' and (purchase_lookup(t_id('y5'), null)->>'amount_kwd')::numeric = 70.000$$,1,'yearly order snapshots 365 days and the plan price');
select t_su();
select t_count($$select 1 from subscriptions where user_id='f7000000-0000-4000-8000-000000000004' and status='active' and plan_key='monthly' and not auto_renew and abs(extract(epoch from current_period_end - (now() + interval '30 days'))) < 60$$,1,'monthly subscription ends in 30 days, auto_renew false');
select t_count($$select 1 from subscriptions where user_id='f7000000-0000-4000-8000-000000000005' and status='active' and plan_key='yearly' and not auto_renew and abs(extract(epoch from current_period_end - (now() + interval '365 days'))) < 60$$,1,'yearly subscription ends in 365 days, auto_renew false');
select t_count($$select 1 from credit_ledger where user_id='f7000000-0000-4000-8000-000000000004' and source='subscription' and amount=10000$$,1,'monthly: 10,000 coins granted once');
select t_count($$select 1 from credit_ledger where user_id='f7000000-0000-4000-8000-000000000005' and source='subscription'$$,1,'yearly: exactly one grant');
select t_count($$select 1 from credit_ledger where user_id='f7000000-0000-4000-8000-000000000005' and source='subscription' and amount=120000$$,1,'yearly: 120,000 coins granted once at activation');
-- 6: a subscription on the old "pro" plan that was bought before the plan left the shop
insert into subscriptions(user_id, plan_key, status, current_period_start, current_period_end, auto_renew) values ('f7000000-0000-4000-8000-000000000006', 'pro', 'active', now() - interval '10 days', now() + interval '20 days', false);

-- ================= D. trainer_access: tier + library / period flags (and every earlier key)
select t_srv();
select t_count($$select 1 where trainer_access('f7000000-0000-4000-8000-000000000001'::uuid) ?& array['tier','purchased_coins','plan_key','nutrition','library','period','period_end','auto_renew','trial']$$,1,'trainer_access keeps every earlier key and adds library + period');
select t_count($$select 1 from (select trainer_access('f7000000-0000-4000-8000-000000000001'::uuid) a) x where a @> '{"tier":"trial","library":false,"nutrition":false}' and a->>'period' is null and a->>'plan_key' is null$$,1,'free: trial tier, no library, no period');
select t_count($$select 1 from (select trainer_access('f7000000-0000-4000-8000-000000000002'::uuid) a) x where a @> '{"tier":"coins","library":false,"nutrition":false,"purchased_coins":500}' and a->>'period' is null$$,1,'coins: coins tier, no library, no period');
select t_count($$select 1 from (select trainer_access('f7000000-0000-4000-8000-000000000003'::uuid) a) x where a @> '{"tier":"none","library":false,"nutrition":false}' and a->>'period' is null and a->>'plan_key' is null$$,1,'lapsed subscriber: tier none, no library');
select t_count($$select 1 where trainer_access('f7000000-0000-4000-8000-000000000004'::uuid) @> '{"tier":"subscriber","plan_key":"monthly","library":true,"nutrition":true,"period":"monthly","auto_renew":false}'$$,1,'monthly: subscriber, library, nutrition, period monthly');
select t_count($$select 1 where trainer_access('f7000000-0000-4000-8000-000000000005'::uuid) @> '{"tier":"subscriber","plan_key":"yearly","library":true,"nutrition":true,"period":"yearly","auto_renew":false}'$$,1,'yearly: subscriber, library, nutrition, period yearly');
select t_count($$select 1 where trainer_access('f7000000-0000-4000-8000-000000000006'::uuid) @> '{"tier":"subscriber","plan_key":"pro","library":true,"nutrition":true,"period":"monthly"}'$$,1,'a member still on the old (disabled) pro plan stays a subscriber with the library');
select t_sess('f7000000-0000-4000-8000-000000000004', 'f7000000-0000-4000-8000-0000000000a4');
select t_count($$select 1 where my_trainer_access() @> '{"tier":"subscriber","library":true,"period":"monthly"}'$$,1,'my_trainer_access shows the flags to the member');
select t_sess('f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-0000000000a1');
select t_count($$select 1 where my_trainer_access() @> '{"tier":"trial","library":false}'$$,1,'my_trainer_access for a free member: no library');

-- ================= E. free content: muscles
select t_anon();
select t_count($$select 1 from jsonb_array_elements(public_muscles()) e where e->>'id' in ('chest','back','hips') and e ?& array['id','name_ar','name_en','location_ar','location_en','function_ar','function_en','summary_ar','summary_en','sort_order']$$,3,'anon reads the muscles (all fields) through public_muscles()');
select t_code($$select * from muscles$$,'42501','anon cannot read the muscles table directly');
select t_sess('f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-0000000000a1');
select t_count($$select 1 from jsonb_array_elements(public_muscles()) e where e->>'id' in ('chest','back','hips')$$,3,'a free member reads the muscles');
select t_code($$insert into muscles(id, name_ar, name_en, location_ar, location_en, function_ar, function_en, summary_ar, summary_en) values ('abs','x','x','x','x','x','x','x','x')$$,'42501','a member cannot write muscles');

-- ================= F. the advanced library: nobody but a subscriber on a trusted session
select t_anon();
select t_code($$select * from exercise_library$$,'42501','anon cannot read exercise_library directly');
select t_code($$select premium_exercises()$$,'42501','anon cannot call premium_exercises');
select t_code($$select premium_exercise('zz-test-bench')$$,'42501','anon cannot call premium_exercise');
select t_code($$select library_candidates(null, 'gym')$$,'42501','anon cannot call library_candidates');
select t_code($$select library_guard()$$,'42501','anon cannot call library_guard');
-- free (trial tier)
select t_sess('f7000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-0000000000a1');
select t_code($$select * from exercise_library$$,'42501','free member cannot read exercise_library directly');
select t_code($$select id from exercise_library where id = 'zz-test-bench'$$,'42501','not even one column of one row');
select t_msg($$select premium_exercises()$$,'42501','subscription_required','free member: premium_exercises => 42501 subscription_required');
select t_msg($$select premium_exercises('chest', 'gym')$$,'42501','subscription_required','free member: with filters => 42501 subscription_required');
select t_msg($$select premium_exercise('zz-test-bench')$$,'42501','subscription_required','free member: premium_exercise => 42501 subscription_required');
select t_code($$select library_candidates(array['chest'], 'gym')$$,'42501','a member cannot call library_candidates');
select t_code($$insert into exercise_library(id, name_ar, name_en, primary_muscle, equipment_ar, equipment_en, difficulty, environments, instructions_ar, instructions_en, cues_ar, cues_en, mistakes_ar, mistakes_en, safety_ar, safety_en, default_sets, default_reps, rest_seconds)
  values ('zz-test-mine','x','x','chest','x','x','beginner','{gym}','{x}','{x}','{x}','{x}','{x}','{x}','x','x',3,'10',60)$$,'42501','a member cannot write exercises');
-- coins only
select t_sess('f7000000-0000-4000-8000-000000000002', 'f7000000-0000-4000-8000-0000000000a2');
select t_code($$select * from exercise_library$$,'42501','coins member cannot read exercise_library directly');
select t_msg($$select premium_exercises()$$,'42501','subscription_required','coins member: premium_exercises => 42501 subscription_required');
select t_msg($$select premium_exercise('zz-test-bench')$$,'42501','subscription_required','coins member: premium_exercise => 42501 subscription_required');
-- lapsed subscriber
select t_sess('f7000000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-0000000000a3');
select t_code($$select * from exercise_library$$,'42501','lapsed subscriber cannot read exercise_library directly');
select t_msg($$select premium_exercises()$$,'42501','subscription_required','lapsed subscriber: premium_exercises => 42501 subscription_required');
select t_msg($$select premium_exercise('zz-test-bench')$$,'42501','subscription_required','lapsed subscriber: premium_exercise => 42501 subscription_required');
-- a paying subscriber on a session that is NOT device-verified
select t_sess('f7000000-0000-4000-8000-000000000004', 'f7000000-0000-4000-8000-0000000000ff');
select t_msg($$select premium_exercises()$$,'42501','trusted session required','monthly subscriber, untrusted session: refused');
select t_msg($$select premium_exercise('zz-test-bench')$$,'42501','trusted session required','monthly subscriber, untrusted session: one record refused too');
select t_code($$select * from exercise_library$$,'42501','and no direct table access either');
-- monthly subscriber, trusted session
select t_sess('f7000000-0000-4000-8000-000000000004', 'f7000000-0000-4000-8000-0000000000a4');
select t_count($$select 1 from jsonb_array_elements(premium_exercises()) e where e->>'id' like 'zz-test-%'$$,4,'monthly subscriber reads the enabled exercises (the disabled one is hidden)');
select t_count($$select 1 from jsonb_array_elements(premium_exercises()) e where e->>'id' = 'zz-test-bench' and e ?& array['id','name_ar','name_en','primary_muscle','secondary_muscles','equipment_ar','equipment_en','difficulty','environments','instructions_ar','instructions_en','cues_ar','cues_en','mistakes_ar','mistakes_en','safety_ar','safety_en','alternatives','default_sets','default_reps','rest_seconds','sources','review_status','enabled','sort_order']$$,1,'a record carries every column');
select t_count($$select 1 from jsonb_array_elements(premium_exercises('chest')) e where e->>'id' like 'zz-test-%'$$,2,'filter by muscle');
select t_count($$select 1 from jsonb_array_elements(premium_exercises('chest')) e where e->>'primary_muscle' <> 'chest'$$,0,'the muscle filter returns nothing else');
select t_count($$select 1 from jsonb_array_elements(premium_exercises(null, 'home')) e where e->>'id' like 'zz-test-%'$$,3,'filter by environment');
select t_count($$select 1 from jsonb_array_elements(premium_exercises('chest', 'gym')) e where e->>'id' like 'zz-test-%'$$,2,'both filters');
select t_count($$select 1 from jsonb_array_elements(premium_exercises('back', 'home')) e where e->>'id' = 'zz-test-row'$$,1,'both filters (back at home)');
select t_code($$select premium_exercises(null, 'pool')$$,'22023','an unknown environment is an input error');
select t_count($$select 1 where premium_exercise('zz-test-bench') @> '{"id":"zz-test-bench","name_en":"Test Bench Press","primary_muscle":"chest","default_sets":4,"default_reps":"6-10","rest_seconds":120}'$$,1,'one full record by id');
select t_count($$select 1 where premium_exercise('zz-test-off') is null and premium_exercise('zz-test-missing') is null$$,1,'a disabled or unknown id gives null');
select t_code($$select * from exercise_library$$,'42501','even a subscriber has no direct table access (functions only)');
select t_code($$select library_candidates(array['chest'], 'gym')$$,'42501','a subscriber cannot call library_candidates');
-- yearly subscriber and old-plan subscriber
select t_sess('f7000000-0000-4000-8000-000000000005', 'f7000000-0000-4000-8000-0000000000a5');
select t_count($$select 1 from jsonb_array_elements(premium_exercises()) e where e->>'id' like 'zz-test-%'$$,4,'yearly subscriber reads the library');
select t_count($$select 1 where premium_exercise('zz-test-squat')->>'name_en' = 'Test Squat'$$,1,'yearly subscriber reads one record');
select t_sess('f7000000-0000-4000-8000-000000000006', 'f7000000-0000-4000-8000-0000000000a6');
select t_count($$select 1 from jsonb_array_elements(premium_exercises()) e where e->>'id' like 'zz-test-%'$$,4,'a subscriber on the old pro plan still reads the library');
-- a subscription that runs out closes the library at once (no cron needed)
select t_su(); update subscriptions set current_period_end = now() - interval '1 minute' where user_id = 'f7000000-0000-4000-8000-000000000006';
select t_sess('f7000000-0000-4000-8000-000000000006', 'f7000000-0000-4000-8000-0000000000a6');
select t_msg($$select premium_exercises()$$,'42501','subscription_required','the moment the period is over the library is closed');
-- a revoked device closes it too
select t_su(); insert into t_ids select 'dev5', id::text from trusted_devices where user_id = 'f7000000-0000-4000-8000-000000000005';
select t_srv(); select t_ok($$select device_revoke('f7000000-0000-4000-8000-000000000005'::uuid, t_id('dev5'))$$,'the yearly member''s device is revoked');
select t_sess('f7000000-0000-4000-8000-000000000005', 'f7000000-0000-4000-8000-0000000000a5');
select t_msg($$select premium_exercises()$$,'42501','trusted session required','a revoked device loses the library');

-- ================= G. library_candidates (service role, for the ai-trainer function)
select t_srv();
select t_code($$select * from exercise_library$$,'42501','service_role has no direct table access either');
select t_count($$select 1 from jsonb_array_elements(library_candidates(array['chest'], 'gym', 40)) e where e->>'id' like 'zz-test-%'$$,2,'chest at the gym: the two enabled fixtures');
select t_count($$select 1 from jsonb_array_elements(library_candidates(array['chest'], 'gym', 40)) e where e->>'primary_muscle' <> 'chest' or not (e->'environments' ? 'gym')$$,0,'nothing outside the requested muscle / environment');
select t_count($$select 1 from jsonb_array_elements(library_candidates(array['chest'], 'home', 40)) e where e->>'id' in ('zz-test-bench','zz-test-off')$$,0,'gym-only and disabled exercises are never candidates at home');
select t_count($$select 1 from jsonb_array_elements(library_candidates(array['chest'], 'gym', 40)) e where e->>'id' = 'zz-test-bench'
  and e ?& array['id','name_ar','name_en','primary_muscle','secondary_muscles','equipment_ar','equipment_en','difficulty','environments','default_sets','default_reps','rest_seconds','cues_ar','cues_en','safety_ar','safety_en','alternatives']
  and not e ?| array['instructions_ar','instructions_en','mistakes_ar','sources','enabled']$$,1,'a compact record: what the trainer needs, not the full article');
select t_count($$select 1 from jsonb_array_elements(library_candidates(array['chest'], 'gym', 40)) e where e->>'id' = 'zz-test-bench' and e->'alternatives' = '[{"id":"zz-test-pushup","name_ar":"ضغط أرضي تجريبي","name_en":"Test Push-up"}]'$$,1,'alternatives are resolved to names; disabled / unknown ids are skipped');
select t_count($$select 1 where (select array_agg(e->>'primary_muscle' order by e->>'primary_muscle') from jsonb_array_elements(library_candidates(array['chest','back'], 'gym', 2)) e) = array['back','chest']$$,1,'a small limit is interleaved: one exercise per requested muscle');
select t_count($$select 1 where (select count(distinct e->>'primary_muscle') from jsonb_array_elements(library_candidates(null, 'home', 3)) e) = 3$$,1,'no muscles given: a balanced set over the muscles');
select t_count($$select 1 where jsonb_array_length(library_candidates(array['chest'], 'gym', 1)) = 1 and jsonb_array_length(library_candidates(array['chest'], 'gym', 0)) = 1 and jsonb_array_length(library_candidates('{}', 'home', 100000)) <= 40$$,1,'the limit is clamped to 1..40');
select t_count($$select 1 where library_candidates(array['forearms'], 'gym', 5) is not null and jsonb_typeof(library_candidates(array['nope'], 'gym', 5)) = 'array' and jsonb_array_length(library_candidates(array['nope'], 'gym', 5)) = 0$$,1,'no match: an empty array, never null');

-- ================= H. manual renewal extends by the period of the plan that was bought
select t_su(); insert into t_ids select 'end4', current_period_end::text from subscriptions where user_id='f7000000-0000-4000-8000-000000000004' and status='active';
select t_srv();
select t_ok($$select t_buy('f7000000-0000-4000-8000-000000000004','subscription','monthly','lib-month-0002')$$,'monthly member renews for another month');
select t_su();
select t_count($$select 1 from subscriptions where user_id='f7000000-0000-4000-8000-000000000004' and status='active' and plan_key='monthly' and current_period_end = (select v::timestamptz from t_ids where k='end4') + interval '30 days'$$,1,'renewal EXTENDS: previous end + 30 days');
select t_srv();
select t_ok($$select t_buy('f7000000-0000-4000-8000-000000000004','subscription','yearly','lib-year-00002')$$,'then moves to the yearly plan');
select t_su();
select t_count($$select 1 from subscriptions where user_id='f7000000-0000-4000-8000-000000000004' and status='active' and plan_key='yearly' and not auto_renew and current_period_end = (select v::timestamptz from t_ids where k='end4') + interval '30 days' + make_interval(days => 365)$$,1,'yearly on top: previous end + 365 days (nothing paid for is lost)');
select t_count($$select 1 from subscriptions where user_id='f7000000-0000-4000-8000-000000000004' and status='active'$$,1,'still exactly one active subscription');
select t_count($$select 1 from subscriptions where user_id='f7000000-0000-4000-8000-000000000004'$$,3,'three rows for three paid orders');
select t_count($$select 1 from subscriptions where user_id::text like 'f7000000-%' and auto_renew$$,0,'no subscription of these members has auto_renew on');
select t_count($$select 1 from purchase_orders where user_id::text like 'f7000000-%' and auto_renew$$,0,'no order has auto_renew on');
select t_srv();
select t_count($$select 1 where trainer_access('f7000000-0000-4000-8000-000000000004'::uuid) @> '{"tier":"subscriber","plan_key":"yearly","period":"yearly","library":true}'$$,1,'trainer_access follows the plan: yearly now');
-- a lapsed member who buys again gets the library back
select t_ok($$select t_buy('f7000000-0000-4000-8000-000000000003','subscription','monthly','lib-lapsed-002')$$,'the lapsed member buys a month again');
select t_sess('f7000000-0000-4000-8000-000000000003', 'f7000000-0000-4000-8000-0000000000a3');
select t_count($$select 1 from jsonb_array_elements(premium_exercises()) e where e->>'id' like 'zz-test-%'$$,4,'and reads the library again');

-- ================= I. the one trial conversation is bound to the ACCOUNT (a new device / session / conversation id cannot reset it)
select t_srv();
select t_count($$select 1 where trainer_trial_consume('f7000000-0000-4000-8000-000000000001'::uuid, 'f7000000-0000-4000-8000-0000000000c1'::uuid) @> '{"allowed":true}'$$,1,'free member: first trial message');
select t_count($$select 1 where trainer_trial_consume('f7000000-0000-4000-8000-000000000001'::uuid, 'f7000000-0000-4000-8000-0000000000c2'::uuid) @> '{"allowed":false,"reason":"trial_ended"}'$$,1,'a second conversation id is refused');
select t_count($$select 1 where t_trust('f7000000-0000-4000-8000-000000000001', repeat('9',64), 'f7000000-0000-4000-8000-0000000000b1')$$,1,'the same account signs in on a second device (new session)');
select t_count($$select 1 where trainer_trial_consume('f7000000-0000-4000-8000-000000000001'::uuid, 'f7000000-0000-4000-8000-0000000000c3'::uuid) @> '{"allowed":false,"reason":"trial_ended"}'$$,1,'a new device + a new conversation id does not start a second trial');
select t_count($$select 1 from (select trainer_access('f7000000-0000-4000-8000-000000000001'::uuid)->'trial' t) x where t @> '{"started":true,"conversation_id":"f7000000-0000-4000-8000-0000000000c1"}' and (t->>'remaining')::int = (t->>'max_messages')::int - 1$$,1,'still the one conversation, one message used');
select t_su(); update trainer_trials set messages_used = (select trial_max_messages from trainer_settings) where user_id = 'f7000000-0000-4000-8000-000000000001';
select t_srv();
select t_count($$select 1 where trainer_trial_consume('f7000000-0000-4000-8000-000000000001'::uuid, 'f7000000-0000-4000-8000-0000000000c1'::uuid) @> '{"allowed":false,"reason":"trial_ended"}'$$,1,'the limit of trainer_settings.trial_max_messages ends it');
select t_count($$select 1 from (select trainer_access('f7000000-0000-4000-8000-000000000001'::uuid) a) x where a @> '{"tier":"none","library":false}'$$,1,'afterwards: tier none (no coins, no subscription)');
select t_su();
select t_count($$select 1 from trainer_trials where user_id = 'f7000000-0000-4000-8000-000000000001'$$,1,'one trial row per account, ever');
select t_err($$insert into trainer_trials(user_id, conversation_id) values ('f7000000-0000-4000-8000-000000000001', gen_random_uuid())$$,'a second trial row is impossible (primary key)');

select t_su();
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
