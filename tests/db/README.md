Local database tests (no Supabase needed): start a scratch Postgres 16, load `supabase-stubs.sql` (minimal auth/storage/roles that mimic Supabase),
apply every file in `supabase/migrations/` in order, then run `marketplace-rls.test.sql` with `psql -t -A`. It simulates anonymous, member, trainer and owner callers
through real roles + RLS and prints PASS/FAIL per check.
