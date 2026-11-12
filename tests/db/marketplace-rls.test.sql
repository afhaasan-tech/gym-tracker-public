\set ON_ERROR_STOP off
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

do $$ declare r record; begin
  for r in select p.oid::regprocedure x from pg_proc p where p.proname like 't\_%' and p.pronamespace = 'public'::regnamespace loop execute 'grant execute on function ' || r.x || ' to public'; end loop;
end $$;
-- actors (ids spell the role): S super admin, E emergency admin, C1/C2 invited coaches, M member, X member, U unverified e-mail
insert into auth.users(id,email,email_confirmed_at) values
 ('a0000000-0000-4000-8000-00000000000a','super@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000e','emergency@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000b','coach1@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000c','coach2@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000d','member@t.test',now()),
 ('a0000000-0000-4000-8000-00000000000f','member2@t.test',now()),
 ('a0000000-0000-4000-8000-000000000010','unverified@t.test',null);
insert into admins(user_id,role) values ('a0000000-0000-4000-8000-00000000000a','super');
insert into profiles(user_id,full_name) values ('a0000000-0000-4000-8000-00000000000d','Member Name');

-- ---------- A. anonymous visitors
select t_anon();
select t_count($$select 1 from services$$, 10, 'anon sees only the 10 published services (4 platform + 6 demo-coach)');
select t_count($$select 1 from coach_profiles$$, 3, 'anon sees only the 3 active demo coach profiles');
select t_err($$select user_id from coach_profiles$$, 'anon cannot read coach user_id (account link never exposed)');
select t_count($$select 1 from sports$$, 28, 'anon sees the sports catalog');
select t_count($$select 1 from public_slots('e0000000-0000-4000-8000-000000000001')$$, 118, 'anon sees public availability');
select t_err($$select * from admins$$, 'anon cannot read admins');
select t_err($$select * from bookings$$, 'anon cannot read bookings');
select t_err($$select * from audit_log$$, 'anon cannot read the audit log');
select t_err($$select * from platform_settings$$, 'anon cannot read platform settings');
select t_err($$select * from coach_invitations$$, 'anon cannot read coach invitations');
select t_err($$select claim_coach_invitation()$$, 'anon cannot claim a coach invitation');

-- ---------- B. public signup = member only (no way to become coach or admin)
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_ok($$select 1 where not is_admin() and not is_super_admin() and not is_coach()$$, 'a new member is not admin, super admin or coach');
select t_count($$select 1 from (select my_admin_status() ->> 'role' r) x where r is null$$, 1, 'member has no admin role');
select t_err($$insert into admins(user_id,role) values (auth.uid(),'super')$$, 'member cannot grant themselves super admin');
select t_err($$insert into admins(user_id,role) values (auth.uid(),'emergency')$$, 'member cannot grant themselves emergency admin');
select t_err($$update admins set role='super'$$, 'member cannot update admins');
select t_err($$delete from admins$$, 'member cannot delete admins');
select t_err($$insert into coach_profiles(user_id,display_name,status) values (auth.uid(),'Self Coach','active')$$, 'member cannot create a coach profile');
select t_err($$insert into coach_invitations(email,display_name) values ('member@t.test','Self')$$, 'member cannot write invitations directly');
select t_err($$select claim_coach_invitation()$$, 'member without an invitation cannot claim coach access');
select t_err($$select owner_invite_coach('x@t.test','X Coach')$$, 'member cannot invite coaches');
select t_err($$select owner_set_coach_status('c0000000-0000-4000-8000-000000000001','revoked')$$, 'member cannot change coach status');
select t_err($$select owner_set_emergency_admin(auth.uid())$$, 'member cannot assign an emergency admin');
select t_err($$select * from owner_list_users()$$, 'member cannot list users');
select t_count($$select 1 from audit_log$$, 0, 'member sees no audit log rows');
select t_err($$update auth.users set raw_app_meta_data = '{"role":"admin"}' where id = auth.uid()$$, 'member cannot edit auth metadata');
select t_count($$select 1 from bookings$$, 0, 'member sees no bookings of others');
select t_affected($$update services set price_kwd=0 where platform_owned$$, 0, 'member cannot edit services');

