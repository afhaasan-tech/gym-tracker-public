-- Shared AI rate limit (both Edge Functions): 5 requests / rolling 60 s per user, enforced server-side
create table public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);
alter table public.ai_requests enable row level security;  -- no policies: only the service role can touch it

create or replace function public.consume_ai_request(p_user uuid, p_limit int default 5, p_window interval default interval '1 minute')
returns table (allowed boolean, retry_after_seconds int)
language plpgsql security definer set search_path = public as $$
declare used int; oldest timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));  -- serialize concurrent calls per user
  select count(*), min(created_at) into used, oldest
    from ai_requests where user_id = p_user and created_at > now() - p_window;
  if used >= p_limit then
    return query select false, greatest(1, ceil(extract(epoch from (oldest + p_window - now())))::int);
  else
    insert into ai_requests (user_id) values (p_user);
    return query select true, 0;
  end if;
end $$;
revoke all on function public.consume_ai_request(uuid, int, interval) from public, anon, authenticated;
grant execute on function public.consume_ai_request(uuid, int, interval) to service_role;
