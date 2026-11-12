# VORA | ڤورا — AI-first fitness MVP (submission, 12 Nov 2026)

VORA builds on the existing Gym Tracker app (React 19 + Vite + TypeScript + Supabase). This MVP adds trusted-device sign-in, an internal credit wallet, an AI Coach (Rashid / Sarah) running in **mock mode**, onboarding with consents, provisional plans and an Owner control panel. All of it is tested on an **isolated staging Supabase project**. Production is unchanged.

**This is an MVP, not a finished product.** It does **not** include native apps, real AI calls, real payments, advanced nutrition AI or PWA installation.

## Mock AI vs live AI
- **Mock AI (what you see):** the `ai-coach` Edge Function runs the whole real pipeline: authentication, trusted-device check, rate limit, exact-cost confirmation, credit reservation, job record, then settle or refund. Only the final text comes from a **mock provider**, labelled `[MOCK REPLY – no real AI call]`. No paid AI service is called.
- **Live AI (built, switched off):** an Anthropic provider adapter exists. It runs only if (1) the owner opens the database budget gate, (2) a monthly budget is approved (currently **0**) and (3) an API key is stored as a server secret (**none has been created**).

## Architecture (summary)
- **Client:** React SPA (hash router). The VORA screens are in `src/vora.tsx` and appear only when `VITE_VORA_AI=1`.
- **Supabase Postgres:** Row Level Security on every table. Privileged logic runs in `SECURITY DEFINER` functions callable only by `service_role`.
  - Append-only credit ledger with per-source balances.
  - Reserve → settle/release with idempotency keys.
  - One-time 2,500-credit trial.
  - Consent history.
  - Owner config changes require a recent MFA step-up and are audited.
- **Edge Functions (Deno):**
  - `device-auth`: 6-digit email code, hashed with a server-only pepper. Verifying signs out other sessions, so only one session is active.
  - `ai-coach`: trust check → cost confirmation → reserve → provider → settle.
- **Trusted session is enforced three times:** in the UI, in the Edge Functions and in the database (the M3B policies use `is_trusted_session()`). A stolen but valid JWT from another device cannot read the balance or call the coach.
- Full docs are in `docs/VORA-ARCHITECTURE.md` and `docs/VORA-SECURITY-MODEL.md`.

## Implemented features

| Feature | Status |
|---|---|
| Existing workouts, food diary, profile, muscle explorer | **Working** (unchanged; workouts re-verified on staging) |
| Trusted device (6-digit code) + single active session | **Working on staging** (codes go to a staging-only outbox, not real email) |
| Credit wallet + ledger | **Working on staging** |
| Onboarding + consents (withdrawal deletes health data) | **Working on staging** |
| AI Coach chat with exact-cost confirmation | **Mock AI only** |
| Plans (Essential / Pro / Elite / VIP) | **Display only**: provisional prices, checkout disabled |
| Owner panel (costs, flags, budget, security events) | **Partial**: backend tested; owner UI not tested with MFA |
| Payments, PWA, native apps, advanced nutrition, voice, 3D | **Not implemented** |

## Actual test results (run 12 Nov 2026)

| Suite | Result |
|---|---|
| Browser journey on staging (`tests/vora-ui-staging.e2e.mjs`, Playwright) | **8/8 PASS**, run twice today (screenshots below come from the second run) |
| M3B database enforcement on staging | **6/6 PASS** |
| Device / session / consent on staging | **18/18 PASS** |
| AI Coach pipeline on staging | **12/12 PASS** |
| Local Postgres harness (credits, AI backend, concurrency, M3, hardening, least privilege) | **378+ checks, 0 failures** |
| Edge Function unit tests (Deno) | **24/24 PASS** |
| i18n coverage, TypeScript build | **PASS** |
| `tests/no-mock-in-prod.mjs` source scan | **FAIL**: also fails on `main`, and VORA's deliberate mock provider would trip it. Needs updating. |

## Screenshots (`screenshots/`, real browser run against staging)

| File | What it shows |
|---|---|
| `01-device-verification-gate.png` | After sign-in, private screens stay locked until this device is verified |
| `02-wrong-code-rejected.png` | A wrong 6-digit code gets a generic rejection |
| `03-device-verified-ai-coach.png` | The correct emailed code unlocks the app (AI Coach) |
| `04-onboarding-saved.png` | Coach, tone, language and consents saved |
| `05-ai-coach-mock-reply-after-cost-confirmation.png` | The exact cost is confirmed, then a mock reply arrives |
| `06-credit-wallet-ledger.png` | Balance (2,500 trial minus charges) and ledger rows |
| `07-provisional-plans-checkout-disabled.png` | Plans come from the database; checkout is disabled |
| `08-existing-workouts-still-work.png` | Adding a workout still works (regression) |

## Installation and demo (local, staging only)
```bash
npm ci
# .env.staging — staging project URL and its PUBLIC publishable key (ask the owner), plus:
#   VITE_VORA_AI=1
npx vite build --mode staging --outDir dist-staging
npx vite preview --outDir dist-staging --port 4173   # open http://localhost:4173
```
1. Sign in with a staging test account → **Send code**.
2. The staging owner reads the code in the Supabase SQL editor and enters it: `select body from dev_mock_outbox order by id desc limit 1;`
3. Onboarding → AI Coach (confirm the cost) → Wallet → Plans → Workouts.

Database: apply `supabase/migrations/*.sql` in order on a **new** project. Deploy `supabase/functions/ai-coach` and `device-auth`.

## Known limitations
- No real email provider for device codes yet; staging uses an outbox table.
- AI is mock only, with no budget or key. Prices, credit costs and VIP fair-use limits are provisional.
- No payments, subscriptions billing, pause or grace logic. UPayments sandbox work exists on the separate, unmerged `day10-payments` branch.
- The Owner panel UI was not tested with an MFA-verified owner. The minimal UI is not visually polished.
- Not deployed publicly; production security migrations are awaiting owner approval.

## Excluded from this archive
`.env*` files, credentials, `node_modules`, build output, internal security findings and the privileged-functions review, test-account lists, customer data, and a stray Python wheel.
