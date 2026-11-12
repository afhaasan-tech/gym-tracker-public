#!/usr/bin/env bash
# Parallel sessions against the local cluster: the ledger must never overspend and idempotent retries must hold credits once.
set -uo pipefail
PORT=${PORT:-54329}; P="psql -h /tmp -p $PORT -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=0"
ok=0; bad=0; chk() { if [ "$2" = "$3" ]; then echo "PASS $1 [$2]"; ok=$((ok+1)); else echo "FAIL $1 [got $2, want $3]"; bad=$((bad+1)); fi; }
U1=d0000000-0000-4000-8000-000000000001; U2=d0000000-0000-4000-8000-000000000002; U3=d0000000-0000-4000-8000-000000000003
$P -c "insert into auth.users(id,email,email_confirmed_at) values ('$U1','c1@conc.test',null),('$U2','c2@conc.test',null),('$U3','c3@conc.test',null)" >/dev/null
$P -c "set role service_role; select credit_grant('$U1','purchased',120,'purchase','seed','t')" >/dev/null
# 1) 8 parallel 50-credit reservations on a 120 balance -> exactly 2 may succeed
for i in 1 2 3 4 5 6 7 8; do ( $P -c "set role service_role; select o_reservation_id from credit_reserve('$U1','quick_question','conc-key-$i')" 2>&1 | grep -c '^[0-9a-f]\{8\}-' > /tmp/conc_$i ) & done; wait
okc=$(cat /tmp/conc_[1-8] | paste -sd+ | bc)
chk "8 parallel reservations of 50 on balance 120: successes" "$okc" 2
chk "final balance after 2 holds" "$($P -c "select coalesce(sum(amount),0) from credit_ledger where user_id='$U1'")" 20
chk "ledger never negative" "$($P -c "select count(*) from (select source,sum(amount) s from credit_ledger where user_id='$U1' group by source) x where s<0")" 0
# 2) same idempotency key from 8 parallel connections -> one reservation, one hold
$P -c "set role service_role; select credit_grant('$U2','purchased',1000,'purchase','seed','t')" >/dev/null
for i in 1 2 3 4 5 6 7 8; do ( $P -c "set role service_role; select o_reservation_id from credit_reserve('$U2','quick_question','same-key-001')" >/dev/null 2>&1 ) & done; wait
chk "same idempotency key x8: reservations" "$($P -c "select count(*) from credit_reservations where user_id='$U2'")" 1
chk "same idempotency key x8: balance" "$($P -c "select sum(amount) from credit_ledger where user_id='$U2'")" 950
# 3) 8 parallel e-mail verifications of one account -> one trial grant
for i in 1 2 3 4 5 6 7 8; do ( $P -c "update auth.users set email_confirmed_at = now() where id='$U3'" >/dev/null 2>&1 ) & done; wait
chk "8 parallel verifications: trial grants" "$($P -c "select count(*) from trial_grants where user_id='$U3'")" 1
chk "8 parallel verifications: ledger grants" "$($P -c "select count(*) from credit_ledger where user_id='$U3' and entry_type='grant'")" 1
# 4) settle/release race on one reservation: exactly one final state
rid=$($P -c "set role service_role; select o_reservation_id from credit_reserve('$U2','quick_question','race-key-001')" | head -1)
( $P -c "set role service_role; select credit_settle('$rid','$U2')" >/dev/null 2>&1 ) & ( $P -c "set role service_role; select credit_release('$rid','$U2','race')" >/dev/null 2>&1 ) & wait
st=$($P -c "select status from credit_reservations where id='$rid'"); bal=$($P -c "select sum(amount) from credit_ledger where user_id='$U2'")
if { [ "$st" = "settled" ] && [ "$bal" = "900" ]; } || { [ "$st" = "released" ] && [ "$bal" = "950" ]; }; then echo "PASS settle/release race ends consistent [$st, balance $bal]"; ok=$((ok+1)); else echo "FAIL settle/release race [$st, balance $bal]"; bad=$((bad+1)); fi
echo "TOTAL pass=$ok fail=$bad"
