# VORA — Architecture Blueprint (Phase 0, proposal only)

## 1. Constraints (from the master spec + final clarifications)
Existing project (reuse repo, Supabase project, auth, RLS). Web + installable PWA only; no native apps. No production change, deploy, merge-to-main, secret change, real charge or data deletion without explicit approval. Credits: 2,500 once, configurable costs, reserve→execute→settle, separate ledgers. Subscriptions: manual renewal only; expiry stops paid entitlements at once; 3-day read-only grace; pause for Pro/Elite/VIP once per cycle ≤14 d; purchased credits survive. Human-coach features deferred (data preserved). Sandbox payments only.

## 2. Material contradictions / dependencies (need your decision)
| # | Issue | Why it matters | Proposed resolution |
|---|---|---|---|
| C1 | "One active session, instant invalidation" vs stateless JWTs | A revoked session's access token stays valid until it expires (≤1 h by default). Supabase "single session per user" and shorter token/inactivity limits are Pro-plan settings; project appears to be on **Free**. | Enforce in the database: store `active_session_id`; RLS helpers and Edge Functions compare the JWT `session_id` claim to it for sensitive tables/operations; revoke other sessions through the admin API. Promise "immediate for protected data/operations", not for the raw token. Decide on plan upgrade. |
| C2 | "New device needs email OTP after password" | Password sign-in already returns a session; Supabase has no native email second factor. | Mark sessions *untrusted* until a device challenge (OTP via our Edge Function + SMTP) succeeds; untrusted sessions pass no RLS helper. Needs custom SMTP (**blocker**). |
| C3 | Credits "preserve unused balances" on pause vs. expiry of subscription credits | Spec silent on whether monthly subscription credits expire. | Default: subscription credits expire at term end (owner-configurable per plan); purchased/reward credits never silently expire. **Please confirm.** |
| C4 | VIP "fair-use governed" has no numbers | Cannot be enforced or tested. | Owner-configurable fair-use limits (default placeholder, documented as draft). |
| C5 | "Avoid new production tables for future features" vs. Phase-1 needs | Credits/subscriptions/AI need tables. | Phase 1 adds only tables with an immediate consumer; nothing for challenges/leaderboards. |
| C6 | Human-coach deferred vs. live public marketplace + 9 real bookings | Hiding live purchase paths could breach customer expectations. | Feature flag, default unchanged; hide only after your approval; never delete. |
| C7 | Light premium palette vs. current dark theme | Large visual change touches every route. | Token layer first (P1), route migration in P2; text-based tests unaffected. |
| C8 | Commercial product on **Vercel Hobby** | Vercel Hobby is for non-commercial use; paid sales need Pro. Supabase Free has no PITR backups. | Not a Phase-1 blocker; **launch blocker** (P4). |
| C9 | Licensed 3D avatar/anatomy/animation assets | Cannot be generated or invented. | Owner supplies/buys licensed assets (P2 blocker). Phase 1 uses 2D avatar placeholders clearly labelled. |
| C10 | AI provider choice needs live pricing/privacy research | Not decidable offline. | Research step is the first Phase-1 task; abstraction layer first. Existing `OPENROUTER_API_KEY` secret already set. |

## 3. Target architecture
```
Browser (React PWA, per-user IndexedDB, SW caches app shell only)
   │  JWT (+ session_id claim)                      Owner browser (aal2 TOTP)
   ▼                                                      │
Supabase Auth ──▶ RLS helpers: is_trusted_session(), is_admin()  ◀──────────┘
   │
   ├─ Postgres (RLS deny-by-default; SECURITY DEFINER fns for every money/entitlement/credit mutation)
   ├─ Edge Functions (service role, secrets): ai-coach, device-challenge, credit-*, order-*, payment-webhook/reconcile
   └─ Storage (private buckets, short-lived signed URLs)
External: AI providers (server-side only, routed by ai_routes), UPayments sandbox, SMTP provider
```
Reusable business logic lives in Edge Functions/SQL functions with stable JSON contracts (future native clients).

