# VORA — Requirements Matrix (Phase 0 baseline)

Status of this document: **audit only. Nothing here has been implemented, migrated or deployed.** "Existing" describes the repository `main` (commit `cb61fc2`) + the production Supabase project, inspected read-only on 2026-11-12. Day-10 branch work is `day10-payments` (unmerged).

Legend — Phase: P1 = secure core + AI engine, P2 = experience + fitness, P3 = nutrition/engagement/commercial, P4 = hardening/launch, DEF = deferred. Test status of every row is **NOT TESTED** until its phase runs.

| # | Requirement | Existing implementation | Proposed change | Dependencies | Security concerns | Test plan | Phase |
|---|---|---|---|---|---|---|---|
| **Platform / PWA** |||||||
| 1 | Responsive web app, mobile-first | React 19 + Vite SPA, hash router, bilingual, responsive (Day 9) | Keep stack; rebuild layouts on the new light design system | Design tokens (row 4) | none new | Playwright at 390/768/1280; iOS/Android emulation | P1–P2 |
| 2 | Installable PWA | `manifest.webmanifest` + icons exist; **no service worker**, no `vercel.json` | Service worker (app-shell precache only), update flow, install guidance | Vite PWA tooling or hand-written SW | Never cache API/AI/health responses or private assets; cache per user must not leak | Lighthouse PWA, offline test, logout-clears-cache test | P1 |
| 3 | Offline workout logging + safe sync | none (workouts require network) | IndexedDB queue keyed by user id, idempotent client ids, server upsert, cleared on logout | Service worker; `workouts` idempotency column | Cross-account leakage; duplicate rows | Offline→online duplicate test; account switch test | P2 |
| 4 | Lighter premium design system (off-white / charcoal / light turquoise), tokens, components | Dark navy system in `src/index.css`, `src/ui.tsx` (Day 9) | Token layer + component library; migrate all routes | none | a11y contrast | Contrast checks; visual regression | P1 (foundation) / P2 (all routes) |
| 5 | Language switch shows only **عربي \| English** | `العربية \| English` switcher, `t()` dictionary, RTL/LTR (Day 9) | Change labels; Kuwaiti-natural copy pass; never show "dialect" labels | i18n files | none | brand-i18n suite (extend) | P1 |
| 6 | iPhone Safari no focus-zoom (inputs ≥16px) | inputs 14–15px in places | Computed font-size ≥16px on inputs/selects/textareas; keep pinch-zoom | design tokens | none | WebKit emulation computed-style test | P1 |
| 7 | Unified landing page + app access | public home exists (journeys, plans teaser) | New landing; advertise only live capabilities | feature flags (row 9) | claim accuracy | content audit vs flags | P2 |
| 8 | No fake store links | none present | keep | – | – | grep test | P1 |
| 9 | Feature flags / config | `platform_settings` table (2 rows, RLS, no direct policy) | Reuse for typed flags & parameters (read via RPC) | Owner UI | flag tampering | RLS tests | P1 |
| **Auth / accounts** |||||||
| 10 | Email+password signup with **6-digit email OTP** | OTP verification screen + `verifyOtp` already live (Day 9) | Keep; ensure email template shows `{{ .Token }}`; custom SMTP | Supabase email template + SMTP (**blocker**) | Built-in SMTP is heavily rate-limited; OTP never logged | Real-inbox test (BLOCKED today) | P1 |
| 11 | Password reset link only on request | `resetPasswordForEmail` exists | keep | – | enumeration-safe messages | test | P1 |
| 12 | New device ⇒ extra email OTP | none | `trusted_devices` + `device_challenges` + OTP Edge Function; session marked untrusted until verified | SMTP, Edge fn | Password sign-in already issues a JWT → untrusted state must be enforced in RLS/Edge (see Security Model §3) | Concurrency + bypass tests | P1 |
| 13 | **One active session per user**, new-device verify revokes old | none (64 sessions exist in `auth.sessions` for 36 users) | `active_session_id` in DB, revoke others via admin API, server-side check on sensitive ops | Supabase JWT `session_id` claim; plan limits | JWTs live until expiry (≤1 h) — instant invalidation is **not** promised, only for server-checked operations | Two-browser test | P1 |
| 14 | Owner/Admin MFA mandatory, unchanged | TOTP aal2 enforced in DB (`is_admin()`); **owner flow in browser still BLOCKED** | keep; add coach/support-staff MFA rule for the future | owner enrolment | don't weaken | `admin-live` after MFA enrol | P1 |
| 15 | Rate limiting / abuse / safe errors / security events | AI limiter (5/min) in DB; none generic | `rate_limits` + `security_events`; Edge-side limiter | – | OTP/AI/credit endpoints | abuse tests | P1 |
| 16 | Progressive onboarding cards, optional fields | `profiles` (name, DOB, height, weight) | Card flow; new `member_preferences` and **separate** `member_health_profile` | consents (row 17) | health data minimisation | UI + RLS tests | P1 |
| 17 | Explicit consent for sensitive data / AI sharing | none | `consents` table (purpose, version, granted/revoked) checked server-side | – | consent bypass | tests | P1 |
| 18 | Data review/correct/export/delete; 30-day deletion | none | Account-deletion state machine, export function, purge job | scheduler | legal retention (orders) | lifecycle test | P1 (state machine) / P3 (purge) |
| **AI Coach** |||||||
| 19 | AI Coach chat (Rashid/Sarah, customisable, Kuwaiti Arabic/English) | `ai-summary`, `ai-analysis` Edge Functions (OpenRouter, free models, 5/min) | New `ai-coach` function behind a provider abstraction | provider choice (research) + keys (**blocker**) | prompt injection, PII to provider, secret isolation | contract tests, red-team prompts | P1 |
| 20 | Multi-model routing (fast/plan/vision/STT/TTS) | single OpenRouter router | `ai_routes` config + fallback + explicit error states | provider research | cost runaway | failover tests | P1 (text) / P2–P3 (others) |
| 21 | Private AI conversations & memories with controls | none | `ai_conversations`, `ai_messages`, `ai_memories` (owner-only RLS) | consents | admin must not read by default | RLS isolation tests | P1 |
| 22 | Voice input/spoken replies, avatar | none | browser STT/TTS first; avatar later | assets licensing (**blocker**) | microphone consent | device tests | P2 |
| 23 | Proactive reminders, quiet hours | none | notification settings + (web push P3) | push infra | no background paid AI without consent | tests | P3 |
| **Credits / subscriptions / payments** |||||||
| 24 | Internal credits, separate ledgers (promo/purchased/reward/subscription) | none | Append-only `credit_ledger`, derived balances, reservations | – | double-spend, races, tamper | concurrency suite | P1 |
| 25 | Reservation → AI → settlement/release, idempotent | none | `credit_reserve/settle/release` SECURITY DEFINER fns, idempotency keys | ai-coach fn | retry/double click | chaos tests | P1 |
| 26 | One-time 2,500 trial credits | none | `trial_grants(user_id unique)` + grant fn after verified email | – | duplicate accounts (abuse) | uniqueness + race test | P1 |
| 27 | Owner-configurable operation costs | none | `ai_operations` (key, credits, enabled) editable by Owner via RPC | Owner UI | price tampering | RLS tests | P1 |
| 28 | Plans (Essential/Pro/Elite/VIP), entitlements, expiry, 3-day read-only grace | `PlansPage` + `src/plans.ts` display constants only | `plans`, `subscriptions`, entitlement function; grace as read-only state | – | entitlement forgery | state-machine tests | P1 (foundation) |
| 29 | Pause (Pro/Elite/VIP, once/cycle, ≤14 d) | none | pause transitions in subscription fn | row 28 | retroactive pause | edge-case tests | P3 |
| 30 | Custom package builder (server-priced) | none | `packages` + server pricing function | catalog | client price | tests | P3 |
| 31 | Top-ups (configurable presets) | none | `orders` + fulfilment fn; **disabled by flag** | payments (row 32) | fulfilment without verification | verification tests | P3 |
| 32 | Sandbox payments (UPayments), verified fulfilment only | Day-10 branch + **already-applied production objects** (see ARCHITECTURE §6) | Generalise bookings-only design to orders; keep sandbox-only | secrets (**blocker**) | see ARCHITECTURE §6 | payments-live suite | P1 (design) / P3 (activate) |
| 33 | Owner config of plans/prices/limits/promos/routing | partial (`platform_settings`, owner panel) | Owner "Commerce" + "AI" panes; high-risk actions need step-up | row 14 | privilege escalation | admin tests | P1 |
| **Fitness** |||||||
| 34 | Redesigned Muscle Explorer (2 body models, accurate regions) | Three.js explorer, 191→7 group mapping, one model | New models/regions | licensed assets (**blocker**) | none | interaction tests | P2 |
| 35 | Separate animated exercise demos (3D, speed, play/pause) | none (text cards) | Separate viewer + licensed animations | licensed assets (**blocker**) | licensing | – | P2 |
| 36 | Exercise library (search/filters/favourites/recs) | 24 exercises, basic view | expand + schema | content | – | tests | P2 |
| 37 | Smart workout logging, rest timer, charts, achievements | basic log (`workouts`) | extend | row 3 | – | tests | P2 |
| **Nutrition** |||||||
| 38 | Manual food diary, search | Day-9 food diary (`food_entries`, `custom_foods`, USDA extra list) | keep | – | – | existing suite | existing |
| 39 | Barcode, meal-photo, pantry-photo, recipes | none | provider + product DB research | vision provider, product data licence | allergen over-claims | accuracy tests | P3 |
| 40 | Kuwait knowledge layer (sourced, dated) | none | curated dataset first, RAG later | data sourcing | invented data | provenance tests | P3 |
| **Engagement** |||||||
| 41 | Achievements, capped rewards, shareable cards, notifications | none | later | credit ledger (reward source) | reward farming | abuse tests | P3 |
| 42 | Group challenges/leaderboards | none | **DEFERRED** | – | – | – | DEF |
| **Legacy / admin** |||||||
| 43 | Human-coach marketplace deferred, data preserved | live: 5 coach profiles (3 demo), 12 services, 710 slots, 9 bookings, coach/owner UIs | Flag-hide purchasing (after approval); no deletes | feature flags | existing customer obligations | regression tests | P1 (flag) |
| 44 | Owner panel: users, prices, credits adjustments, routing, alerts, audit, analytics, support | owner dashboard (coaches, services, users, bookings, sports, audit) | add panes incrementally | rows 24–33 | PII/health exposure | admin tests | P1–P3 |
| 45 | Backups/restore, incident response, monitoring | none documented; plan appears to be Supabase **Free** | document + verify | plan upgrade (**decision**) | data loss | restore drill | P4 |

## Deprecated / conflicting legacy behaviour found
- `/plans` shows price comparisons that are *display-only constants* — must be replaced by DB-driven plans before any claim of availability.
- Public marketplace journeys ("private coach", "group training", "book a session") conflict with the AI-first MVP → flag-hide after approval.
- Booking-only payment code on `day10-payments` conflicts with a generic order model (ARCHITECTURE §6).
- Existing `ai-summary`/`ai-analysis` use a free-model router with a 5/min limiter and no credit accounting → superseded by the credit-aware coach function (kept running until replaced).
- Supabase migration history names drift from repo filenames (`20261111120413 marketplace_roles` vs file `20261112_…`; payments recorded as `20261111170316`). Harmless for the SQL editor flow, but `supabase db push` would misorder → repair before adopting the CLI.
