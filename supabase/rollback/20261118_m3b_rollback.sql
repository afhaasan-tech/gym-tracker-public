-- Restores the milestone-1/2 member policies and my_credit_balance() exactly as they were before M3B.
begin;
drop policy "Members read own ledger (trusted session)" on public.credit_ledger;
create policy "Members read own ledger" on public.credit_ledger for select to authenticated using ((select auth.uid()) = user_id);
drop policy "Members read own reservations (trusted session)" on public.credit_reservations;
create policy "Members read own reservations" on public.credit_reservations for select to authenticated using ((select auth.uid()) = user_id);
drop policy "Members read own trial grant (trusted session)" on public.trial_grants;
create policy "Members read own trial grant" on public.trial_grants for select to authenticated using ((select auth.uid()) = user_id);
drop policy "Members read own AI jobs (trusted session)" on public.ai_jobs;
create policy "Members read own AI jobs" on public.ai_jobs for select to authenticated using ((select auth.uid()) = user_id);
create or replace function public.my_credit_balance() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'promo', public.credit_source_balance(auth.uid(), 'promo'), 'reward', public.credit_source_balance(auth.uid(), 'reward'),
    'subscription', public.credit_source_balance(auth.uid(), 'subscription'), 'purchased', public.credit_source_balance(auth.uid(), 'purchased'),
    'total', (select coalesce(sum(amount), 0) from public.credit_ledger where user_id = auth.uid()),
    'held', (select coalesce(sum(credits), 0) from public.credit_reservations where user_id = auth.uid() and status = 'reserved'));
$$;
revoke all on function public.my_credit_balance() from public, anon, authenticated, service_role;
grant execute on function public.my_credit_balance() to authenticated;
commit;