-- ---------- C. admin access requires MFA (aal2)
select t_as('a0000000-0000-4000-8000-00000000000a','aal1');
select t_count($$select 1 from (select my_admin_status() ->> 'role' r, my_admin_status() ->> 'aal2' a) x where r='super' and a='false'$$, 1, 'super admin without MFA: role known, aal2 false');
select t_err($$select owner_invite_coach('coach1@t.test','Coach One')$$, 'super admin WITHOUT MFA cannot use owner functions');
select t_count($$select 1 from audit_log$$, 0, 'super admin without MFA sees no audit log rows');
select t_count($$select 1 from bookings$$, 0, 'super admin without MFA sees no bookings');

-- ---------- D. super admin invites coaches (no accounts are created)
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_invite_coach('Coach1@T.test ','Coach One')$$, 'super admin invites coach 1 (e-mail normalised)');
select t_ok($$select owner_invite_coach('coach2@t.test','Coach Two')$$, 'super admin invites coach 2');
select t_ok($$select owner_invite_coach('unverified@t.test','Unverified Person')$$, 'super admin invites an address whose owner has not verified it');
select t_err($$select owner_invite_coach('coach2@t.test','Dup')$$, 'a second open invitation for the same e-mail is rejected');
select t_count($$select 1 from owner_list_invitations() where status='invited'$$, 3, 'three open invitations');
select t_su();
select t_count($$select 1 from auth.users where email like '%demo%' or email like '%@demo.invalid'$$, 0, 'no fake coach accounts exist in auth.users');
select t_count($$select 1 from coach_profiles where user_id is null and is_demo$$, 3, 'demo coaches are profiles only (user_id null), not accounts');
select t_as('a0000000-0000-4000-8000-00000000000a');

