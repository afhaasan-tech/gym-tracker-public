#!/usr/bin/env bash
# Parallel sessions against the local cluster: a purchase order is fulfilled exactly once whatever races (webhook / reconcile / status check).
set -uo pipefail
PORT=${PORT:-54329}; P="psql -h /tmp -p $PORT -U postgres -d postgres -q -t -A -v ON_ERROR_STOP=0"
ok=0; bad=0; chk() { if [ "$2" = "$3" ]; then echo "PASS $1 [$2]"; ok=$((ok+1)); else echo "FAIL $1 [got $2, want $3]"; bad=$((bad+1)); fi; }
T=$(mktemp -d)
U1=e6000000-0000-4000-8000-000000000001; U2=e6000000-0000-4000-8000-000000000002; U3=e6000000-0000-4000-8000-000000000003; U4=e6000000-0000-4000-8000-000000000004
$P -c "insert into auth.users(id,email,email_confirmed_at) values ('$U1','r1@race.test',now()),('$U2','r2@race.test',now()),('$U3','r3@race.test',now()),('$U4','r4@race.test',now())" >/dev/null
# 20261121 switched the original plans / packs off; these races use them (see purchases.test.sql), so they are on sale only while this script runs
$P -c "update plans set enabled = true where key in ('essential','pro','elite','vip'); update coin_packs set enabled = true where key in ('coins_500','coins_1200','coins_3000')" >/dev/null
S="set role service_role;"
mk() { $P -c "$S select purchase_create('$1','$2','$3','$4')->>'id'" | head -1; }
price() { $P -c "select amount_kwd from purchase_orders where id='$1'"; }

# 1) 8 parallel purchase_create with the same idempotency key -> one order
for i in 1 2 3 4 5 6 7 8; do ( $P -c "$S select purchase_create('$U1','coins','coins_1200','race-create-01')->>'id'" > "$T/c_$i" 2>&1 ) & done; wait
chk "same idempotency key x8: distinct order ids returned" "$(cat "$T"/c_* | sort -u | grep -c '^[0-9a-f]\{8\}-')" 1
chk "same idempotency key x8: orders in the table" "$($P -c "select count(*) from purchase_orders where user_id='$U1'")" 1

# 2) 8 parallel CAPTURED on one coins order -> exactly one 'applied', one ledger row, 1,200 coins
O1=$(cat "$T/c_1" | head -1); A1=$(price "$O1")
for i in 1 2 3 4 5 6 7 8; do ( $P -c "$S select purchase_apply('$O1','CAPTURED',$A1,'KWD','trk-race-1','{}'::jsonb,'webhook')->>'outcome'" > "$T/a_$i" 2>&1 ) & done; wait
chk "8 parallel captures: outcomes 'applied'" "$(cat "$T"/a_* | grep -c '^applied$')" 1
chk "8 parallel captures: outcomes 'duplicate'" "$(cat "$T"/a_* | grep -c '^duplicate$')" 7
chk "8 parallel captures: ledger rows for the order" "$($P -c "select count(*) from credit_ledger where user_id='$U1' and idempotency_key='order:$O1'")" 1
chk "8 parallel captures: purchased balance" "$($P -c "select coalesce(sum(amount),0) from credit_ledger where user_id='$U1' and source='purchased'")" 1200
chk "8 parallel captures: order paid + fulfilled" "$($P -c "select count(*) from purchase_orders where id='$O1' and status='paid' and fulfilled_at is not null")" 1

# 3) CAPTURED racing FAILED (4 each) on one order -> always ends paid, granted exactly once (a capture is never lost or doubled)
O2=$(mk $U2 coins coins_500 race-mixed-001); A2=$(price "$O2")
for i in 1 2 3 4; do
  ( $P -c "$S select purchase_apply('$O2','CAPTURED',$A2,'KWD','trk-race-2','{}'::jsonb,'webhook')" >/dev/null 2>&1 ) &
  ( $P -c "$S select purchase_apply('$O2','FAILED',$A2,'KWD','trk-race-2','{}'::jsonb,'reconcile')" >/dev/null 2>&1 ) &
done; wait
chk "capture vs failure race: final status" "$($P -c "select status from purchase_orders where id='$O2'")" paid
chk "capture vs failure race: ledger rows" "$($P -c "select count(*) from credit_ledger where user_id='$U2' and idempotency_key='order:$O2'")" 1
chk "capture vs failure race: balance" "$($P -c "select coalesce(sum(amount),0) from credit_ledger where user_id='$U2' and source='purchased'")" 500

# 4) 8 parallel CAPTURED on one subscription order -> one subscription row, one credit grant
O3=$(mk $U3 subscription pro race-sub-00001); A3=$(price "$O3")
for i in 1 2 3 4 5 6 7 8; do ( $P -c "$S select purchase_apply('$O3','CAPTURED',$A3,'KWD','trk-race-3','{}'::jsonb,'webhook')" >/dev/null 2>&1 ) & done; wait
chk "8 parallel subscription captures: subscription rows" "$($P -c "select count(*) from subscriptions where user_id='$U3'")" 1
chk "8 parallel subscription captures: credit grants" "$($P -c "select count(*) from credit_ledger where user_id='$U3' and source='subscription'")" 1
chk "8 parallel subscription captures: auto_renew" "$($P -c "select auto_renew from subscriptions where user_id='$U3' and status='active'")" f

# 5) TWO different subscription orders of one member captured at the same time (4 parallel events each) -> both periods count: about 60 days
O4=$(mk $U4 subscription pro race-sub-two-1); O5=$(mk $U4 subscription pro race-sub-two-2); A4=$(price "$O4")
for i in 1 2 3 4; do
  ( $P -c "$S select purchase_apply('$O4','CAPTURED',$A4,'KWD','trk-race-4','{}'::jsonb,'webhook')" >/dev/null 2>&1 ) &
  ( $P -c "$S select purchase_apply('$O5','CAPTURED',$A4,'KWD','trk-race-5','{}'::jsonb,'webhook')" >/dev/null 2>&1 ) &
done; wait
chk "two orders racing: subscription rows" "$($P -c "select count(*) from subscriptions where user_id='$U4'")" 2
chk "two orders racing: active rows" "$($P -c "select count(*) from subscriptions where user_id='$U4' and status='active'")" 1
chk "two orders racing: both periods are added (59-61 days left)" "$($P -c "select count(*) from subscriptions where user_id='$U4' and status='active' and current_period_end between now() + interval '59 days' and now() + interval '61 days'")" 1
chk "two orders racing: credit grants" "$($P -c "select count(*) from credit_ledger where user_id='$U4' and source='subscription'")" 2
chk "two orders racing: both orders fulfilled" "$($P -c "select count(*) from purchase_orders where user_id='$U4' and status='paid' and fulfilled_at is not null")" 2
chk "no order anywhere is fulfilled without being paid" "$($P -c "select count(*) from purchase_orders where fulfilled_at is not null and status <> 'paid'")" 0
$P -c "update plans set enabled = false where key in ('essential','pro','elite','vip'); update coin_packs set enabled = false where key in ('coins_500','coins_1200','coins_3000')" >/dev/null
rm -rf "$T"
echo "TOTAL pass=$ok fail=$bad"
