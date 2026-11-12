-- VORA Phase 1 / milestone 3B: enforcement. Replaces FOUR RLS policies and ONE function from milestone 1/2 so that
-- member reads of credit/AI data require the trusted, active session. Apply ONLY after the Edge Functions enforce the same rule
-- (ai-coach does) and after the owner approved it. Rollback script: supabase/rollback/20261118_m3b_rollback.sql.
begin;
-- M1/M2 member policies now require the trusted session too
drop policy "Members read own ledger" on public.credit_ledger;
create policy "Members read own ledger (trusted session)" on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id and (select public.is_trusted_session()));
drop policy "Members read own reservations" on public.credit_reservations;
create policy "Members read own reservations (trusted session)" on public.credit_reservations for select to authenticated using ((select auth.uid()) = user_id and (select public.is_trusted_session()));
drop policy "Members read own trial grant" on public.trial_grants;
create policy "Members read own trial grant (trusted session)" on public.trial_grants for select to authenticated using ((select auth.uid()) = user_id and (select public.is_trusted_session()));
drop policy "Members read own AI jobs" on public.ai_jobs;
create policy "Members read own AI jobs (trusted session)" on public.ai_jobs for select to authenticated using ((select auth.uid()) = user_id and (select public.is_trusted_session()));
create or replace function public.my_credit_balance() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_trusted_session() then raise exception 'trusted session required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'promo', public.credit_source_balance(auth.uid(), 'promo'), 'reward', public.credit_source_balance(auth.uid(), 'reward'),
    'subscription', public.credit_source_balance(auth.uid(), 'subscription'), 'purchased', public.credit_source_balance(auth.uid(), 'purchased'),
    'total', (select coalesce(sum(amount), 0) from public.credit_ledger where user_id = auth.uid()),
    'held', (select coalesce(sum(credits), 0) from public.credit_reservations where user_id = auth.uid() and status = 'reserved'));
end $$;

revoke all on function public.my_credit_balance() from public, anon, authenticated, service_role;
grant execute on function public.my_credit_balance() to authenticated;
commit;