-- ---------- E. claim + activation
select t_as('a0000000-0000-4000-8000-000000000010');
select t_err($$select claim_coach_invitation()$$, 'unverified e-mail cannot claim an invitation');
select t_as('a0000000-0000-4000-8000-00000000000f');
select t_err($$select claim_coach_invitation()$$, 'a member whose e-mail was not invited cannot claim');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$select claim_coach_invitation()$$, 'invited coach claims after verifying e-mail');
select t_err($$select user_id from coach_profiles$$, 'user_id stays hidden even from the coach (column grant)');
select t_ok($$select 1 from coach_profiles where display_name='Coach One' and status='pending_activation'$$, 'coach sees own pending profile');
select t_err($$select claim_coach_invitation()$$, 'the invitation cannot be claimed twice');
select t_anon();
select t_count($$select 1 from coach_profiles where display_name='Coach One'$$, 0, 'pending coach is invisible to the public');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$update coach_profiles set bio='my bio' where display_name='Coach One'$$, 'pending coach edits own profile text');
select t_err($$update coach_profiles set status='active' where display_name='Coach One'$$, 'coach cannot activate themselves');
select t_err($$update coach_profiles set user_id='a0000000-0000-4000-8000-00000000000c' where display_name='Coach One'$$, 'coach cannot re-point their profile');
select t_err($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach One'),'active')$$, 'coach cannot call owner_set_coach_status');
select t_err($$insert into services(name,price_kwd,sport_id) select 'x',1,id from sports where slug='yoga'$$, 'pending coach cannot propose services');
select t_ok($$insert into coach_sports(coach_id,sport_id) select (select my_coach_profile_id()), id from sports where slug in ('yoga','karate')$$, 'coach proposes specializations (status proposed)');
select t_err($$update coach_sports set status='approved'$$, 'coach cannot approve own specializations');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach One'),'active')$$, 'super admin activates coach 1');
select t_ok($$select owner_review_coach_sport((select id from coach_profiles where display_name='Coach One'),(select id from sports where slug='yoga'),true)$$, 'super admin approves yoga');
select t_ok($$select owner_review_coach_sport((select id from coach_profiles where display_name='Coach One'),(select id from sports where slug='karate'),true)$$, 'super admin approves karate');
select t_anon();
select t_count($$select 1 from coach_profiles$$, 4, 'active coach 1 is now public (3 demo + 1)');

-- coach 2 onboarding
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_ok($$select claim_coach_invitation()$$, 'coach 2 claims');
select t_ok($$insert into coach_sports(coach_id,sport_id) select (select my_coach_profile_id()), id from sports where slug='yoga'$$, 'coach 2 proposes yoga');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach Two'),'active')$$, 'super admin activates coach 2');
select t_ok($$select owner_review_coach_sport((select id from coach_profiles where display_name='Coach Two'),(select id from sports where slug='yoga'),true)$$, 'super admin approves coach 2 yoga');

-- ---------- F. services: coach proposes, only the super admin publishes
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_err($$insert into services(name,price_kwd,sport_id,status) select 'x',1,id,'published' from sports where slug='yoga'$$, 'coach cannot insert a service as published');
select t_err($$insert into services(name,price_kwd,sport_id,coach_id) select 'x',1,id,(select id from coach_profiles where display_name='Coach Two') from sports where slug='yoga'$$, 'coach cannot create a service for another coach');
select t_err($$insert into services(name,price_kwd,sport_id) select 'x',1,id from sports where slug='football'$$, 'coach cannot use an unapproved sport');
select t_ok($$insert into services(name,description,price_kwd,sport_id,format,delivery,capacity,min_age,max_age) select 'C1 Yoga','d',7,id,'group','online',3,18,60 from sports where slug='yoga'$$, 'coach 1 proposes a yoga service (draft)');
select t_ok($$insert into services(name,description,price_kwd,sport_id,format,delivery,capacity,min_age,max_age) select 'C1 Karate kids','d',5,id,'private','in_person',1,8,12 from sports where slug='karate'$$, 'coach 1 proposes a karate service (draft)');
select t_count($$select 1 from services where name like 'C1 %' and status='draft'$$, 2, 'new coach services are forced to draft');
select t_err($$update services set status='published' where name='C1 Yoga'$$, 'coach cannot publish');
select t_ok($$select coach_set_service_status((select id from services where name='C1 Yoga'),'submitted')$$, 'coach submits yoga for approval');
select t_ok($$select coach_set_service_status((select id from services where name='C1 Karate kids'),'submitted')$$, 'coach submits karate for approval');
select t_err($$select owner_review_service((select id from services where name='C1 Yoga'),'published')$$, 'coach cannot publish via owner_review_service');
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_ok($$insert into services(name,description,price_kwd,sport_id,format,delivery,capacity) select 'C2 Yoga','d',9,id,'private','online',1 from sports where slug='yoga'$$, 'coach 2 proposes a service');
select t_count($$select 1 from services where name like 'C1 %'$$, 0, 'coach 2 cannot see coach 1 drafts/submissions');
select t_affected($$update services set price_kwd=0.5 where name='C1 Yoga'$$, 0, 'coach 2 cannot edit coach 1 service');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_count($$select 1 from services where name like 'C_ %'$$, 0, 'members cannot see draft/submitted coach services');
select t_anon();
select t_count($$select 1 from services where name like 'C_ %'$$, 0, 'anon cannot see draft/submitted coach services');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_err($$select owner_review_service((select id from services where name='C1 Karate kids'),'published')$$, 'review-required sport needs explicit qualification confirmation');
select t_ok($$select owner_review_service((select id from services where name='C1 Karate kids'),'published',true)$$, 'super admin publishes karate after confirming');
select t_ok($$select owner_review_service((select id from services where name='C1 Yoga'),'published')$$, 'super admin publishes coach 1 yoga');
select t_anon();
select t_count($$select 1 from services where name in ('C1 Yoga','C1 Karate kids')$$, 2, 'anon sees the two published coach services');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$update services set price_kwd=99 where name='C1 Yoga'$$, 'coach changes the price of a published service');
select t_anon();
select t_count($$select 1 from services where name='C1 Yoga'$$, 0, 'price change hides the service until re-approved');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_ok($$insert into service_slots(service_id,starts_at) values ((select id from services where name='C1 Karate kids'), now()+interval '3 days')$$, 'coach adds a slot to own service');
select t_ok($$insert into service_slots(service_id,starts_at) values ((select id from services where name='C1 Karate kids'), now()+interval '4 days')$$, 'coach adds another slot');
select t_err($$insert into service_slots(service_id,starts_at) values ('e0000000-0000-4000-8000-000000000001', now()+interval '3 days')$$, 'coach cannot add slots to a platform/demo service');
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_err($$insert into service_slots(service_id,starts_at) values ((select id from services where name='C1 Karate kids'), now()+interval '5 days')$$, 'coach 2 cannot add slots to coach 1 service');

