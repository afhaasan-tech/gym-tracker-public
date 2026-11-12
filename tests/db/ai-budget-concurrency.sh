#!/usr/bin/env bash
# 12 parallel sessions each ask to spend 10,000 micro-USD against a 50,000 cap: exactly 5 may be authorised.
set -uo pipefail
PORT=${PORT:-54329}; P="psql -h /tmp -p $PORT -U postgres -d postgres -q -t -A"
$P -c "update ai_budget set live_calls_enabled=true, monthly_cap_usd_micro=50000, per_call_cap_usd_micro=10000, spent_usd_micro=0, period_start=date_trunc('month',now())::date" >/dev/null
for i in $(seq 1 12); do ( $P -c "set role service_role; select ai_budget_authorize(10000)" > /tmp/bud_$i 2>&1 ) & done; wait
okc=$(cat /tmp/bud_* | grep -c '^t$'); spent=$($P -c "select spent_usd_micro from ai_budget")
ok=0; bad=0
[ "$okc" = "5" ] && { echo "PASS 12 parallel authorisations on a 5-call cap: $okc allowed"; ok=1; } || { echo "FAIL parallel budget: $okc allowed"; bad=1; }
[ "$spent" = "50000" ] && { echo "PASS spend never exceeds the cap ($spent)"; ok=$((ok+1)); } || { echo "FAIL spend $spent"; bad=$((bad+1)); }
$P -c "update ai_budget set live_calls_enabled=false, monthly_cap_usd_micro=0, spent_usd_micro=0" >/dev/null
echo "TOTAL pass=$ok fail=$bad"
