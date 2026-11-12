# VORA — Security Model (Phase 0, proposal; not implemented)

## 1. Principles
Zero trust, deny-by-default, least privilege, object-level authorization, defence in depth. The browser is untrusted; money, credits, entitlements, session trust and consents are decided only in the database/Edge Functions. Secrets (AI, payment, service role, SMTP) live in Supabase secrets, never in the bundle.

## 2. Trust boundaries & invariants
| Boundary | Invariant | Enforcement |
|---|---|---|
| Browser → Supabase | users reach only own rows | RLS on every table; column grants; no table INSERT/UPDATE on ledger/subscription/order tables for `authenticated` |
| Browser → Edge | caller identity & trusted session verified | JWT + `is_trusted_session()` check; input validation; rate limit; idempotency keys |
| Edge → DB (service role) | only via named SECURITY DEFINER functions | functions executable by `service_role` only; revoke from `anon/authenticated` (advisor-checked) |
| Edge → AI provider | minimum data, consent first | consent check before send; prompt/response not logged with PII |
| Provider → webhook | authentic **and** re-verified | HMAC + server-to-server lookup + amount/currency/reference/track-id match |
| Owner | strong MFA, step-up for high risk | `aal2` in `is_admin()`; extra verification + reason + audit for credit adjustment/price change/health-data exception |

## 3. Authentication & sessions
- Signup: email+password → **6-digit OTP** (Supabase `verifyOtp`, already live; template must expose the code; custom SMTP required — **blocker**).
- Reset: link only on request; neutral responses.
- **New-device OTP:** password sign-in → session starts *untrusted*; `device-challenge` Edge Function emails an OTP (hashed, 10-min expiry, 5 tries, per-user/IP limits); success marks device trusted and the session trusted. RLS helper `is_trusted_session()` gates private tables.
- **Single active session:** `user_session_state.active_session_id`; on successful new-device verification, set it to the new JWT `session_id` and revoke other sessions via the admin API; sensitive operations (wallet, AI, health data) require `session_id = active_session_id`. A stolen older access token therefore loses access to protected data immediately, though the JWT itself lives until expiry (≤1 h) — **no claim of instantaneous token death**. Free plan cannot shorten JWT lifetime/inactivity limits (decision).
- Admin MFA unchanged (TOTP aal2 in DB). Owner browser enrolment still pending (BLOCKED).
- Never log OTPs, tokens or passwords; hash challenge codes.

## 4. Health data & AI privacy
Separate sensitive tables (`member_health_profile`, allergies), owner-only RLS, **no admin/owner SELECT policy**; exceptional access = time-boxed grant with reason + audit event + step-up. Consent per purpose (`consents`, versioned, revocable) checked server-side before (a) storing sensitive data, (b) sending it to an AI provider, (c) saving sensitive long-term memory. No training on user data. Conversations/messages/memories owner-only; Owner dashboards show aggregates only. Export (JSON) and deletion supported; deletion: immediate disable + session revoke, 30-day recovery, then purge eligible data (orders kept for legal retention, pseudonymised).

## 5. Credit & entitlement integrity
- Append-only ledger; balance derived; `authenticated` cannot write. Reserve/settle/release are single transactions with row locks (`SELECT … FOR UPDATE` on the wallet row) and unique idempotency keys → no double debit on retries/double-clicks.
- Trial: `trial_grants.user_id` unique + grant only when email verified; abuse signals (device/IP velocity) logged.
- Free credits spent first; sources never merged; purchased credits never silently expire.
- Reservation expiry job releases abandoned reservations; settlement only after confirmed delivery.
- Owner price/limit edits via RPC with audit; operation cost read server-side at reserve time and **shown to the user for confirmation**; no background paid calls.

## 6. Payments
Reuse Day-10 rules: price server-side (KWD, 3 dp), browser return ≠ proof, only authenticated provider verification fulfils orders, duplicates idempotent, sandbox host hard-guarded, no auto-renewal, no real charges. Required hardening listed in ARCHITECTURE §6 (track-id required+unique, per-user reconcile throttle, tested webhook signing).

## 7. Threat table (abridged)
| Threat | Mitigation | Test |
|---|---|---|
| IDOR on AI chats/health/wallet | owner-only RLS + trusted-session helper | cross-account matrix |
| Credit double-spend / race | locks + idempotency + ledger constraints | 50-way concurrency test |
| Forged "paid"/credit grant | definer-only fulfilment after provider verification | forged webhook/return tests |
| Prompt injection exfiltrating data | no secrets/other-user data in prompts, tool-less model calls, output filtering | red-team set |
| OTP brute force / email bombing | hashed codes, attempts cap, per-user/IP limits | abuse tests |
| Stolen older session | active_session_id check | two-browser test |
| Secret leakage | secrets only in Supabase; secret scanning + bundle grep in CI | scan |
| Offline cache leakage | SW caches shell only; IndexedDB keyed per user, wiped on logout | account-switch test |
| Owner misuse | step-up, reasons, append-only audit | audit tests |

## 8. Monitoring & incident response
`security_events` + `audit_log` (append-only), alerts to Owner (failed OTP spikes, credit anomalies, webhook rejects), scoped automated containment (per-user lock, per-feature kill switch via flags) — never a platform-wide shutdown for a minor anomaly. Backup/restore drill in P4 (Free plan has no PITR → decision).

## 9. Findings on the current system (read-only)
- Security advisor: no payment-function exposure; INFO `payment_sweep_state` no policy (intended); pre-existing WARNs: `audit_log_immutable` mutable search_path; `public_slots` / `rls_auto_enable` executable by `anon` (SECURITY DEFINER); 31 definer functions executable by `authenticated` (owner/admin/coach RPCs — each self-checks authorization; review in P1); **leaked-password protection disabled** (Pro feature).
- 64 sessions for 36 users → no session limit today.
