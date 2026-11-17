\set ON_ERROR_STOP off
-- Purchases (20261120): coin packs, purchase orders, exactly-once fulfilment, manual subscription renewal, owner price edits.
drop table if exists t_results cascade;
create table t_results(n serial, ok boolean, label text);
create or replace function t_anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); set role anon; end $$;
create or replace function t_su() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', '', false); end $$;
create or replace function t_err(q text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected an error, got none)');
  exception when others then insert into t_results(ok,label) values (true, label||' -> '||left(sqlerrm,70)); end; end $$;
-- like t_err, but the error must carry exactly this SQLSTATE
create or replace function t_code(q text, code text, label text) returns void language plpgsql as $$
begin begin execute q; insert into t_results(ok,label) values (false, label||' (expected '||code||', got no error)');
  exception when others then insert into t_results(ok,label) values (sqlstate = code, label||' -> '||sqlstate||' '||left(sqlerrm,60)); end; end $$;
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
create or replace function t_id(key text) returns uuid language sql as $$ select v::uuid from t_ids where k = key $$;
create or replace function t_srv() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims','',false); set role service_role; end $$;
create or replace function t_sess(u uuid, s uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claims', json_build_object('session_id', s, 'sub', u, 'role','authenticated','aal','aal1')::text, false); set role authenticated; end $$;
create or replace function t_owner(step boolean, aal text default 'aal2') returns void language plpgsql as $$ begin reset role;
  perform set_config('request.jwt.claims', json_build_object('session_id', 'a0000000-0000-4000-8000-00000000000a', 'sub', 'a0000000-0000-4000-8000-00000000000a', 'role','authenticated','aal', aal,
     'amr', case when step then json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint - 30)) else json_build_array(json_build_object('method','totp','timestamp', extract(epoch from now())::bigint - 7200)) end)::text, false); set role authenticated; end $$;
create or replace function t_trust(u uuid, h text, s uuid) returns boolean language plpgsql as $$ begin perform public.device_challenge_create(u, h, '123456'); return public.device_challenge_verify(u, h, '123456', s, 'dev'); end $$;
do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;

-- 20261121 replaced the catalogue (plans monthly / yearly, packs starter / plus / value) and switched the original rows off. This suite
-- tests the purchase MECHANICS with the original rows (their prices and credits), so it puts them back on sale in the scratch database
-- first (and the new packs off, so the pack counts below are the original three). Both are undone at the end of this file.
-- The new catalogue itself is covered by catalogue-as-migrated.test.sql and exercise-library.test.sql.
select t_su(); update plans set enabled = true where key in ('essential','pro','elite','vip'); update coin_packs set enabled = (key in ('coins_500','coins_1200','coins_3000'));

-- users: 1 = buyer (trusted session s1), 2 = another member (trusted session s2), 3 = unverified e-mail, 4 = subscription buyer, 5 = second subscription buyer
select t_su();
insert into auth.users(id,email,email_confirmed_at) values
 ('e5000000-0000-4000-8000-000000000001','p1@buy.test',now()), ('e5000000-0000-4000-8000-000000000002','p2@buy.test',now()),
 ('e5000000-0000-4000-8000-000000000003','p3@buy.test',null),  ('e5000000-0000-4000-8000-000000000004','p4@buy.test',now()),
 ('e5000000-0000-4000-8000-000000000005','p5@buy.test',now());
select t_srv();
select t_count($$select 1 where t_trust('e5000000-0000-4000-8000-000000000001', repeat('1',64), 'e5000000-0000-4000-8000-0000000000a1')$$,1,'buyer 1 has a trusted session');
select t_count($$select 1 where t_trust('e5000000-0000-4000-8000-000000000002', repeat('2',64), 'e5000000-0000-4000-8000-0000000000a2')$$,1,'member 2 has a trusted session');

