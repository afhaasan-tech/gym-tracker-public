# HAYL (حيل) — formerly "Gym Tracker"

> **Provisional working brand.** HAYL / حيل is a working name for the CODED Day 9 submission. No trademark, domain or business-name clearance has been performed; do not treat it as legally available. Repository, Vercel project, Supabase project and database table names keep their original `gym-tracker` names on purpose.

React + Vite + Supabase (Auth, Postgres with RLS, Storage, Edge Functions). Live: https://gym-tracker-afhaasan.vercel.app

## Features
**Core:** email/password sign up, log in, log out; add workouts (exercise, sets, reps, weight); history; delete; each user sees only their own data (RLS).

**Files and Server Logic (D2):**
- Optional progress photo per workout in the private Storage bucket `progress-photos` (path saved in `workouts.photo_url`), shown with short-lived signed URLs. Preview before saving, replace/remove, clean placeholder. Images only (JPG/PNG/WebP/GIF), max 5 MB, validated in the browser **and** enforced by the bucket.
- `ai-summary` Edge Function: AI workout summary (OpenRouter free models). The suggestion lands in an editable box; the user edits it before saving.
- `ai-analysis` Edge Function: analyzes the user's last 7 days of workouts (read with the user's JWT, so RLS applies) and names under-trained muscle groups.
- Server-side limit: 5 AI requests per rolling minute per user, shared by both functions (`consume_ai_request` SQL function, advisory-locked). The 6th request returns HTTP 429 with `Retry-After` and a friendly message.

