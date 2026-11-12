-- Day 10: abandoned-checkout reconciliation scheduler. No shared secret is needed: the sweep endpoint is throttled here,
-- and it can only apply outcomes the payment provider itself confirms (or expire an already-overdue open checkout).
create table public.payment_sweep_state (id int primary key default 1 check (id = 1), last_run timestamptz not null default 'epoch');
insert into public.payment_sweep_state default values;
alter table public.payment_sweep_state enable row level security;
revoke all on public.payment_sweep_state from anon, authenticated;

create or replace function public.payment_sweep_gate() returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.payment_sweep_state set last_run = now() where id = 1 and last_run < now() - interval '45 seconds';
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.payment_sweep_gate() from public, anon, authenticated;
grant execute on function public.payment_sweep_gate() to service_role;
