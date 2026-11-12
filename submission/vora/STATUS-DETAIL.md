# VORA | ڤورا — Project Submission (12 Nov 2026)

**Honest status:** VORA is **not a finished product**. What exists is a security-first foundation, tested on a separate **staging** project: trusted-device sign-in, an internal credit wallet, an AI Coach that runs in **mock mode**, Owner controls and provisional plans. A minimal working UI covers these screens. The existing workout, food and profile features still work. Production (`gym-tracker-afhaasan.vercel.app`, Supabase `zbqdmebrxqshcsozamwg`) has **not been changed**: no migrations, deployments, secrets or data.

All work is on the local branch `vora-ai-phase1`. It has **not been pushed or deployed**.

## 1. Feature status

| Area | Status | Notes |
|---|---|---|
| Existing workouts (log sets/reps/weight, list, photos, AI summary) | **WORKING** (production, unchanged) | Workout logging re-verified against staging in the VORA UI (U08). |
| Existing food diary, profile, muscle explorer, marketplace pages | **WORKING** (production, unchanged) | Hidden from the VORA navigation when `VITE_VORA_AI=1`; the code is untouched. |
| Email + password sign-in, email verification | **WORKING** | Existing flow. |
| Trusted device: 6-digit email code, single active session | **WORKING (staging)** | Enforced by the server, the database (M3B) and Edge Functions. On staging the email is written to the `dev_mock_outbox` table, so **no real email is sent**. |
| Credit wallet (2,500 one-time trial, reserve → settle/release, ledger) | **WORKING (staging)** | Append-only ledger, safe under concurrent use, readable only from a trusted session. |
| AI Coach chat (Rashid / Sarah, tone, language, exact-cost confirmation) | **MOCK ONLY** | Replies are simulated; no paid AI provider is called. The live Anthropic provider is built but switched off: budget gate closed, budget = 0, and no API key has been created. |
| Onboarding + consents (health data, AI sharing, marketing) | **WORKING (staging)** | Withdrawing health consent deletes only that user's health profile (verified). |
| Subscriptions / plans (Essential / Pro / Elite / VIP) | **PARTIALLY WORKING** | Plans are read from the database and **all are provisional**. Checkout is disabled. There is no subscription billing, pause or grace period yet. |
| Owner commerce panel (operation costs, flags, budget view, security events) | **PARTIALLY WORKING** | The database functions and the step-up (recent TOTP) rule are tested. Clicking through the UI as owner on staging is **NOT TESTED**, because staging has no owner MFA set up. |
| Payments (UPayments, Day 10) | **DEFERRED for VORA** | The `day10-payments` branch is kept, not merged and not modified (see §4). |
| PWA install, push notifications | **DEFERRED** | |
| Visual redesign, 3D, voice avatars, advanced nutrition AI | **DEFERRED** (per instructions) | |
| Human coach marketplace for VORA | **DEFERRED** | The existing marketplace code is unchanged. |

## 2. Test evidence (all run on 12 Nov 2026)

| Suite | Where | Result |
|---|---|---|
| Local Postgres harness (credits 175, AI backend 61, concurrency 8+33+2, M3 99, hardening, least privilege) | local PG16 | **PASS**, 0 failures |
| Deno Edge Function unit tests (`tests/edge`) | local | **PASS** 24/24 |
| AI Coach end-to-end (`tests/ai-coach-staging.e2e.mjs`) | staging | **PASS** 12/12 (run before M3B; the ai-coach path after M3B is covered by M3B E03) |
| Device / session / consent end-to-end (`tests/device-m3-staging.e2e.mjs`) | staging | **PASS** 18/18 |
| M3B database enforcement (`tests/m3b-staging.e2e.mjs`) | staging | **PASS** 6/6 |
| **VORA UI browser journey** (`tests/vora-ui-staging.e2e.mjs`, Playwright) | staging build | **PASS** 8/8 (two earlier runs failed: two test-timing problems and one real UI bug, a wrong ledger column name, which is now fixed) |
| i18n coverage | local | **PASS** (0 missing) |
| TypeScript build, production-mode build | local | **PASS**. The production-mode bundle contains no staging reference, and the staging bundle contains no production reference. |
| `tests/no-mock-in-prod.mjs` | local | Bundle scan **PASS**. Source scan **FAIL**: the check already fails on `main` (`src/i18n/data-en.ts`), and it no longer fits VORA, which ships a deliberate mock provider. The rule needs updating. |
| `extras.test.mjs`, `fn-fallback.test.mjs`, live production suites | – | **NOT RUN**: they need production credentials or a live production target. |

## 3. Safe demo (local machine, staging only, nothing deployed)

```bash
git checkout vora-ai-phase1 && npm ci
cat > .env.staging <<'EOF'
VITE_SUPABASE_URL=https://lsjlntaazsojmppfjoiz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fcuTsXtko12gNxejeLMXPg__Tf0Jyuj
VITE_VORA_AI=1
EOF
npx vite build --mode staging --outDir dist-staging && npx vite preview --outDir dist-staging --port 4173
```
1. Open `http://localhost:4173/#/login` and sign in with a staging test account.
2. The device gate appears. Click **Send code**. Read the code in the Supabase dashboard for staging: SQL editor → `select body from dev_mock_outbox order by id desc limit 1;` Enter it.
3. **Onboarding**: choose Sarah, a tone and a language, and tick a consent.
4. **AI Coach**: send a message. A confirmation shows the exact credit cost. Confirm, and a reply marked `[mock]` arrives.
5. **Wallet**: the balance drops by the operation cost, and the ledger shows the debit.
6. **Plans**: provisional prices; checkout is disabled.
7. **Workouts** (existing feature): add a workout and it appears in the list.
8. Security demo: sign in and verify in a second browser. The first browser's requests are then refused by the server (the AI Coach returns `device_not_trusted` and the balance fails to load); a reload shows the device gate again.

`.env.staging` and `dist-staging/` are git-ignored. The publishable key is a public client key.

## 4. Day 10 payments assessment (no changes made)
- The `day10-payments` branch (6 commits) is complete for **sandbox** booking payments: hosted UPayments checkout, HMAC webhook plus a server-to-server status check, idempotency, reconciliation, 55 database tests and a live sandbox suite.
- It is **not merged and not deployed** in this phase. Production payment infrastructure was not touched.
- Gaps for VORA: the branch pays for *bookings*. VORA needs *orders* (credit packs, subscriptions). The plan is a reusable `orders` table, with payment attempts pointing to an order and credits granted by `credit_grant` only after a verified capture. This would be staging only, with checkout off. Real merchant keys and the go-live are the owner's decision.

## 5. Risks and open items
- Production security migrations `20261114a` and `20261116` are written and tested but **await owner approval**.
- Live AI is blocked until the owner approves a budget (the $5 proposal is unapproved) and sets the key in Supabase secrets (I cannot write secrets).
- There is no real email provider for device codes yet (staging uses the outbox). A provider plus a DNS/SPF setup is needed before launch.
- VIP fair-use limits and all prices are provisional.

## 6. Approvals needed (nothing below has been done)
1. Push `vora-ai-phase1` to GitHub. This would likely trigger a Vercel **preview** build of the branch, which uses production env vars unless preview-scoped staging vars are set first. The safe option is the local demo in §3.
2. Any production migration or deployment.
3. Live AI budget and key.
