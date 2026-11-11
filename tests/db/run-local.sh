#!/usr/bin/env bash
# Builds a throwaway Postgres 16 cluster, loads Supabase-like stubs, applies every migration in order and runs the RLS/role test suite.
# Usage (as root): bash tests/db/run-local.sh     (needs the postgresql-16 server package; runs the cluster as the "postgres" OS user)
set -euo pipefail
B=/usr/lib/postgresql/16/bin; D=/tmp/pgscratch; PORT=54329; HERE="$(cd "$(dirname "$0")/../.." && pwd)"
su postgres -c "$B/pg_ctl -D $D/data stop -m immediate" >/dev/null 2>&1 || true
rm -rf "$D"; mkdir -p "$D"; chown postgres:postgres "$D"
su postgres -c "$B/initdb -D $D/data -A trust >/dev/null && $B/pg_ctl -D $D/data -o '-p $PORT -k /tmp' -l $D/log -w start" >/dev/null
P="psql -h /tmp -p $PORT -U postgres -d postgres -q -v ON_ERROR_STOP=1"
$P -f "$HERE/tests/db/supabase-stubs.sql"
for f in "$HERE"/supabase/migrations/*.sql; do $P -f "$f" 2>&1 | grep -v NOTICE || true; done
psql -h /tmp -p $PORT -U postgres -d postgres -q -t -A -f "$HERE/tests/db/marketplace-rls.test.sql" 2>&1 | grep -E "^(PASS|FAIL|TOTAL)|ERROR"
