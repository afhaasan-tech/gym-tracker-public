\set ON_ERROR_STOP off
create table t_results(n serial, ok boolean, label text);
create or replace function t_as(u uuid) returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub', coalesce(u::text,''), false); set role authenticated; end $$;
create or replace function t_anon() returns void language plpgsql as $$ begin reset role; perform set_config('request.jwt.claim.sub','', false); set role anon; end $$;
create or replace function t_su() returns void language plpgsql as $$ begin reset role; end $$;
create or replace function t_err(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; insert into t_results(ok,label) values (false, label||' (expected an error, got none)');
  exception when others then insert into t_results(ok,label) values (true, label||' -> '||left(sqlerrm,60)); end;
end $$;
create or replace function t_ok(q text, label text) returns void language plpgsql as $$
begin
  begin execute q; insert into t_results(ok,label) values (true,label);
  exception when others then insert into t_results(ok,label) values (false, label||' (unexpected error: '||left(sqlerrm,80)||')'); end;
end $$;
create or replace function t_count(q text, expected int, label text) returns void language plpgsql as $$
declare n int; begin
  begin execute 'select count(*) from ('||q||') s' into n; insert into t_results(ok,label) values (n=expected, label||' [got '||n||', want '||expected||']');
  exception when others then insert into t_results(ok,label) values (false, label||' (error: '||left(sqlerrm,80)||')'); end;
end $$;

-- actors
insert into auth.users(id,email,email_confirmed_at) values
 ('a0000000-0000-4000-8000-00000000000a','owner@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000b','trainer@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000c','member@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000d','member2@t.test',now());
insert into admins(user_id) values ('a0000000-0000-4000-8000-00000000000a');

-- anonymous baseline
select t_anon();
select t_count($$select 1 from services$$, 10, 'anon sees only the 10 published services (4 platform + 6 demo-trainer)');
select t_count($$select 1 from trainer_profiles$$, 3, 'anon sees only the 3 approved demo trainers');
select t_count($$select 1 from sports$$, 28, 'anon sees the active sports catalog');
select t_err($$select * from admins$$, 'anon cannot read admins');
select t_err($$select * from bookings$$, 'anon cannot read bookings');
select t_err($$select * from platform_settings$$, 'anon cannot read platform settings');
select t_count($$select 1 from public_slots('e0000000-0000-4000-8000-000000000001')$$, 118, 'anon sees public availability of a published service');
select t_err($$select slot_taken('00000000-0000-0000-0000-000000000000')$$, 'anon cannot call slot_taken directly');

-- trainer application
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$insert into trainer_profiles(display_name,bio,formats,locations) values ('Coach T','bio','{online,in_person}','{Hawalli}')$$, 'member creates own trainer application (draft)');
select t_err($$insert into trainer_profiles(user_id,display_name) values ('a0000000-0000-4000-8000-00000000000c','forged')$$, 'cannot create an application for someone else');
select t_err($$update trainer_profiles set status='approved' where user_id=auth.uid()$$, 'applicant cannot approve themselves');
select t_err($$select submit_trainer_application()$$, 'cannot submit without a sport');
select t_ok($$insert into trainer_sports(trainer_id,sport_id) select auth.uid(), id from sports where slug in ('yoga','karate')$$, 'applicant lists specializations');
select t_ok($$select submit_trainer_application()$$, 'application submitted');
select t_err($$select owner_review_trainer(auth.uid(),'approved')$$, 'applicant cannot call owner_review_trainer');
select t_err($$insert into services(name,price_kwd,sport_id) select 'x',1,id from sports where slug='yoga'$$, 'unapproved trainer cannot propose a service');
select t_count($$select 1 from trainer_profiles$$, 4, 'applicant sees approved trainers + own application');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_count($$select 1 from trainer_profiles$$, 3, 'other members do NOT see the pending application');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from trainer_profiles$$, 4, 'owner sees the pending application');
select t_ok($$select owner_review_trainer('a0000000-0000-4000-8000-00000000000b','approved')$$, 'owner approves the trainer');
select t_count($$select 1 from owner_list_users()$$, 4, 'owner lists users (demo accounts hidden)');
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_err($$select * from owner_list_users()$$, 'member cannot list users');
select t_err($$select owner_review_trainer('a0000000-0000-4000-8000-00000000000c','approved')$$, 'member cannot approve trainers');
select t_count($$select 1 from platform_settings$$, 0, 'member sees no platform settings');
select t_err($$insert into sports(slug,name_ar,name_en,category) values ('hack','x','x','team')$$, 'member cannot add sports');
select t_err($$select * from admins$$, 'member cannot read admins');

