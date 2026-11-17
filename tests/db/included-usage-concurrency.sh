#!/usr/bin/env bash
# Parallel sessions against the local cluster: the daily included-usage counter can never pass its cap, whatever races.
set -uo pipefail
PORT=${PORT:-54329}; P="psql -h /tmp -p $PORT -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=0"
ok=0; bad=0; chk() { if [ "$2" = "$3" ]; then echo "PASS $1 [$2]"; ok=$((ok+1)); else echo "FAIL $1 [got $2, want $3]"; bad=$((bad+1)); fi; }
T=$(mktemp -d); S="set role service_role;"
U1=aa000000-0000-4000-8000-000000000001; U2=aa000000-0000-4000-8000-000000000002; U3=aa000000-0000-4000-8000-000000000003; U4=aa000000-0000-4000-8000-000000000004
$P -c "delete from auth.users where email like '%@incrace.test'; insert into auth.users(id,email,email_confirmed_at) values ('$U1','r1@incrace.test',now()),('$U2','r2@incrace.test',now()),('$U3','r3@incrace.test',now()),('$U4','r4@incrace.test',now())" >/dev/null
$P -c "update plans set ai_daily_requests = 40, ai_daily_media = 10, monthly_credits = null where key = 'monthly'" >/dev/null
for U in $U1 $U2 $U3 $U4; do $P -c "$S select subscription_activate('$U','monthly', now() + interval '30 days', false, 'incrace-act-0001')" >/dev/null; done
allowed() { cat "$T"/$1_* | grep -c '"allowed": *true'; }

# 1) the member is ONE unit below the cap (39 of 40): two parallel requests -> exactly one is allowed
$P -c "insert into trainer_usage(user_id, day, requests, media) values ('$U1', trainer_usage_day(), 39, 0)" >/dev/null
for i in 1 2; do ( $P -c "$S select trainer_usage_consume('$U1', false)" > "$T/a_$i" 2>&1 ) & done; wait
chk "2 parallel requests at the last unit: allowed" "$(allowed a)" 1
chk "2 parallel requests at the last unit: refused with daily_limit_reached" "$(cat "$T"/a_* | grep -c 'daily_limit_reached')" 1
chk "counter is exactly at the cap" "$($P -c "select requests from trainer_usage where user_id='$U1' and day = trainer_usage_day()")" 40

# 2) the same with 12 parallel requests and 3 units left -> exactly 3
$P -c "insert into trainer_usage(user_id, day, requests, media) values ('$U2', trainer_usage_day(), 37, 0)" >/dev/null
for i in $(seq 1 12); do ( $P -c "$S select trainer_usage_consume('$U2', false)" > "$T/b_$i" 2>&1 ) & done; wait
chk "12 parallel requests with 3 units left: allowed" "$(allowed b)" 3
chk "12 parallel requests with 3 units left: counter" "$($P -c "select requests from trainer_usage where user_id='$U2' and day = trainer_usage_day()")" 40

# 3) media: one media unit left (9 of 10), 8 parallel requests with an attachment -> exactly one; the refused ones use no request unit
$P -c "insert into trainer_usage(user_id, day, requests, media) values ('$U3', trainer_usage_day(), 9, 9)" >/dev/null
for i in $(seq 1 8); do ( $P -c "$S select trainer_usage_consume('$U3', true)" > "$T/c_$i" 2>&1 ) & done; wait
chk "8 parallel media requests at the last media unit: allowed" "$(allowed c)" 1
chk "8 parallel media requests: refused with daily_media_limit_reached" "$(cat "$T"/c_* | grep -c 'daily_media_limit_reached')" 7
chk "media counter exactly at the cap, requests +1 only" "$($P -c "select requests||'/'||media from trainer_usage where user_id='$U3' and day = trainer_usage_day()")" "10/10"

# 4) a fresh day, no row yet: 60 parallel first requests -> exactly 40 (the row is created once, never over-counted)
for i in $(seq 1 60); do ( $P -c "$S select trainer_usage_consume('$U4', false)" > "$T/d_$i" 2>&1 ) & done; wait
chk "60 parallel requests on an empty day: allowed" "$(allowed d)" 40
chk "60 parallel requests on an empty day: rows for today" "$($P -c "select count(*) from trainer_usage where user_id='$U4'")" 1
chk "60 parallel requests on an empty day: counter" "$($P -c "select requests from trainer_usage where user_id='$U4' and day = trainer_usage_day()")" 40

# 5) refunds racing with requests at the cap: the counter stays within 0..cap and every refund frees exactly one unit
for i in $(seq 1 6); do
  ( $P -c "$S select trainer_usage_refund('$U4', false)" > "$T/e_r$i" 2>&1 ) &
  ( $P -c "$S select trainer_usage_consume('$U4', false)" > "$T/e_c$i" 2>&1 ) &
done; wait
R=$(cat "$T"/e_r* | grep -c '^t$'); C=$(cat "$T"/e_c* | grep -c '"allowed": *true')
chk "refund vs request race: counter = 40 - refunds + allowed" "$($P -c "select requests from trainer_usage where user_id='$U4' and day = trainer_usage_day()")" "$((40 - R + C))"
chk "refund vs request race: counter never above the cap" "$($P -c "select count(*) from trainer_usage where requests > 40 or media > 10 or requests < 0")" 0
chk "no subscription coins were granted to any of the racing subscribers" "$($P -c "select count(*) from credit_ledger where user_id in ('$U1','$U2','$U3','$U4') and source = 'subscription'")" 0
rm -rf "$T"
echo "TOTAL pass=$ok fail=$bad"