-- ================= A. catalogue
select t_anon();
select t_count($$select 1 from jsonb_array_elements(public_coin_packs())$$,3,'anonymous sees the three seeded coin packs');
select t_count($$select 1 from jsonb_array_elements(public_coin_packs()) e where (e->>'provisional')::boolean$$,3,'every seeded pack is marked PROVISIONAL');
select t_count($$select 1 from jsonb_array_elements(public_coin_packs()) e where e->>'key'='coins_500' and (e->>'coins')::int=500 and (e->>'price_kwd')::numeric=0.500$$,1,'pack 500 exposes coins and price');
select t_err($$update coin_packs set price_kwd = 0.001$$,'anonymous cannot change a pack price');
select t_err($$insert into coin_packs(key,name_ar,name_en,coins,price_kwd) values ('free_pack','x','x',999999,0.001)$$,'anonymous cannot add a pack');
select t_err($$select * from purchase_orders$$,'anonymous cannot read purchase orders');
select t_err($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','anon-key-0001')$$,'anonymous cannot create an order');
select t_sess('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-0000000000a1');
select t_err($$update coin_packs set price_kwd = 0.001$$,'a member cannot change a pack price');
select t_err($$delete from coin_packs$$,'a member cannot delete packs');

-- ================= B. owner price edit: existing owner pattern (super admin + MFA + RECENT step-up + audit)
select t_err($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,0.600,true,1)$$,'a normal member cannot edit a pack');
select t_err($$select owner_list_coin_packs()$$,'a normal member cannot list packs through the owner function');
select t_owner(false, 'aal1');
select t_code($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,0.600,true,1)$$,'42501','owner without MFA (aal1) is refused');
select t_owner(false);
select t_code($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,0.600,true,1)$$,'PO001','owner with MFA but no RECENT verification is refused (step-up PO001)');
select t_count($$select 1 from jsonb_array_elements(owner_list_coin_packs())$$,6,'owner reads ALL packs, disabled ones included, without step-up (read only)');
select t_su(); select t_count($$select 1 from coin_packs where key='coins_500' and price_kwd=0.500$$,1,'price unchanged after the refused edits');
select t_owner(true);
select t_code($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,0,true,1)$$,'22023','zero price rejected');
select t_code($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,-1,true,1)$$,'22023','negative price rejected');
select t_code($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,0.5005,true,1)$$,'22023','price with more than 3 decimals rejected');
select t_code($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',0,0.500,true,1)$$,'22023','zero coins rejected');
select t_err($$select owner_upsert_coin_pack('BAD KEY','x','x',10,0.500,true,1)$$,'invalid pack key rejected');

-- ================= C. purchase_create: server-side price snapshot, idempotency
select t_sess('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-0000000000a1');
select t_err($$select purchase_create(auth.uid(),'coins','coins_500','member-key-0001')$$,'a member cannot call purchase_create');
select t_srv();
select t_ok($$insert into t_ids select 'o1', purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0001')->>'id'$$,'service creates a coins order');
select t_count($$select 1 where purchase_lookup(t_id('o1'), null) @> '{"kind":"coins","item_key":"coins_500","coins":500,"status":"pending","currency":"KWD","auto_renew":false,"amount_kwd":0.500}'$$,1,'order snapshots coins and price from the catalogue');
select t_count($$select 1 where (purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0001')->>'id')::uuid = t_id('o1')$$,1,'same idempotency key returns the SAME order');
select t_count($$select 1 where (purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0001')->>'reused')::boolean$$,1,'the repeat is flagged as reused');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_1200','buy-coins-0001')$$,'PU004','same key for another item is refused');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_9999','buy-coins-0002')$$,'PU002','unknown pack refused');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'subscription','gold','buy-plan-00001')$$,'PU002','unknown plan refused');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'gift','coins_500','buy-coins-0003')$$,'22023','unknown kind refused');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','short')$$,'22023','short idempotency key refused');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000003'::uuid,'coins','coins_500','buy-coins-0004')$$,'PU003','unverified e-mail cannot buy');
select t_code($$select purchase_create(gen_random_uuid(),'coins','coins_500','buy-coins-0005')$$,'PU001','unknown user refused');
select t_err($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0006', 0.001)$$,'there is no price parameter: a caller cannot pass an amount');
select t_count($$select 1 where to_regprocedure('public.purchase_create(uuid,text,text,text)') is not null and (select count(*) from pg_proc where proname='purchase_create') = 1$$,1,'purchase_create has exactly one signature (user, kind, item, key)');
-- the owner changes the price: open orders keep THEIR price, new orders get the new one; the edit is audited
select t_owner(true);
select t_ok($$select owner_upsert_coin_pack('coins_500','٥٠٠ عملة','500 Coins',500,0.750,true,1)$$,'owner with fresh step-up changes the pack price');
select t_su();
select t_count($$select 1 from audit_log where action='coin_pack.upsert' and target_id='coins_500' and (details->'old'->>'price_kwd')::numeric=0.500 and (details->'new'->>'price_kwd')::numeric=0.750$$,1,'the price change is in the audit log (old and new)');
select t_srv();
select t_count($$select 1 where (purchase_lookup(t_id('o1'), null)->>'amount_kwd')::numeric = 0.500$$,1,'the existing order keeps its snapshot price');
select t_count($$select 1 where (purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0001')->>'amount_kwd')::numeric = 0.500$$,1,'idempotent repeat after a price change still returns the original price');
select t_ok($$insert into t_ids select 'o2', purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0010')->>'id'$$,'a new order after the price change');
select t_count($$select 1 where (purchase_lookup(t_id('o2'), null)->>'amount_kwd')::numeric = 0.750$$,1,'the new order has the new price');
select t_owner(true);
select t_ok($$select owner_upsert_coin_pack('coins_3000','٣٬٠٠٠ عملة','3,000 Coins',3000,2.000,false,3)$$,'owner disables a pack');
select t_anon(); select t_count($$select 1 from jsonb_array_elements(public_coin_packs())$$,2,'a disabled pack is not offered');
select t_srv(); select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_3000','buy-coins-0011')$$,'PU002','a disabled pack cannot be bought');
select t_owner(true); select t_ok($$select owner_upsert_coin_pack('coins_3000','٣٬٠٠٠ عملة','3,000 Coins',3000,2.000,true,3,false)$$,'owner re-enables it and clears the provisional mark');
select t_anon(); select t_count($$select 1 from jsonb_array_elements(public_coin_packs()) e where e->>'key'='coins_3000' and not (e->>'provisional')::boolean$$,1,'approved pack is no longer provisional');
-- checkout bookkeeping
select t_srv();
select t_err($$select purchase_set_checkout(t_id('o1'), 'sess-o1', 'http://evil.test/pay')$$,'a non-https checkout link is refused');
select t_ok($$select purchase_set_checkout(t_id('o1'), 'sess-o1', 'https://sandbox.upayments.com/pay?session_id=sess-o1')$$,'checkout link recorded');
select t_ok($$select purchase_set_checkout(t_id('o1'), 'sess-XX', 'https://sandbox.upayments.com/pay?session_id=other')$$,'a second set_checkout is a no-op');
select t_count($$select 1 where purchase_lookup(t_id('o1'), null) @> '{"provider_session_id":"sess-o1"}'$$,1,'the first checkout link is kept');
select t_count($$select 1 where (purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0001')->>'checkout_url') like 'https://sandbox.upayments.com/%'$$,1,'idempotent repeat returns the same checkout link');

-- ================= D. access: members read only their own orders (trusted session), never write
select t_sess('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-0000000000a1');
select t_count($$select id from purchase_orders$$,2,'buyer sees own two orders');
select t_count($$select id from purchase_orders where user_id <> auth.uid()$$,0,'buyer sees nobody else''s orders');
select t_err($$select checkout_url from purchase_orders$$,'member cannot read the checkout link column');
select t_err($$select provider_track_id, provider_session_id from purchase_orders$$,'member cannot read provider identifiers');
select t_err($$select idempotency_key from purchase_orders$$,'member cannot read idempotency keys');
select t_err($$insert into purchase_orders(user_id,kind,item_key,amount_kwd,coins,idempotency_key,expires_at) values (auth.uid(),'coins','coins_500',0.001,500000,'self-made-order-1',now()+interval '1 hour')$$,'member cannot insert an order (cannot set a price)');
select t_err($$update purchase_orders set amount_kwd = 0.001$$,'member cannot change an order amount');
select t_err($$update purchase_orders set status = 'paid', paid_at = now()$$,'member cannot mark an order paid');
select t_err($$delete from purchase_orders$$,'member cannot delete orders');
select t_err($$select purchase_apply((select id from purchase_orders limit 1),'CAPTURED',0.500,'KWD','t','{}'::jsonb,'webhook')$$,'member cannot call purchase_apply');
select t_err($$select purchase_fulfil((select id from purchase_orders limit 1))$$,'member cannot call purchase_fulfil');
select t_err($$select purchase_lookup((select id from purchase_orders limit 1), null)$$,'member cannot call purchase_lookup');
select t_err($$select purchase_set_checkout((select id from purchase_orders limit 1),'s','https://x.test/')$$,'member cannot call purchase_set_checkout');
select t_count($$select * from purchase_events$$,0,'member reads no purchase events (admins only)');
select t_sess('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-0000000000ff');
select t_count($$select id from purchase_orders$$,0,'an UNTRUSTED session of the buyer reads no orders');
select t_sess('e5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-0000000000a2');
select t_count($$select id from purchase_orders$$,0,'another member reads none of the buyer''s orders');
select t_srv();
select t_err($$select * from purchase_orders$$,'service_role has no direct table access (functions only)');
select t_err($$update purchase_orders set status='paid', paid_at=now()$$,'service_role cannot update orders directly');
select t_err($$select purchase_fulfil(t_id('o1'))$$,'service_role cannot call purchase_fulfil directly');
select t_err($$insert into purchase_events(order_id, source, outcome) values (t_id('o1'),'x','x')$$,'service_role cannot write events directly');

-- ================= E. coins: verification, exactly-once grant, no downgrade
select t_su(); create table t_led as select * from credit_ledger; 
select t_srv();
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.499,'KWD','trk-o1','{}'::jsonb,'webhook') @> '{"outcome":"rejected_amount_or_currency_mismatch","status":"pending"}'$$,1,'CAPTURED with a lower amount is rejected');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',5.000,'KWD','trk-o1','{}'::jsonb,'webhook')->>'outcome'='rejected_amount_or_currency_mismatch'$$,1,'CAPTURED with a higher amount is rejected');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.500,'USD','trk-o1','{}'::jsonb,'webhook')->>'outcome'='rejected_amount_or_currency_mismatch'$$,1,'CAPTURED in another currency is rejected');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',null,'KWD','trk-o1','{}'::jsonb,'webhook')->>'outcome'='rejected_amount_or_currency_mismatch'$$,1,'CAPTURED without an amount is rejected');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.500,null,'trk-o1','{}'::jsonb,'webhook')->>'outcome'='rejected_amount_or_currency_mismatch'$$,1,'CAPTURED without a currency is rejected');
select t_count($$select 1 where purchase_apply(t_id('o1'),'PENDING',0.500,'KWD',null,'{}'::jsonb,'webhook')->>'outcome'='ignored_non_terminal'$$,1,'PENDING changes nothing');
select t_count($$select 1 where purchase_apply(t_id('o1'),'EXPIRED',null,null,null,'{}'::jsonb,'reconcile')->>'outcome'='ignored_not_open_or_not_due'$$,1,'EXPIRED before the expiry time is ignored');
select t_count($$select 1 where purchase_apply(gen_random_uuid(),'CAPTURED',0.500,'KWD','x','{}'::jsonb,'webhook')->>'outcome'='rejected_unknown_order'$$,1,'unknown order rejected');
select t_su();
select t_count($$select 1 from purchase_orders where id=t_id('o1') and status='pending' and paid_at is null and fulfilled_at is null$$,1,'order still pending after all rejected events');
select t_count($$(select * from credit_ledger except select * from t_led)$$,0,'rejected / ignored events granted nothing');
select t_srv();
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.500,'KWD','trk-o1','{"result":"CAPTURED"}'::jsonb,'webhook') @> '{"outcome":"applied","status":"paid","fulfilled":true}'$$,1,'verified CAPTURED marks the order paid and fulfils it');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.500,'KWD','trk-o1','{}'::jsonb,'webhook') @> '{"outcome":"duplicate","status":"paid"}'$$,1,'duplicate webhook is a no-op');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.500,'KWD','trk-o1','{}'::jsonb,'reconcile')->>'outcome'='duplicate'$$,1,'reconcile after the webhook is a no-op');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CAPTURED',0.500,'KWD','trk-other','{}'::jsonb,'status')->>'outcome'='duplicate'$$,1,'a capture with another track id is still a no-op');
select t_count($$select 1 where purchase_apply(t_id('o1'),'FAILED',0.500,'KWD','trk-o1','{}'::jsonb,'webhook') @> '{"outcome":"ignored_downgrade","status":"paid"}'$$,1,'late FAILED cannot downgrade a paid order');
select t_count($$select 1 where purchase_apply(t_id('o1'),'CANCELED',null,null,'trk-o1','{}'::jsonb,'webhook')->>'outcome'='ignored_downgrade'$$,1,'late CANCELED cannot downgrade a paid order');
select t_count($$select 1 where purchase_apply(t_id('o1'),'EXPIRED',null,null,null,'{}'::jsonb,'reconcile')->>'outcome'='ignored_not_open_or_not_due'$$,1,'EXPIRED cannot touch a paid order');
select t_su();
select t_count($$select 1 from purchase_orders where id=t_id('o1') and status='paid' and paid_at is not null and fulfilled_at is not null and provider_track_id='trk-o1'$$,1,'order is paid + fulfilled, track id recorded');
select t_count($$select 1 from credit_ledger where user_id='e5000000-0000-4000-8000-000000000001' and idempotency_key='order:'||t_id('o1')::text$$,1,'EXACTLY ONE ledger row for the order after 4 CAPTURED events');
select t_count($$select 1 from credit_ledger where user_id='e5000000-0000-4000-8000-000000000001' and idempotency_key='order:'||t_id('o1')::text and source='purchased' and entry_type='purchase' and amount=500$$,1,'the grant is 500 purchased coins (entry type purchase)');
select t_count($$select 1 where credit_source_balance('e5000000-0000-4000-8000-000000000001','purchased') = 500$$,1,'purchased balance is exactly 500');
select t_count($$select 1 from purchase_events where order_id=t_id('o1') and outcome='applied' and dedupe_key is not null$$,1,'one applied event with a dedupe key');
select t_count($$select 1 from purchase_events where order_id=t_id('o1') and outcome='duplicate'$$,3,'three duplicate events logged');
select t_count($$select 1 from purchase_events where order_id=t_id('o1') and outcome='rejected_amount_or_currency_mismatch'$$,5,'five mismatch events logged');
select t_count($$select 1 from security_events where user_id='e5000000-0000-4000-8000-000000000001' and event='purchase.paid'$$,1,'one purchase.paid security event');
-- even the table owner cannot downgrade or rewrite a paid order
select t_err($$update purchase_orders set status='pending' where id=t_id('o1')$$,'guard: a paid order cannot go back to pending (table owner included)');
select t_err($$update purchase_orders set status='failed' where id=t_id('o1')$$,'guard: a paid order cannot be marked failed');
select t_err($$update purchase_orders set amount_kwd=0.001 where id=t_id('o2')$$,'guard: the amount snapshot can never change');
select t_err($$update purchase_orders set coins=999999 where id=t_id('o2')$$,'guard: the coins snapshot can never change');
select t_err($$update purchase_orders set user_id='e5000000-0000-4000-8000-000000000002' where id=t_id('o2')$$,'guard: the owner of an order can never change');
select t_err($$update purchase_orders set paid_at=now() - interval '1 day' where id=t_id('o1')$$,'guard: paid_at is set once');
select t_err($$update purchase_orders set fulfilled_at=null where id=t_id('o1')$$,'guard: fulfilled_at cannot be cleared (no second fulfilment)');
select t_err($$update purchase_orders set auto_renew=true where id=t_id('o2')$$,'auto_renew cannot be switched on in this release');
select t_err($$update purchase_orders set status='paid' where id=t_id('o2')$$,'paid without paid_at violates the table constraint');
select t_sess('e5000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-0000000000a1');
select t_count($$select 1 from purchase_orders where status='paid' and fulfilled_at is not null and coins=500 and amount_kwd=0.500$$,1,'the buyer sees the paid order');
select t_count($$select 1 where (my_credit_balance()->>'purchased')::int = 500$$,1,'the buyer sees 500 purchased coins');