-- services lifecycle
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_err($$insert into services(name,price_kwd,sport_id,status) select 'x',1,id,'published' from sports where slug='yoga'$$, 'trainer cannot insert a service as published');
select t_err($$insert into services(name,price_kwd,sport_id,trainer_id) select 'x',1,id,'a0000000-0000-4000-8000-00000000000c' from sports where slug='yoga'$$, 'trainer cannot assign a service to another trainer');
select t_err($$insert into services(name,price_kwd,sport_id) select 'x',1,id from sports where slug='football'$$, 'trainer cannot propose a sport outside their specializations');
select t_ok($$insert into services(name,description,price_kwd,sport_id,format,delivery,capacity,min_age,max_age) select 'Yoga test','d',7,id,'group','online',3,18,60 from sports where slug='yoga'$$, 'trainer proposes a yoga service (draft)');
select t_ok($$insert into services(name,description,price_kwd,sport_id,format,delivery,capacity,min_age,max_age) select 'Karate kids','d',5,id,'private','in_person',1,8,12 from sports where slug='karate'$$, 'trainer proposes a karate service (draft)');
select t_count($$select 1 from services where name in ('Yoga test','Karate kids') and status='draft'$$, 2, 'new services are forced to draft');
select t_err($$update services set status='published' where id=(select id from services where name='Yoga test')$$, 'trainer cannot publish their own service');
select t_err($$update services set price_kwd=0.001, is_available=true where id=(select id from services where name='Yoga test')$$, 'trainer cannot touch is_available');
select t_ok($$select trainer_set_service_status((select id from services where name='Yoga test'),'submitted')$$, 'trainer submits yoga service for approval');
select t_ok($$select trainer_set_service_status((select id from services where name='Karate kids'),'submitted')$$, 'trainer submits karate service for approval');
select t_err($$select trainer_set_service_status((select id from services where name='Yoga test'),'published')$$, 'trainer cannot publish through the status function');
select t_err($$select owner_review_service((select id from services where name='Yoga test'),'published')$$, 'trainer cannot call owner_review_service');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_count($$select 1 from services where name in ('Yoga test','Karate kids')$$, 0, 'other members cannot see draft or submitted services');
select t_anon();
select t_count($$select 1 from services where name in ('Yoga test','Karate kids')$$, 0, 'anon cannot see draft or submitted services');
select t_count($$select 1 from public_slots((select id from services where name='Yoga test'))$$, 0, 'anon gets no slots for an unpublished service');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_count($$select 1 from services where name in ('Yoga test','Karate kids')$$, 2, 'trainer sees own services');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from services where name in ('Yoga test','Karate kids') and status='submitted'$$, 2, 'owner sees submitted services awaiting approval');
select t_err($$select owner_review_service((select id from services where name='Karate kids'),'published')$$, 'owner cannot publish a review-required sport (karate) without confirming qualifications');
select t_ok($$select owner_review_service((select id from services where name='Karate kids'),'published',true)$$, 'owner publishes karate after confirming qualifications');
select t_ok($$select owner_review_service((select id from services where name='Yoga test'),'published')$$, 'owner publishes the yoga service');
select t_anon();
select t_count($$select 1 from services where name in ('Yoga test','Karate kids')$$, 2, 'anon now sees the two published trainer services');

-- trainer edits a published service -> goes back to review and disappears publicly
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$update services set price_kwd = 99 where id=(select id from services where name='Yoga test')$$, 'trainer changes the price of a published service');
select t_anon();
select t_count($$select 1 from services where id=(select id from services where name='Yoga test')$$, 0, 'price change hides the service until the owner approves again');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$select trainer_set_service_status((select id from services where name='Yoga test'),'archived')$$, 'trainer can archive (unpublish) own service');

