# CODED Day 9 — Submission (VORA | ڤورا)

- **Live app:** https://gym-tracker-afhaasan.vercel.app
- **Public GitHub:** https://github.com/afhaasan-tech/gym-tracker-public (branch `main`)
- **Brand:** VORA | ڤورا — owner's final decision, **provisional**; no legal clearance (see `BRAND-CHECK.md`).

## Description (English)
VORA is a Kuwait-first, bilingual (Arabic RTL / English LTR) sports platform. Visitors can explore sports, browse approved independent coaches, try free self-guided training, use the Muscle Explorer («اختَر عضلتك») and the food guide without an account. Members get Supabase-authenticated accounts with private workouts, a food diary, a profile and demo bookings, all protected by row-level security. Coaches are invitation-only and manage only their own services, availability and bookings; services are published only after owner approval. A Super Admin dashboard (TOTP MFA required server-side) controls the platform. Plans and prices are displayed only (provisional KWD assumptions, "Available After Launch"); no payments exist yet.

## Day 9 Core — results (real Supabase, real browser)
| Requirement | Evidence | Status |
|---|---|---|
| Signup / login / logout, session persistence | `day9-live` 25/25 (production) | PASS |
| Profile persistence, validation | `day9-live` | PASS |
| `workouts.user_id` ownership, RLS SELECT/INSERT/DELETE, cross-account isolation, forged user_id rejected | `day9-live`, local RLS suite 175/175 | PASS |
| Anonymous restrictions | `day9-live`, `food-diary-live` | PASS |
| Food diary per-user storage, legacy import, offline safety | `food-diary-live` 17/17 | PASS |
| Public discovery, booking wizard + login return, Muscle Explorer, gating | `market-live public` 22/22 | PASS |
| Coach lifecycle (claim, profile, service, approval, slot, booking, isolation) | `market-live coach1-3` 2+2+4 (run before rename, same DB/code) | PASS |
| Bilingual, RTL/LTR, overflow 390/768/1280, nav, plans, preview limits | `brand-i18n` 13/13 (production) | PASS |
| Role escalation / emergency-admin limits / owner authorization at DB level | local RLS suite 175/175 | PASS |
| **Email OTP real delivery** | needs a real inbox code | **BLOCKED** |
| **Owner dashboard in browser with TOTP MFA** | needs the owner to enrol MFA and run `tests/admin-live.e2e.mjs` | **BLOCKED** |
| Emergency Admin | not assigned | NOT TESTED |

Extensions A/B (marketplace + roles; bilingual/branding + plans display) are implemented and covered by the rows above. Owner-approval steps in the coach tests used the real `owner_*` functions under a simulated owner session in SQL (fixtures only).

## Required screenshots (owner must capture — dashboard not reachable from the build environment)
1. **Supabase → Authentication → Users** (`docs/screenshots/day9-auth-users.png`).
2. **Supabase → Table Editor → `workouts` → RLS / Policies** (`docs/screenshots/day9-rls-policies.png`).

Capture steps: open https://supabase.com/dashboard/project/zbqdmebrxqshcsozamwg. (1) Authentication → Users; (2) Database → Tables → `workouts` → "RLS" / Policies (shows RLS enabled and the SELECT/INSERT/DELETE policies). Redact before saving: every email address, user UUID, last-sign-in IP/time if shown, and any avatar; blur or black-box the browser URL bar if it contains tokens; never show API keys, the service-role key, or the Settings → API page. Use a rectangle fill (not blur) on emails. Save as PNG over the two files above.

## Deferred to Day 10 (not started)
Payments/checkout/subscriptions/refunds/payouts, platform commission, real premium entitlement, paid recipes/meal plans, qualified nutrition consultations, advanced programs, real booking fulfilment.

## Manual actions that cannot be automated
1. Capture the two Supabase screenshots (above).
2. Enrol TOTP MFA on the Super Admin account, then run `node tests/admin-live.e2e.mjs`.
3. Verify a real signup e-mail OTP (`VERIFY_INTERACTIVE=1 node tests/verify-email-live.e2e.mjs <creds>`), and review the e-mail template/SMTP.
4. Trademark/domain checks for the name.
5. Approve deletion of leftover temporary test accounts.