## 4. Proposed file structure (Phase 1)
```
src/
  design/            tokens.css, components/ (Button, Card, Drawer, Modal, Badge, Table, Chart…)
  features/auth/     SignIn, SignUp, OtpVerify, DeviceChallenge, SessionGuard
  features/onboarding/ cards/, consent/
  features/coach/    CoachChat, CoachPicker, CostConfirm, QuickActions
  features/wallet/   Wallet, LedgerList, PlanCards
  features/owner/    CommercePane, AiConfigPane
  lib/api/           typed clients for Edge Functions (contracts shared with tests)
  pwa/               sw.ts, offlineQueue.ts, installPrompt.tsx
supabase/
  migrations/        additive, one concern per file (see §5)
  functions/         ai-coach, device-challenge, credit-api, order-api, _shared/
tests/               db/ (local Postgres harness), edge/ (Deno), e2e/ (Playwright)
docs/                VORA-*.md
```

## 5. Database migration plan (all additive; nothing applied)
Order, each with a tested **down** script and a local-harness test before any staging use:
1. `config`: reuse `platform_settings` for flags (`ai_coach_enabled`, `credits_enabled`, `human_coach_purchasing`, `payments_mode`) — read through RPC.
2. `consents`, `member_preferences`, `member_health_profile` (separate, owner-only RLS, no admin policy).
3. `trusted_devices`, `device_challenges`, `user_session_state`; `is_trusted_session()`.
4. `rate_limits`, `security_events` (append-only).
5. `ai_operations` (catalogue + costs), `ai_routes` (config, no secrets), `ai_jobs` (idempotency + status).
6. `credit_ledger` (append-only; source ∈ promo|purchased|reward|subscription; type ∈ grant|reserve|debit|release|adjust|purchase; signed amount; unique idempotency key), `credit_reservations`, `trial_grants(user_id unique)`, balance view/function. No table privileges for `authenticated` except SELECT own.
7. `plans`, `subscriptions` (state: active|paused|expired|grace|cancelled), `subscription_events`, `entitlements()` function.
8. `ai_conversations`, `ai_messages`, `ai_memories` (owner-only; no admin read path by default).
9. Payments generalisation (see §6): `orders`, `order_items`, re-pointing `payment_attempts`.
Rollback strategy: migrations are reversible except data written; feature flags default **off**; staging first; production only after your approval with a pre-migration logical backup (Free plan has no PITR — take a manual `pg_dump`-equivalent export of affected tables first).

## 6. Day-10 UPayments audit (read-only)
**State found** — branch `day10-payments`: 7 commits, 26 files, *not merged* (`main` = `cb61fc2`). **Already applied to production:** migrations `20261113_payments` and `20261113b_payment_sweep` (recorded as versions `20261111170316/…557`); 3 Edge Functions v2 (`initiate-payment` jwt, `payment-webhook` no-jwt, `payment-reconcile` no-jwt); extensions `pg_cron`, `pg_net`; cron job `vora-payment-reconcile` every minute (60/60 runs succeeded last hour, ~1,100 invocations logged); `bookings` in the Realtime publication; `bookings_before_update` replaced. Production data: `payment_attempts` 1 (failed, `checkout_not_created`), `payment_events` 1, **0 captured, 0 paid, no real money**; 3 temp users (`…7af06a`) + 1 booking; no gateway secrets set, so every real checkout returns 502.

**Security verified:** payment tables RLS-on; members read only non-sensitive columns of own attempts; `payment_*` functions executable by `postgres`/`service_role` only (security advisor does not flag them); guard trigger makes `paid` immutable and requires a verified captured attempt; local harness 175 + 55 pass; Deno 4/4; live security phase 5 pass / 1 blocked.

