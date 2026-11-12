# VORA Phase 1 — progress report (updated 2026-11-12)

Branch: `vora-ai-phase1` (local; **not pushed**, nothing deployed, production untouched).

## Staging
`vora-staging` created (project `lsjlntaazsojmppfjoiz`, org "af", eu-central-1, free plan, $0). Validated: ACTIVE_HEALTHY, Postgres 17.11, **empty** (0 users, no tables), separate from production, no production secrets, no customer data. **Not yet populated**: schema (8 baseline migrations + new ones) will be applied to staging at the next milestone, because applying ~72 KB of SQL through the connector is slow; the local harness is the primary gate until then. Staging has no secrets (no SMTP, AI or payment keys).

## Milestone 1 — credit-ledger foundation (DONE locally)
Files added: `supabase/migrations/20261114_credits_foundation.sql`, `20261114a_function_hardening.sql`, `tests/db/credits.test.sql`, `tests/db/credits-concurrency.sh`, `tests/db/hardening.test.sql`; `tests/db/run-local.sh` and the existing marketplace test header updated (helper grants); docs `VORA-SECURITY-FINDINGS.md`, `VORA-PROVIDER-RESEARCH.md`, this file.

What it implements: append-only `credit_ledger` (4 sources), `credit_reservations`, wallet lock row, per-source never-negative trigger (also stops superusers), one-time trial (`trial_grants` PK + auto-grant when the e-mail becomes verified; amount configurable, default 2,500), `ai_operations` catalogue with the five draft costs, reserve → settle / release / expire functions (idempotent, free credits spent first, purchased last), subscription-pool expiry (purchased credits can never expire), `my_credit_balance()` for members; every mutating function is `service_role`-only; members can only SELECT their own rows.

Tests (local Postgres harness, **real executions**): existing marketplace/roles suite **175/175 PASS** (no regression, including after the deny-by-default privilege change); credits SQL **61/61 PASS**; concurrency (parallel sessions) **8/8 PASS** — 8 parallel 50-credit reservations on a 120 balance → exactly 2 succeed, final balance 20; same idempotency key ×8 → 1 reservation; 8 parallel verifications → 1 trial grant; settle/release race ends consistent; hardening **3/3 PASS**.

## NOT done / NOT tested (do not read as complete)
Edge Functions for credits/AI, wallet UI, owner price editing UI, trusted-device/OTP flow, PWA, design system, AI provider abstraction, subscriptions, consents/onboarding, orders/payments generalisation. Staging has no schema yet. No test has run against staging or production.

## Next milestone (proposed)
M2: (a) apply baseline + M1 migrations to `vora-staging` and rerun the DB suites there; (b) `ai-coach` Edge Function skeleton with provider abstraction (mock provider only, no keys), cost confirmation + reserve/settle/release wiring, per-user rate limits; (c) Deno contract tests. Blockers for M2: none for (a)–(c); real AI calls wait for your provider/key decision.


---
# Milestone 2 (updated 2026-11-12)

## Implemented (files)
- DB: `supabase/migrations/20261115_ai_backend.sql` (`ai_jobs` private idempotent job records, `ai_routes`, `ai_budget` hard spend gate — **closed by default**, sliding-window `rate_limit_hit`), `20261116_least_privilege.sql` (service key can no longer alter the audit log or touch credit tables directly; TRUNCATE guards).
- Edge Function `supabase/functions/ai-coach/` (`index.ts`, `core.ts`, `persona.ts`, `providers.ts`): validates input, requires the member to confirm the **exact server-side cost**, rate-limits (12/min, 300/day per user), reserves credits atomically, replays on the same idempotency key (no second provider call or charge), calls a provider, **settles only after an answer exists**, releases on failure/timeout/empty answer, fails **closed** in live mode (no silent mock for paying users). Providers: `mock` (default, free) and `anthropic` (implemented, **cannot run** unless `AI_MODE=live` + a key secret + budget gate approval). Personas Rashid/Sarah × tone × AR/EN with safety rules and a Kuwaiti-Arabic style guide; no gender-based rules.
- Benchmark kit `benchmarks/coach/` and cost plan (`docs/VORA-AI-BENCHMARK.md`); privileged-function review (`docs/VORA-PRIVILEGED-FUNCTIONS-REVIEW.md`).

## Test results (real executions)
| Suite | Where | Result |
|---|---|---|
| Existing marketplace/roles RLS | local Postgres | 175/175 PASS |
| Credits (ledger, reservations, trial, RLS, privileges) | local | 61/61 PASS |
| Credits concurrency (parallel sessions) | local | 8/8 PASS |
| AI backend (budget gate, rate limit, jobs, privacy) | local | 33/33 PASS |
| Budget gate concurrency (12 parallel → exactly 5 allowed) | local | 2/2 PASS |
| Function hardening / least privilege | local | 3 + 8 PASS |
| `ai-coach` orchestration (fakes: confirmation, replay, 402, failure release, timeout, rate limit, live fail-closed, no accidental live call, persona safety text) | Deno | 13/13 PASS |
| **`ai-coach` end-to-end on `vora-staging`** (hosted auth trigger, JWT auth, confirmation, replay, parallel idempotency, RLS privacy, no member write paths, 402, validation, mock flag, rate limit) | **staging** | **12/12 PASS** (also re-run after the least-privilege migration, on fresh users) |
Failures seen along the way (all fixed): test-script quoting/role-order bugs, one bash precedence bug in a race test, an attempted tighter privilege that exposed 5 test assertions reading the ledger as service_role. A first staging rerun failed 7/12 only because the previous run had spent those test accounts' credits.

## Staging state
`vora-staging` has: M1 + M2 + least-privilege migrations, `ai-coach` (mock mode, **no secrets of any kind**), 6 throw-away test users (`@example.com`), no production data. The baseline (marketplace) schema is **not** loaded there yet; credits/AI do not depend on it.

## Blocked / needs you
1. Approve (or change) the **$5 initial benchmark budget** and the console workspace limit (see AI-BENCHMARK). I will not create keys or edit `approved-budget.json`.
2. Live AI calls: you create the key (staging secret) → then `AI_MODE=live` in staging only.
3. Real OTP e-mail: provider + domain decision (Resend recommended).
4. Production: **nothing applied.** Candidate production migrations ready for your review: `20261114a_function_hardening.sql`, `20261116_least_privilege.sql`; new product tables (`20261114`, `20261115`) only when you want Phase 1 live.

## Next milestone (M3, proposed)
Trusted-device/OTP + single-session design on staging (needs SMTP for real mail; DB side first), consents + onboarding tables, owner price/limit RPCs with step-up, wallet UI + AI Coach chat UI behind a feature flag, PWA shell.