-- ================= F. failed / cancelled / expired grant nothing; a late capture is honoured once
select t_su(); drop table t_led; create table t_led as select * from credit_ledger;
select t_srv();
select t_count($$select 1 where purchase_apply(t_id('o2'),'FAILED',0.750,'KWD','trk-o2','{}'::jsonb,'webhook') @> '{"outcome":"applied","status":"failed","fulfilled":false}'$$,1,'FAILED marks the order failed');
select t_count($$select 1 where purchase_apply(t_id('o2'),'FAILED',0.750,'KWD','trk-o2','{}'::jsonb,'webhook')->>'outcome'='duplicate'$$,1,'repeated FAILED is a no-op');
select t_ok($$insert into t_ids select 'o3', purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_1200','buy-coins-0020')->>'id'$$,'order 3 (1,200 coins)');
select t_count($$select 1 where purchase_apply(t_id('o3'),'CANCELED',null,null,null,'{}'::jsonb,'webhook') @> '{"outcome":"applied","status":"cancelled"}'$$,1,'CANCELED marks the order cancelled');
select t_ok($$insert into t_ids select 'o4', purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_1200','buy-coins-0021')->>'id'$$,'order 4');
select t_su(); update purchase_orders set expires_at = now() - interval '1 minute' where id = t_id('o4'); select t_srv();
select t_count($$select 1 from purchase_overdue(20) o where (o->>'id')::uuid = t_id('o4')$$,1,'the reconciler sees the overdue open order');
select t_count($$select 1 where purchase_apply(t_id('o4'),'EXPIRED',null,null,null,'{}'::jsonb,'reconcile') @> '{"outcome":"applied","status":"expired"}'$$,1,'an overdue open order expires');
select t_count($$select 1 from purchase_overdue(20) o where (o->>'id')::uuid = t_id('o4')$$,0,'an expired order is no longer overdue');
select t_ok($$insert into t_ids select 'o5', purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_1200','buy-coins-0022')->>'id'$$,'order 5 (never gets a checkout link)');
select t_ok($$select purchase_fail_creation(t_id('o5'), 'gateway rejected the checkout request (HTTP 500)')$$,'checkout creation failure closes the order');
select t_su();
select t_count($$select 1 from purchase_orders where id in (t_id('o2'),t_id('o3'),t_id('o4'),t_id('o5')) and status in ('failed','cancelled','expired') and paid_at is null and fulfilled_at is null$$,4,'four closed orders, none paid, none fulfilled');
select t_count($$(select * from credit_ledger except select * from t_led)$$,0,'failed / cancelled / expired orders granted NOTHING');
select t_srv();
select t_count($$select 1 where (purchase_create('e5000000-0000-4000-8000-000000000001'::uuid,'coins','coins_500','buy-coins-0010')->>'status') = 'failed'$$,1,'the key of a failed order returns that failed order (no silent new checkout)');
-- the provider says the money WAS captured after we had closed the order: honoured, exactly once
select t_count($$select 1 where purchase_apply(t_id('o4'),'CAPTURED',1.000,'KWD','trk-o4','{}'::jsonb,'reconcile') @> '{"outcome":"late_capture_applied","status":"paid","fulfilled":true}'$$,1,'late capture on an expired order is applied');
select t_count($$select 1 where purchase_apply(t_id('o4'),'CAPTURED',1.000,'KWD','trk-o4','{}'::jsonb,'webhook')->>'outcome'='duplicate'$$,1,'and only once');
select t_count($$select 1 where purchase_apply(t_id('o2'),'CAPTURED',0.500,'KWD','trk-o2','{}'::jsonb,'webhook')->>'outcome'='rejected_amount_or_currency_mismatch'$$,1,'late capture with the OLD catalogue price of a 0.750 order is rejected');
select t_count($$select 1 where purchase_lookup(null, 'trk-o4') @> '{"status":"paid"}' and (purchase_lookup(null,'trk-o4')->>'id')::uuid = t_id('o4')$$,1,'an order can be found by the provider track id');
select t_su();
select t_count($$select 1 where credit_source_balance('e5000000-0000-4000-8000-000000000001','purchased') = 1700$$,1,'purchased balance = 500 + 1200 (one late capture)');
select t_count($$select 1 from credit_ledger where user_id='e5000000-0000-4000-8000-000000000001' and entry_type='purchase'$$,2,'exactly two purchase rows in the ledger');
-- at most five open orders per member
select t_srv();
select t_ok($$select purchase_create('e5000000-0000-4000-8000-000000000002'::uuid,'coins','coins_500','open-order-'||g) from generate_series(1,5) g$$,'five open orders are allowed');
select t_code($$select purchase_create('e5000000-0000-4000-8000-000000000002'::uuid,'coins','coins_500','open-order-6')$$,'PU005','a sixth open order is refused');
select t_count($$select 1 where (purchase_create('e5000000-0000-4000-8000-000000000002'::uuid,'coins','coins_500','open-order-3')->>'reused')::boolean$$,1,'an idempotent repeat is still answered at the limit');
select t_count($$select 1 where purchase_check_gate(t_id('o2'), 5)$$,1,'provider-lookup throttle: first check allowed');
select t_count($$select 1 where purchase_check_gate(t_id('o2'), 5)$$,0,'provider-lookup throttle: immediate second check refused');

-- ================= G. subscription: first purchase, manual renewal extends, auto_renew stays false
select t_su(); drop table t_led; create table t_led as select * from credit_ledger;
select t_srv();
select t_ok($$insert into t_ids select 's1', purchase_create('e5000000-0000-4000-8000-000000000004'::uuid,'subscription','pro','buy-pro-000001')->>'id'$$,'subscription order (pro)');
select t_count($$select 1 where purchase_lookup(t_id('s1'), null) @> '{"kind":"subscription","item_key":"pro","period_days":30,"coins":null,"auto_renew":false,"amount_kwd":14.000}'$$,1,'order snapshots the plan price and a 30 day period');
select t_count($$select 1 where trainer_access('e5000000-0000-4000-8000-000000000004'::uuid)->>'tier' <> 'subscriber'$$,1,'creating an order gives no access');
select t_count($$select 1 where purchase_apply(t_id('s1'),'CAPTURED',13.999,'KWD','trk-s1','{}'::jsonb,'webhook')->>'outcome'='rejected_amount_or_currency_mismatch'$$,1,'subscription capture with a wrong amount is rejected');
select t_count($$select 1 where purchase_apply(t_id('s1'),'NOT CAPTURED',14.000,'KWD',null,'{}'::jsonb,'webhook') @> '{"outcome":"applied","status":"failed"}'$$,1,'a declined subscription payment fails the order');
select t_su();
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004'$$,0,'no subscription row after a rejected and a failed payment');
select t_count($$(select * from credit_ledger except select * from t_led)$$,0,'and no credits');
select t_srv();
select t_ok($$insert into t_ids select 's2', purchase_create('e5000000-0000-4000-8000-000000000004'::uuid,'subscription','pro','buy-pro-000002')->>'id'$$,'second attempt, new order');
select t_count($$select 1 where purchase_apply(t_id('s2'),'CAPTURED',14.000,'KWD','trk-s2','{}'::jsonb,'webhook') @> '{"outcome":"applied","status":"paid","fulfilled":true}'$$,1,'first purchase: paid and fulfilled');
select t_count($$select 1 where purchase_apply(t_id('s2'),'CAPTURED',14.000,'KWD','trk-s2','{}'::jsonb,'reconcile')->>'outcome'='duplicate'$$,1,'duplicate capture is a no-op');
select t_count($$select 1 where purchase_apply(t_id('s2'),'CAPTURED',14.000,'KWD','trk-s2','{}'::jsonb,'status')->>'outcome'='duplicate'$$,1,'status check after the webhook is a no-op');
select t_su();
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004'$$,1,'exactly one subscription row after three CAPTURED events');
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='active' and plan_key='pro' and auto_renew = false and activation_key='order:'||t_id('s2')::text
  and abs(extract(epoch from current_period_end - (now() + interval '30 days'))) < 60$$,1,'active pro subscription, ends in 30 days, auto_renew FALSE');
select t_count($$select 1 from purchase_orders o join subscriptions s on s.id = o.subscription_id where o.id=t_id('s2') and s.user_id=o.user_id$$,1,'the order points at the subscription it activated');
select t_count($$select 1 from credit_ledger where user_id='e5000000-0000-4000-8000-000000000004' and source='subscription' and amount=25000$$,1,'monthly credits of the plan granted exactly once');
select t_count($$select 1 where trainer_access('e5000000-0000-4000-8000-000000000004'::uuid) @> '{"tier":"subscriber","plan_key":"pro","auto_renew":false}'$$,1,'trainer access: subscriber, auto_renew false');
insert into t_ids select 'end1', current_period_end::text from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='active';
-- manual renewal while the period is still running: the new period is ADDED to the remaining one
select t_srv();
select t_ok($$insert into t_ids select 's3', purchase_create('e5000000-0000-4000-8000-000000000004'::uuid,'subscription','pro','buy-pro-000003')->>'id'$$,'manual renewal order');
select t_count($$select 1 where purchase_apply(t_id('s3'),'CAPTURED',14.000,'KWD','trk-s3','{}'::jsonb,'webhook') @> '{"outcome":"applied","fulfilled":true}'$$,1,'renewal paid and fulfilled');
select t_count($$select 1 where purchase_apply(t_id('s3'),'CAPTURED',14.000,'KWD','trk-s3','{}'::jsonb,'webhook')->>'outcome'='duplicate'$$,1,'duplicate renewal webhook is a no-op');
select t_su();
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='active'$$,1,'still exactly one ACTIVE subscription');
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='active' and auto_renew = false
  and current_period_end = (select v::timestamptz from t_ids where k='end1') + interval '30 days'$$,1,'renewal EXTENDS: new end = previous end + 30 days (remainder kept)');
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='active' and current_period_end > now() + interval '59 days'$$,1,'about 60 days of access after two purchases');
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='expired' and auto_renew = false$$,1,'the previous row is closed (history kept)');
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004'$$,2,'two subscription rows for two paid orders (duplicates created none)');
select t_count($$select 1 from credit_ledger where user_id='e5000000-0000-4000-8000-000000000004' and source='subscription' and amount=25000$$,2,'monthly credits granted once per paid order');
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and auto_renew$$,0,'no row of this member has auto_renew on');
-- renewal after the period ran out: starts from now, not from the old end
update subscriptions set current_period_end = now() - interval '3 days' where user_id='e5000000-0000-4000-8000-000000000004' and status='active';
select t_srv();
select t_ok($$insert into t_ids select 's4', purchase_create('e5000000-0000-4000-8000-000000000004'::uuid,'subscription','essential','buy-ess-000004')->>'id'$$,'purchase after the period lapsed (another plan)');
select t_count($$select 1 where purchase_apply(t_id('s4'),'CAPTURED',7.000,'KWD','trk-s4','{}'::jsonb,'webhook') @> '{"outcome":"applied","fulfilled":true}'$$,1,'paid and fulfilled');
select t_su();
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000004' and status='active' and plan_key='essential' and auto_renew = false
  and abs(extract(epoch from current_period_end - (now() + interval '30 days'))) < 60$$,1,'a lapsed member gets 30 days from NOW');
