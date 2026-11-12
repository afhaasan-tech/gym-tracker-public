# VORA Phase 1 — M3 checkpoint report (staging only)

## Approved scope this round
M3A (additive) on `vora-staging`; server-side trust enforcement in Edge Functions; full device-verification tests; consent scope; pepper exposure check; M3B **prepared but NOT applied**. Production, secrets, payments, real customer data: untouched. Nothing pushed; no Vercel build.

## M3A — applied to staging
`supabase/migrations/20261117_m3a_foundation.sql` (0 drops, 0 replaced objects): security events (append-only), trusted devices + single-active-session state, hashed 6-digit challenges with a database-generated pepper, consents (append-only), private member preferences (incl. coach persona/name/tone/language/appearance) and health profile (consent-gated), data export, plans (provisional) and feature flags, owner functions for prices/credit limits/budget gate/routes/plans/flags/credit adjustments (step-up verification + reason + audit), public read of plans/flags. Staging also has a staging-only baseline slice (admins, audit log) and a mock mailbox table.

## Edge Functions (staging)
- `device-auth` (new): `status`, `send_code`, `verify_code`, `list_devices`, `revoke_device`. Code generated with a CSPRNG, stored only as a keyed hash, e-mailed only (mock mailbox in staging; Resend client implemented but **not activated**), never returned. Generic failure answers, rate limits (3 codes/10 min, 10/day, 10 verifies/10 min + per-IP), logout of all other sessions after trust is granted.
- `ai-coach` (v2): **first action is `is_trusted_session()`** evaluated by the database with the caller's own JWT → `403 device_not_trusted` before any validation, price check, rate-limit write, credit hold or provider call.

## Test results (real executions)
| Suite | Where | Result |
|---|---|---|
| Existing RLS/roles | local Postgres | 175/175 PASS |
| Credits / AI backend / budget / concurrency | local | 61 + 8 + 33 + 2 PASS |
| **M3 (devices, challenges, consent, owner config, trusted-session policies)** incl. M3B | local | **99/99 PASS** |
| Deno: ai-coach (14) + device-auth (10) | local | **24/24 PASS** |
| **Device / session / consent e2e on `vora-staging`** | staging | **18/18 PASS** |
| Staging SQL rehearsal: consent withdrawal scope + pepper exposure (rolled back) | staging | all expected |

Staging e2e covered: password login alone is untrusted (ai-coach 403, consent/export/preferences blocked, no price oracle); garbage/missing JWT rejected; code never in the response; wrong code generic 401; correct code trusts the device; used code cannot be replayed; consent + preferences only inside the trusted session; **logging in again on the trusted device activates the new session and the old session stops working (401/403)**; a new device with a valid password stays untrusted while the trusted session is unaffected; **cross-user: B cannot use A's device secret or A's pending code and sees none of A's jobs/devices**; list/revoke only from a trusted session, a revoked device must re-verify and the session loses trust immediately; **5 wrong guesses burn the code (the correct code then fails)**; more than 3 codes per 10 min → 429; an **expired** code is refused; API probes of `internal_secrets`, `device_challenges` and `device_code_hash` are refused for anon and members.

### Consent-withdrawal scope (item 5) — verified on staging in a rolled-back transaction
Three users each with consent + a health profile; user A (trusted session) withdraws: **A's profile deleted, B's and C's health rows, preferences and consent history untouched**, A's withdrawal recorded. By construction `consent_set` deletes `where user_id = auth.uid()` and requires a trusted session.

### Pepper exposure (item 6)
`internal_secrets` has **no privileges for anon/authenticated/service_role/PUBLIC**, RLS on with no policies; `device_code_hash` is executable by nobody except the table owner (called only inside definer functions); the pepper appears in **no function source**, `security_events` contains no codes, challenge rows hold only a keyed hash (not the plain code), API access is refused. The pepper is generated inside the database (`gen_random_bytes`), so its value is **not in the migration text** and the Postgres log contains only the migration statement (no value) plus two expected "permission denied" lines from my own probes. Caveat: it is stored in the database like any secret (backups included) and the Supabase dashboard SQL editor/owner role can read it. The staging mock mailbox stores plain codes **on purpose and exists only in staging**.

## M3B — prepared, NOT applied (needs your approval)
File: `supabase/migrations/20261118_m3b_trusted_enforcement.sql` · rollback: `supabase/rollback/20261118_m3b_rollback.sql` (restores the four original policies and the original `my_credit_balance()`).
**What it changes:** drops and recreates the member read policies on `credit_ledger`, `credit_reservations`, `trial_grants`, `ai_jobs` with one extra condition `is_trusted_session()`; replaces `my_credit_balance()` so it raises `42501` unless the session is trusted.
**Security impact:** *Gains* — a stolen password (or a stale/superseded session) can no longer read balances, ledger, reservations or AI conversations through the REST API; the database itself enforces what `ai-coach` already enforces. *Risks/costs* — any client that reads those tables without having completed device verification gets empty results/403 (the wallet UI must go through the device gate first); users with sessions that existed before the change are untrusted until they verify once; if `user_session_state` were lost, everyone would need to re-verify (fail-closed). Nothing is deleted; no data changes; atomic transaction; staging only.
**Evidence so far:** all 99 local M3 checks and the existing suites run with M3B applied (untrusted session sees 0 ledger rows/0 AI jobs, balance RPC refused). **Not yet run on staging** — I did not apply M3B. I can rehearse it on staging inside a rolled-back transaction first if you want.

## Not done in M3 (honest list)
Owner Admin Panel UI, AI Coach chat UI with Rashid/Sarah customisation, customer wallet UI, onboarding cards UI, and the PWA shell are **not built yet** (the database/Edge layer they need is ready and tested). Light design system, account-deletion state machine, real OTP e-mail provider (Resend recommended; needs your account + domain), and the live benchmark (instructions: `docs/VORA-LIVE-BENCHMARK-SETUP.md`) remain open. Existing production accounts (including the 2 unknown ones) were not touched.

## Needs your approval / action
1. Approve M3B on staging (or ask for the rolled-back rehearsal first).
2. Decide the benchmark budget ($5 proposed) — nothing live runs without it.
3. Resend account + sending domain when you want real OTP e-mail.
4. Production migrations (`20261114a`, `20261116`, and later `20261117/18`) remain unapproved.
