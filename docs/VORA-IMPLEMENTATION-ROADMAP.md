# VORA — Implementation Roadmap & Phase 1 Checklist (proposal; awaiting approval)

## Working rules
Development branch `vora-ai-phase1` (from `main`, **never auto-deployed**: do not push branches that Vercel would build as production; use staging project). No production DB/secret/deploy change without your approval package (changes, DB impact, risks, test results, rollback, user impact). Day-10 branch untouched.

## Blockers to clear (owner actions)
| # | Blocker | Needed from you | Blocks |
|---|---|---|---|
| B1 | Isolated environment | Approve creating a free Supabase project `vora-staging` (or pay for branching) | all DB/Edge integration tests |
| B2 | SMTP provider for OTP/new-device emails | Choose provider/account + sender domain; set secrets | real OTP tests, device challenge |
| B3 | AI provider accounts/keys | After my current-pricing research: pick providers; add keys as Supabase secrets (I cannot write secrets) | AI Coach live tests |
| B4 | Gateway sandbox secrets | Set `UPAYMENTS_API_KEY` / `UPAYMENTS_HMAC_SECRET` in staging (and prod only when approved) | payment E2E |
| B5 | Owner MFA enrolment | Enrol TOTP, run owner suite | admin MFA proof, owner dashboard badge |
| B6 | Licensed 3D assets | Provide/buy licensed anatomy, avatar and exercise-animation assets | Phase 2 |
| B7 | Plan/hosting decision | Supabase Pro (session limits, PITR, leaked-password check), Vercel Pro for commercial use | launch (P4) |
| B8 | Decisions C3/C4 (credit expiry, VIP fair-use numbers) | confirm defaults in ARCHITECTURE §2 | subscription logic |

## Phase 1 checklist (each item: build → tests → evidence; status today: NOT STARTED)
1. Design tokens + core components (light palette), a11y, ≥16px inputs, **عربي | English** switcher.
2. Auth: OTP signup (existing) hardened; password reset; rate limits; security events.
3. Trusted device + single-active-session + `is_trusted_session()` (needs B2).
4. Progressive onboarding cards + consents + sensitive-data tables.
5. PWA: manifest, service worker (shell-only), install guidance, update flow.
6. AI provider abstraction + `ai_routes` + `ai-coach` function (text) with fallback/error states (needs B3 for live).
7. Coach characters (Rashid/Sarah) as configurable presentation + tone/name/language settings; Kuwaiti quick actions.
8. Credit ledger, reservations, settle/release, idempotency; wallet UI with exact-cost confirmation.
9. One-time 2,500 trial grant (verified accounts).
10. Owner-configurable operation costs / plans / flags (step-up for high-risk).
11. Subscription + entitlement foundation (states, expiry, 3-day read-only grace; pause logic specified, built in P3).
12. Orders + generalised payment settlement (sandbox, disabled by flag) reusing Day-10 components; hardening items 1–3 of ARCHITECTURE §6.
13. Feature-flag hiding for human-coach purchasing (prepared, applied only on approval).
14. Tests + docs: DB harness (concurrency, RLS matrix), Deno unit/contract tests, Playwright E2E (AR/EN, RTL/LTR, iPhone Safari focus), regression of Day 9 suites; PASS/FAIL/BLOCKED/NOT TESTED report.

## Test strategy
- Local Postgres harness (existing: 175 + 55 checks) extended for ledger concurrency, idempotency, RLS isolation, subscription state machine.
- Staging project: Edge Function contract tests, OTP/device flow, payments-live (all 15 scenarios), Day 9 regression.
- Never real customer data; temp accounts created via SQL in staging only, with documented cleanup scope.

## Rollback
Per-migration down scripts (tested locally); flags default off; staging proves up/down; production: pre-migration table exports (no PITR on Free), apply in one transaction per migration, verify counts, instant flag kill-switch; Edge Functions versioned (redeploy previous version from git).

## Phases 2–4
As in the master spec (experience/fitness, nutrition/engagement/commerce, hardening/launch); sequencing unchanged.