**Sections (one app, tabs):** تماريني (Supabase workouts, photos, AI summary, 7-day analysis), مكتبة التمارين (24 exercises; saving a session inserts a row into `workouts` under the signed-in user, RLS applies; duration-only logs are rejected because the table requires sets and reps), الغذاء (food diary + USDA list; **stored only in this browser's localStorage** keys `athar-meals` / `athar-foods`, never sent to Supabase), التشريح (3D atlas, lazy-loaded, model served locally from `public/body.glb`, CC BY-SA - see `docs/ANATOMY-SOURCES.md`; food data notes in `docs/FOOD-DATA.md`). The ported views live in `src/kw/` and were re-coloured to the app's teal/navy theme.

## Security
- `workouts.user_id` defaults to `auth.uid()`; RLS allows authenticated users to select/insert/delete only their own rows (insert rejects forged `user_id`). No update policy.
- Storage policies restrict every object to the folder `<user_id>/`; `photo_url` must start with the row's own `user_id/`.
- `OPENROUTER_API_KEY` exists only in Supabase Edge Function Secrets. The browser only has the project URL and publishable key. `.env` is git-ignored.
- `ai_requests` has RLS enabled with no policies (service role only).

## Setup
1. `npm install`; copy `.env.example` to `.env` (project URL + publishable key).
2. Apply `supabase/migrations/*.sql` in filename order, deploy `supabase/functions/*`, set secret `OPENROUTER_API_KEY`.
3. `npm run dev`

**Signup note:** Supabase's built-in email sender allows only a few emails per hour, which made signup fail with `over_email_send_rate_limit` (HTTP 429). For this classroom project "Confirm email" is turned off, so signup creates the account and signs in immediately. For production, re-enable it with a custom SMTP provider. Rate limits were not changed.

## Tests (all run against the real Supabase project)
- `tests/rls.test.mjs` - 17 checks: two accounts, isolation, forged `user_id` rejected.
- `tests/extras.test.mjs` - Storage isolation, MIME/size limits, shared rate limit (6th request = 429).
- `tests/e2e.test.mjs <url> <desktop|mobile> <ai|noai>` - 22 checks in real Chrome with a brand-new account created through the signup form: session persistence, login/logout, photos (preview, replace, validation), editable AI summary, 7-day analysis, UI 429 message, deletion removes the photo file.
- `tests/make-test-users-sql.mjs`, `tests/seed-demo-photo.mjs` - helpers for seeded test users and the demo photo.

Screenshots: `docs/screenshots/`.

## AI provider quota and model fallback
Two different limits can stop an AI request - they look different on purpose:
| Limit | Who enforces it | Response |
|---|---|---|
| 5 AI requests/min per user (shared by both functions) | **Gym Tracker** (`consume_ai_request`) | HTTP **429**, `source: "gym-tracker-rate-limit"`, `Retry-After` |
| OpenRouter free-tier cap: **50 free-model requests per day per account** (verified from the provider's own 429: `free-models-per-day … limit=50 remaining=0`), resets at **00:00 UTC** | **OpenRouter** (shared by *every* `:free` model, so falling back to another free model cannot bypass it) | HTTP **503**, `source: "provider-quota"`, exact reset time in the message |

Model strategy (`supabase/functions/*/shared.ts`): free text models are discovered at runtime from OpenRouter's public catalogue (10-minute cache; built-in list if it is down), preferred general-purpose models first; vision/code/tiny-context models and anything not `:free` are never called. A busy/empty/5xx model falls through to the next model; an account-level quota stops immediately with a clear message. Paid models are never used. Unlocking 1000 free requests/day would need a one-time 10-credit purchase - not done.

Mocks: no mock AI exists in the app or the Edge Functions. The only stub is in `tests/e2e.test.mjs` (`ai=mock`), runs only with `ALLOW_MOCK_AI=1`, and lives in a tester's browser. `tests/no-mock-in-prod.mjs` scans the deployed bundle and source.

AI tests: `tests/fn-fallback.test.mjs` (simulated provider, 11 checks), `tests/ai-real.test.mjs` (genuine models; exits 3 = blocked by provider quota, never a false pass).

## Running the live tests

The tests in `tests/` create their own throwaway accounts. Set `TEST_EMAIL_BASE` to a mailbox you own (plus-addressing is used, e.g. `you+tag@example.com`) and never put passwords on the command line; `tests/admin-live.e2e.mjs` asks for the admin email and password interactively (password input is hidden). Screenshots in `docs/screenshots/` are redacted.

## Deployment

Production: https://gym-tracker-afhaasan.vercel.app (Vercel project `gym-tracker`, Hobby, deployed from `main` of this repository; framework preset Vite, Node 22). Required build-time variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key is public by design; never put a service-role key or the OpenRouter key in the frontend). The AI key lives only in Supabase Edge Function secrets.

## What the app does (Day 9 final)

A Kuwait-first, multi-sport discovery platform (Arabic RTL) on React + Vite + Supabase + Vercel:

- **Public homepage and guided journeys** (no account needed): private coach, group training, self-guided workouts, food, booking, sports catalog, search, coach profiles. Login is requested only when saving or booking, and the user returns to the same step.
- **Roles, enforced in the database (RLS + SECURITY DEFINER functions + MFA claim), never in the UI:** Member (default for public signup), Coach (invitation-only), Super Admin (one) and Emergency Admin (one, limited). At most two privileged accounts can exist; Owner Dashboard access requires a TOTP (aal2) session; sensitive admin actions are written to an append-only audit log.
- **Free:** sports discovery, coach browsing, exercise library, muscle selection, workout tracking, food diary for members. **Future paid (not active):** coach sessions, packages, advanced plans, nutrition plans/consultations. Prices and bookings are demonstrations; no payment is processed.
- **«اختَر عضلتك» (Muscle Explorer):** pick a trainable muscle group on the 3D body and get its exercises.
- Day 9 core: Supabase Auth (e-mail + password, e-mail code verification), per-user ownership and RLS on workouts/food/profile/bookings, editable profile with calculated age.

Tests: `tests/db/` (local Postgres role/RLS suite, 175 checks) and `tests/*.e2e.mjs` (real browser against the deployed site; use pre-verified test accounts, see `tests/make-test-users-sql.mjs`).


## Brand, language and design (final Day 9 pass)
- **Name:** HAYL / حيل (Kuwaiti-dialect "حيل" = very / a lot, as in "حيل زين"; also "strength/effort"). Mark: two dhow sails (turquoise + gold) over a hull. Palette: deep navy `#060F1C`, turquoise `#22D3B6`, gold `#F2B84B`. Type: IBM Plex Sans + IBM Plex Sans Arabic. Alternates considered: هيلا / Heila, همّة / Himma. Name-conflict findings are in the submission notes; no legal clearance is claimed.
- **Language:** العربية | English switcher (topbar, login, verify screen). Arabic = RTL, English = LTR, saved in `localStorage` (`hayl-lang`) so it survives refresh and sign-in. Implementation: `src/i18n/` (Arabic string is the key; `t()`), English dictionary `en.ts` + `en-extra.ts`, localized data in `data-en.ts`. User-entered content (names, notes, real coaches' text) is never translated. Check: `node tests/i18n-coverage.mjs`.
- **Design system:** single stylesheet `src/index.css` (tokens, typography scale, cards, chips, forms, sidebar/bottom-nav), shared components in `src/ui.tsx`, branded loading/empty/error states and an error boundary.
- **Plans (display only, no payments):** `/plans`, constants in `src/plans.ts`. Free visitor, free member, HAYL Premium (*Available After Launch*, provisional KWD 2.900/month or 24.000/year), independent coach services (price set by coach, owner approved, configurable platform commission default 12% **not applied**), food/nutrition (basic diary free; specialist services later, no restrictive diets or automatic weight-loss goals). All prices are **assumptions**. Limits apply only to catalogue content (visitor 2 / member 3 exercises per muscle group; visitor muscle groups: chest, legs, core); saved workouts, food records and bookings are never limited. Nobody can be marked premium/paid by the app; `payment_status` stays server-controlled. Day 10 will add verified payments.

## Final test results (HAYL build, run against real Supabase)
| Suite | Result |
|---|---|
| `tests/db/run-local.sh` (local Postgres roles/RLS) | 175 / 175 PASS |
| `tests/day9-live.e2e.mjs` (auth, persistence, RLS, ownership, profile, bookings) | 25 / 25 PASS |
| `tests/food-diary-live.e2e.mjs` | 17 / 17 PASS |
| `tests/market-live.e2e.mjs` public / coach1 / coach2 / coach3 | 22 / 2 / 2 / 4 PASS |
| `tests/brand-i18n.e2e.mjs` (bilingual, RTL/LTR, overflow at 390/768/1280, nav, plans, limits, untranslated-Arabic scan) | 13 / 13 PASS |
| `tests/i18n-coverage.mjs` | 0 untranslated `t()` strings |

**BLOCKED / not claimed:** (1) real e-mail delivery of the OTP code (needs a real inbox; `tests/verify-email-live.e2e.mjs` supports an interactive code step); (2) owner dashboard in a browser with TOTP MFA (needs the owner to enrol and run `tests/admin-live.e2e.mjs`); owner actions in the coach tests were performed by calling the real `owner_*` RPCs under a simulated aal2 owner claim in SQL, as fixtures only; (3) Emergency Admin has not been assigned.