**Reuse for subscriptions / top-ups / packages**
| Component | Verdict |
|---|---|
| `upayments.ts` (HMAC, sandbox-only guard, compact/expand ids, createCharge, fetchStatus incl. PENDING≠decline) | **Reuse** unchanged |
| Webhook pattern (HMAC → provider lookup → reference/amount/currency → apply) | **Reuse** |
| `payment_events` audit, `payment_sweep_state` throttle, cron sweep | **Reuse** |
| `payment_apply` core (idempotent, no downgrade, late-capture) | **Generalise** — settle an *order*, then call a fulfilment function in the same transaction |
| `payment_attempts` (booking_id NOT NULL, one-open-per-booking index) | **Redesign** → `order_id`; keep booking path as one order type |
| `payment_start`, `bookings_before_update` guard, `/pay/return/:bookingId`, Pay Now on bookings, Realtime on `bookings`, user-mode reconcile keyed by booking | **Isolate** (booking-specific) |
| Frontend Pay Now/return/badges | **Reuse components**, parameterise by order |

**Can payment grant credits/subscriptions without verified provider confirmation? Today: no** — the only fulfilment is `bookings.payment_status='paid'`, reachable only via `payment_apply` (service_role) after an authenticated provider lookup. For credits/subscriptions the same guarantee must be rebuilt, not assumed: one `order_settle(order_id, facts)` SECURITY DEFINER function (service_role only), inside one transaction: verify attempt/amount/currency/provider track id, write `credit_ledger` row with idempotency key `purchase:<order_id>`, activate subscription; no client-callable fulfilment; ledger/subscription tables writable only by definer functions.

**Gaps to fix before reuse**
1. `payment_apply` does not *require* a provider track/payment id for CAPTURED and `provider_track_id` has no unique index → require it, add unique index, store provider payload hash.
2. Real provider webhook signing is **unverified** (secrets never set; sandbox did call our URL). If unsigned/different scheme, webhooks fail closed and only return-page/cron reconcile converge → test before depending on it.
3. User-mode reconcile has no per-user throttle → could exhaust the provider's 30 req/min limit; add limiter.
4. Public `payment-reconcile` sweep (no JWT) is throttled in DB and applies only provider-confirmed outcomes — acceptable, but re-evaluate once a secret can be set.
5. Late `CAPTURED` after expiry still fulfils (money received) — for credits define price-change/refund handling; refunds/chargebacks are out of scope and need a ledger-reversal design.
6. Migration-history names drift (see Requirements Matrix) — repair before CLI use.
7. Unfinished tests: `payments-live` ran only the *security* phase (T06–T10); **T01–T05, T09, T10b, T11–T14 (checkout, injection, double-click, return-forgery, real KNET success/decline, duplicate webhook, abandon, Realtime) are NOT TESTED**; Owner-dashboard badge BLOCKED on owner MFA.
8. Day-9 regression suites were **not re-run on production after** the payments migration (only the local harness). Recommend running them (needs temp accounts) before further prod changes.

**Impact of already-applied production changes:** additive tables; stricter booking guard (no paid rows exist, so no behaviour change observed); Realtime now streams `bookings` changes (RLS-gated); two extensions + a per-minute cron call (low load, harmless while no open attempts; can be paused with `cron.alter_job` — recommended only, not done); two public endpoints (`payment-webhook` returns 401 to unsigned/forged requests — tested). Nothing user-visible on `main`.

**Safe strategy:** (a) keep everything as is; do not merge or redeploy; (b) create the order-based design on a *new* branch from `day10-payments` in a staging Supabase project; (c) port, then retire the booking-specific objects only after approval via a forward migration (rollback = restore previous functions from git; tables are additive so dropping unused ones is optional); (d) complete the missing live tests in staging with the sandbox secrets; (e) production changes only with your approval + pre-migration table exports.

## 7. Isolated environment (blocker / decision)
Supabase branching needs a paid plan. Options: (1) create a second free Supabase project "vora-staging" (recommended; needs your approval to create); (2) local Postgres harness only (no Auth/Edge) — insufficient for end-to-end tests.