-- slots + bookings
select t_ok($$insert into service_slots(service_id,starts_at) values ((select id from services where name='Karate kids'), now()+interval '3 days')$$, 'trainer adds a slot to own service');
select t_ok($$insert into service_slots(service_id,starts_at) values ((select id from services where name='Karate kids'), now()+interval '4 days')$$, 'trainer adds a second slot');
select t_err($$insert into service_slots(service_id,starts_at) values ('e0000000-0000-4000-8000-000000000001', now()+interval '3 days')$$, 'trainer cannot add slots to someone else''s service');
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_err($$insert into service_slots(service_id,starts_at) values ((select id from services where name='Karate kids'), now()+interval '5 days')$$, 'member cannot add slots');
select t_err($$insert into bookings(service_id,scheduled_at) values ((select id from services where name='Karate kids'), now()+interval '3 days')$$, 'booking a service with slots requires choosing a slot');
select t_err($$insert into bookings(service_id,slot_id) select service_id,id from service_slots where service_id=(select id from services where name='Karate kids') limit 1$$, 'minor-age service requires guardian consent');
select t_ok($$insert into bookings(service_id,slot_id,guardian_consent) select service_id,id,true from service_slots where service_id=(select id from services where name='Karate kids') order by starts_at limit 1$$, 'member books a slot with guardian consent');
select t_count($$select 1 from bookings where id=(select id from bookings where service_id=(select id from services where name='Karate kids') order by created_at limit 1) and price_kwd=5 and payment_status='pending' and booking_status='pending' and trainer_id='a0000000-0000-4000-8000-00000000000b'$$, 1, 'booking: server price 5, pending/pending, trainer linked');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent,payment_status) select service_id,id,true,'paid' from service_slots where service_id=(select id from services where name='Karate kids') order by starts_at desc limit 1$$, 'customer cannot insert payment_status');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent,price_kwd) select service_id,id,true,0 from service_slots where service_id=(select id from services where name='Karate kids') order by starts_at desc limit 1$$, 'customer cannot insert a price');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent,trainer_id) select service_id,id,true,user_id from service_slots,(select 'a0000000-0000-4000-8000-00000000000c'::uuid user_id) u where service_id=(select id from services where name='Karate kids') order by starts_at desc limit 1$$, 'customer cannot choose the trainer');
select t_err($$update bookings set payment_status='paid' where id=(select id from bookings where service_id=(select id from services where name='Karate kids') order by created_at limit 1)$$, 'customer cannot update payment_status');
select t_err($$update bookings set participants=9 where id=(select id from bookings where service_id=(select id from services where name='Karate kids') order by created_at limit 1)$$, 'customer cannot update participants');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent) select service_id,id,true from service_slots where service_id=(select id from services where name='Karate kids') order by starts_at limit 1$$, 'private capacity-1 slot cannot be booked twice');
select t_count($$select 1 from bookings$$, 0, 'another member sees none of the first member''s bookings');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_count($$select 1 from bookings$$, 1, 'trainer sees exactly the bookings of their own services');
select t_err($$update bookings set payment_status='paid' where id=(select id from bookings where service_id=(select id from services where name='Karate kids') order by created_at limit 1)$$, 'trainer cannot update payment_status');
select t_err($$update bookings set price_kwd=0 where id=(select id from bookings where service_id=(select id from services where name='Karate kids') order by created_at limit 1)$$, 'trainer cannot update price');
select t_ok($$update bookings set booking_status='confirmed' where id=(select id from bookings where service_id=(select id from services where name='Karate kids') order by created_at limit 1)$$, 'trainer can confirm a booking of their own service');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from bookings$$, 1, 'owner sees platform-wide bookings');
-- booking a PLATFORM demo (existing flow, no slots needed? it has slots seeded only for demo trainers) 
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_ok($$insert into bookings(service_id,scheduled_at) select id, now()+interval '5 days' from services where platform_owned limit 1$$, 'original platform demo service still books with a free date/time');
select t_count($$select 1 from bookings where trainer_id is null and price_kwd>0$$, 1, 'platform booking has a server-set price and no trainer');

-- suspension
select t_su();
create table t_slot as select id, service_id from service_slots where service_id=(select id from services where name='Karate kids') order by starts_at desc limit 1;
grant select on t_slot to authenticated;
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_review_trainer('a0000000-0000-4000-8000-00000000000b','suspended')$$, 'owner suspends the trainer');
select t_anon();
select t_count($$select 1 from services where name in ('Yoga test','Karate kids')$$, 0, 'suspended trainer''s services disappear from the public catalog');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent) select service_id,id,true from t_slot$$, 'cannot book a suspended trainer''s service');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_err($$insert into services(name,price_kwd,sport_id) select 'x',1,id from sports where slug='yoga'$$, 'suspended trainer cannot propose services');

-- private applicant documents
select t_su();
insert into storage.objects(bucket_id,name,owner) values ('trainer-documents','a0000000-0000-4000-8000-00000000000b/license.pdf','a0000000-0000-4000-8000-00000000000b');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_count($$select 1 from storage.objects where bucket_id='trainer-documents'$$, 0, 'other members cannot see applicant documents');
select t_err($$insert into storage.objects(bucket_id,name,owner) values ('trainer-documents','a0000000-0000-4000-8000-00000000000b/evil.pdf','a0000000-0000-4000-8000-00000000000d')$$, 'cannot upload into another applicant''s folder');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_count($$select 1 from storage.objects where bucket_id='trainer-documents'$$, 1, 'applicant sees own document');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from storage.objects where bucket_id='trainer-documents'$$, 1, 'owner can read applicant documents');
select t_anon();
select t_err($$select * from storage.objects$$, 'anon has no access to storage objects');

-- owner-only management
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$insert into sports(slug,name_ar,name_en,category) values ('cricket','كريكيت','Cricket','team')$$, 'owner adds a sport');
select t_ok($$update sports set is_active=false where slug='cricket'$$, 'owner deactivates a sport');
select t_anon();
select t_count($$select 1 from sports where slug='cricket'$$, 0, 'inactive sports are hidden from the public');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$update platform_settings set value='5'::jsonb where key='commission_percent'$$, 'owner edits platform settings');

select t_su();
select (case when ok then 'PASS ' else 'FAIL ' end)||label as result from t_results order by n;
select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