-- a plan that was disabled between checkout and capture: the order stays PAID, is retried, and is fulfilled exactly once
select t_srv();
select t_ok($$insert into t_ids select 's5', purchase_create('e5000000-0000-4000-8000-000000000005'::uuid,'subscription','elite','buy-elite-00001')->>'id'$$,'elite order for member 5');
select t_su(); update plans set enabled = false where key = 'elite'; select t_srv();
select t_count($$select 1 where purchase_apply(t_id('s5'),'CAPTURED',26.000,'KWD','trk-s5','{}'::jsonb,'webhook') @> '{"outcome":"paid_unfulfilled","status":"paid","fulfilled":false}'$$,1,'capture for a plan disabled meanwhile: order is PAID but not fulfilled');
select t_count($$select 1 from purchase_overdue(20) o where (o->>'id')::uuid = t_id('s5')$$,1,'the reconciler picks the paid-but-unfulfilled order up');
select t_count($$select 1 where purchase_apply(t_id('s5'),'FAILED',26.000,'KWD','trk-s5','{}'::jsonb,'webhook')->>'outcome'='ignored_downgrade'$$,1,'a paid-but-unfulfilled order still cannot be downgraded');
select t_su();
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000005'$$,0,'nothing was activated yet');
select t_count($$select 1 from purchase_events where order_id=t_id('s5') and outcome='paid_unfulfilled' and details ? 'error'$$,1,'the reason is logged');
update plans set enabled = true where key = 'elite'; select t_srv();
select t_count($$select 1 where purchase_apply(t_id('s5'),'CAPTURED',26.000,'KWD','trk-s5','{}'::jsonb,'reconcile') @> '{"outcome":"fulfilled_on_retry","status":"paid","fulfilled":true}'$$,1,'the retry fulfils the paid order');
select t_count($$select 1 where purchase_apply(t_id('s5'),'CAPTURED',26.000,'KWD','trk-s5','{}'::jsonb,'reconcile')->>'outcome'='duplicate'$$,1,'a further retry is a no-op');
select t_count($$select 1 from purchase_overdue(20) o where (o->>'id')::uuid = t_id('s5')$$,0,'nothing left for the reconciler');
select t_su();
select t_count($$select 1 from subscriptions where user_id='e5000000-0000-4000-8000-000000000005' and status='active' and plan_key='elite' and auto_renew = false$$,1,'exactly one elite subscription for member 5');
select t_count($$select 1 from credit_ledger where user_id='e5000000-0000-4000-8000-000000000005' and source='subscription'$$,1,'and exactly one credit grant');
select t_count($$select 1 from security_events where user_id='e5000000-0000-4000-8000-000000000005' and event='purchase.paid'$$,1,'purchase.paid logged once, not on the retry');
select t_count($$select 1 from subscriptions where auto_renew and activation_key like 'order:%'$$,0,'NO subscription activated by a purchase order has auto_renew on');
select t_count($$select 1 from purchase_orders where auto_renew$$,0,'no order has auto_renew on');
-- members cannot see or touch other members' subscriptions through orders
select t_sess('e5000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-0000000000a2');
select t_count($$select id from purchase_orders where kind='subscription'$$,0,'member 2 sees no subscription orders of others');
-- admin (aal2) reads orders and events through RLS, but still cannot write
select t_owner(false);
select t_count($$select 1 where (select count(*) from purchase_orders) >= 10$$,1,'owner (aal2) reads all orders');
select t_count($$select 1 where (select count(*) from purchase_events) >= 20$$,1,'owner (aal2) reads purchase events');
select t_err($$update purchase_orders set status='paid', paid_at=now() where status='pending'$$,'owner cannot mark orders paid by hand');
select t_err($$delete from purchase_events$$,'owner cannot delete purchase events');
select t_su();
-- leave the catalogue as the migrations define it (see the note at the top)
select t_su(); update plans set enabled = false where key in ('essential','pro','elite','vip'); update coin_packs set enabled = (key in ('starter','plus','value'));
select 'PASS '||label from t_results where ok union all select 'FAIL '||label from t_results where not ok union all select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