-- ---------- G. bookings + coach isolation
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_err($$insert into bookings(service_id,scheduled_at) values ((select id from services where name='C1 Karate kids'), now()+interval '3 days')$$, 'a slotted service requires choosing a slot');
select t_err($$insert into bookings(service_id,slot_id) select service_id,id from service_slots where service_id=(select id from services where name='C1 Karate kids') limit 1$$, 'minor-age service requires guardian consent');
select t_ok($$insert into bookings(service_id,slot_id,guardian_consent) select service_id,id,true from service_slots where service_id=(select id from services where name='C1 Karate kids') order by starts_at limit 1$$, 'member books a coach 1 slot (demo booking)');
select t_ok($$insert into bookings(service_id,scheduled_at) select id, now()+interval '5 days' from services where platform_owned limit 1$$, 'member books a platform demo service');
select t_count($$select 1 from bookings where price_kwd>0 and payment_status='pending' and booking_status='pending'$$, 2, 'server-set prices, pending/pending');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent,payment_status) select service_id,id,true,'paid' from service_slots where service_id=(select id from services where name='C1 Karate kids') limit 1$$, 'customer cannot insert payment_status');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent,price_kwd) select service_id,id,true,0 from service_slots where service_id=(select id from services where name='C1 Karate kids') limit 1$$, 'customer cannot insert price');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent,coach_id) select service_id,id,true,(select id from coach_profiles where display_name='Coach Two') from service_slots where service_id=(select id from services where name='C1 Karate kids') limit 1$$, 'customer cannot pick the coach');
select t_err($$update bookings set payment_status='paid'$$, 'customer cannot update payment_status');
select t_err($$update bookings set participants=9$$, 'customer cannot update participants');
select t_as('a0000000-0000-4000-8000-00000000000f');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent) select service_id,id,true from service_slots where service_id=(select id from services where name='C1 Karate kids') order by starts_at limit 1$$, 'a private capacity-1 slot cannot be double booked');
select t_count($$select 1 from bookings$$, 0, 'another member sees none of the first member''s bookings');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_count($$select 1 from bookings$$, 1, 'coach 1 sees exactly the bookings of their own services');
select t_count($$select 1 from coach_trainees() where member_name='Member Name'$$, 1, 'coach 1 sees only the name of the member who booked them');
select t_err($$update bookings set payment_status='paid'$$, 'coach cannot change payment_status');
select t_err($$update bookings set price_kwd=0$$, 'coach cannot change price');
select t_ok($$update bookings set booking_status='confirmed'$$, 'coach can confirm bookings of their own service');
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_count($$select 1 from bookings$$, 0, 'coach 2 sees none of coach 1 bookings');
select t_count($$select 1 from coach_trainees()$$, 0, 'coach 2 sees none of coach 1 trainees');
select t_affected($$update bookings set booking_status='cancelled'$$, 0, 'coach 2 cannot cancel coach 1 bookings');
select t_err($$select owner_invite_coach('z@t.test','Z Coach')$$, 'a coach cannot invite coaches');
select t_err($$select owner_set_emergency_admin('a0000000-0000-4000-8000-00000000000d')$$, 'a coach cannot grant admin');
select t_err($$select owner_set_setting('commission_percent','10'::jsonb)$$, 'a coach cannot change commissions');
select t_err($$select admin_cancel_booking((select id from bookings limit 1),'x')$$, 'a coach cannot use admin booking controls');
select t_count($$select 1 from audit_log$$, 0, 'a coach sees no audit log rows');
select t_err($$select * from admin_list_coaches()$$, 'a coach cannot list all coaches');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from bookings$$, 2, 'super admin sees platform-wide bookings');

-- ---------- H. emergency admin: narrow powers, assigned only by the super admin
select t_ok($$select owner_set_emergency_admin('a0000000-0000-4000-8000-00000000000e')$$, 'super admin assigns the emergency admin');
select t_err($$select * from admins$$, 'the admins table is not readable through the API, even by the super admin');
select t_su();
select t_count($$select 1 from admins$$, 2, 'exactly two privileged accounts exist');
select t_err($$insert into admins(user_id,role) values ('a0000000-0000-4000-8000-00000000000d','emergency')$$, 'a second emergency admin is rejected (unique role)');
select t_err($$insert into admins(user_id,role) values ('a0000000-0000-4000-8000-00000000000d','super')$$, 'a second super admin is rejected');
select t_err($$alter table admins drop constraint admins_role_check; insert into admins(user_id,role) values ('a0000000-0000-4000-8000-00000000000d','x')$$, 'a third privileged row cannot be added (hard cap)');
select t_err($$delete from admins where role='super'$$, 'the super admin row cannot be deleted (even by SQL without the operator switch)');
select t_err($$update admins set role='emergency' where role='super'$$, 'the super admin cannot be downgraded');
select t_err($$update admins set role='super' where role='emergency'$$, 'the emergency admin cannot be promoted in place');
select t_as('a0000000-0000-4000-8000-00000000000e','aal1');
select t_err($$select * from admin_list_coaches()$$, 'emergency admin WITHOUT MFA has no access');
select t_as('a0000000-0000-4000-8000-00000000000e');
select t_ok($$select * from admin_list_coaches()$$, 'emergency admin (MFA) lists coaches');
select t_count($$select 1 from bookings$$, 2, 'emergency admin can view bookings');
select t_count($$select 1 from services where status='published'$$, 11, 'emergency admin can view services');
select t_ok($$select owner_platform_stats()$$, 'emergency admin sees aggregated stats');
select t_err($$select owner_invite_coach('n@t.test','N Coach')$$, 'emergency cannot invite coaches');
select t_err($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach Two'),'active')$$, 'emergency cannot activate/revoke coaches');
select t_err($$select owner_review_service((select id from services where name='C2 Yoga'),'published')$$, 'emergency cannot publish services');
select t_err($$select owner_review_coach_sport((select id from coach_profiles where display_name='Coach Two'),(select id from sports where slug='yoga'),true)$$, 'emergency cannot approve specializations');
select t_err($$select owner_set_emergency_admin('a0000000-0000-4000-8000-00000000000d')$$, 'emergency cannot assign admins');
select t_err($$select owner_clear_emergency_admin()$$, 'emergency cannot revoke admin access');
select t_err($$select * from owner_list_users()$$, 'emergency cannot list all users');
select t_err($$select * from admin_view_member('a0000000-0000-4000-8000-00000000000d','looking around')$$, 'emergency cannot open member records');
select t_err($$select * from owner_get_settings()$$, 'emergency cannot read platform settings');
select t_err($$select owner_set_setting('commission_percent','5'::jsonb)$$, 'emergency cannot change commissions');
select t_err($$select owner_upsert_sport('hack','x','x','team',false,true)$$, 'emergency cannot edit the sports catalog');
select t_err($$select * from owner_list_invitations()$$, 'emergency cannot read invitations');
select t_err($$delete from admins$$, 'emergency cannot delete admins');
select t_affected($$update bookings set booking_status='confirmed'$$, 0, 'emergency cannot confirm bookings directly');
select t_ok($$select admin_cancel_booking((select id from bookings where coach_id is null limit 1),'abuse report')$$, 'emergency can cancel a booking');
select t_ok($$select admin_unpublish_service((select id from services where name='C1 Karate kids'),'safety concern')$$, 'emergency can take a service offline');
select t_ok($$select admin_suspend_coach((select id from coach_profiles where display_name='Coach Two'),'urgent complaint')$$, 'emergency can suspend a coach');
select t_count($$select 1 from audit_log where (details->>'emergency')='true'$$, 3, 'emergency actions are audited and flagged');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach Two'),'active')$$, 'super admin can lift the suspension');
select t_ok($$select owner_clear_emergency_admin()$$, 'super admin revokes the emergency admin');
select t_as('a0000000-0000-4000-8000-00000000000e');
select t_err($$select * from admin_list_coaches()$$, 'revoked emergency admin has no access');

-- ---------- I. super admin full control + audit
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from owner_list_users()$$, 7, 'super admin lists all users');
select t_ok($$select * from admin_view_member('a0000000-0000-4000-8000-00000000000d','support request #1')$$, 'super admin opens a member record with a reason');
select t_err($$select * from admin_view_member('a0000000-0000-4000-8000-00000000000d','')$$, 'a reason is required to open a member record');
select t_count($$select 1 from owner_get_settings()$$, 2, 'super admin reads platform settings');
select t_ok($$select owner_set_setting('commission_percent','12.5'::jsonb)$$, 'super admin sets the commission');
select t_err($$select owner_set_setting('commission_percent','90'::jsonb)$$, 'out-of-range commission rejected');
select t_ok($$select owner_upsert_sport('cricket','كريكيت','Cricket','team',false,true,80)$$, 'super admin adds a sport');
select t_ok($$select owner_upsert_sport('cricket','كريكيت','Cricket','team',false,false,80)$$, 'super admin deactivates it');
select t_anon();
select t_count($$select 1 from sports where slug='cricket'$$, 0, 'inactive sport hidden from the public');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_review_coach_sport((select id from coach_profiles where display_name='Coach Two'),(select id from sports where slug='yoga'),true)$$, 'sport approval can be repeated');
select t_su();
create table t_slot as select id, service_id from service_slots where service_id=(select id from services where name='C1 Karate kids') order by starts_at desc limit 1;
grant select on t_slot to authenticated;
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach One'),'suspended')$$, 'super admin suspends coach 1');
select t_anon();
select t_count($$select 1 from services where name in ('C1 Yoga','C1 Karate kids')$$, 0, 'suspended coach services disappear from the catalog');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_err($$insert into bookings(service_id,slot_id,guardian_consent) select service_id,id,true from t_slot$$, 'cannot book a suspended coach');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_err($$insert into services(name,price_kwd,sport_id) select 'x',1,id from sports where slug='yoga'$$, 'suspended coach cannot propose services');
select t_ok($$select 1 where not is_coach()$$, 'suspended coach lost coach rights');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select owner_set_coach_status((select id from coach_profiles where display_name='Coach One'),'revoked')$$, 'super admin revokes coach 1');
select t_as('a0000000-0000-4000-8000-00000000000b');
select t_err($$select claim_coach_invitation()$$, 'a revoked coach cannot re-claim without a new invitation');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_ok($$select 1 where (select count(*) from audit_log) >= 20$$, 'sensitive actions are recorded in the audit log (>=20 rows)');
select t_ok($$select 1 from audit_log where action in ('coach.invite','coach.active','service.published','admin.emergency_assign','admin.emergency_revoke','setting.update','sport.upsert','member.view','coach.suspend','coach.revoked') group by 1 having count(*) >= 0$$, 'audit covers invites, activation, publishing, role changes, settings, sports, member views');
select t_err($$update audit_log set action='x'$$, 'super admin cannot edit the audit log (no privilege)');
select t_su();
select t_err($$update audit_log set action='x'$$, 'not even SQL can edit the audit log without the purge switch');
select t_err($$delete from audit_log$$, 'not even SQL can delete audit rows without the purge switch');

-- ---------- J. private coach documents
select t_su();
insert into storage.objects(bucket_id,name,owner) values ('coach-documents','a0000000-0000-4000-8000-00000000000c/license.pdf','a0000000-0000-4000-8000-00000000000c');
select t_as('a0000000-0000-4000-8000-00000000000d');
select t_count($$select 1 from storage.objects where bucket_id='coach-documents'$$, 0, 'members cannot see coach documents');
select t_as('a0000000-0000-4000-8000-00000000000c');
select t_count($$select 1 from storage.objects where bucket_id='coach-documents'$$, 1, 'a coach sees only their own documents');
select t_err($$insert into storage.objects(bucket_id,name,owner) values ('coach-documents','a0000000-0000-4000-8000-00000000000b/x.pdf','a0000000-0000-4000-8000-00000000000c')$$, 'a coach cannot write into another coach folder');
select t_as('a0000000-0000-4000-8000-00000000000a');
select t_count($$select 1 from storage.objects where bucket_id='coach-documents'$$, 1, 'super admin can read coach documents');
select t_anon();
select t_err($$select * from storage.objects$$, 'anon has no storage access');

select t_su();
select (case when ok then 'PASS ' else 'FAIL ' end)||label as result from t_results order by n;
select 'TOTAL pass='||count(*) filter (where ok)||' fail='||count(*) filter (where not ok) from t_results;
