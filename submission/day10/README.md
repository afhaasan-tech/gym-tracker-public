# CODED Day 10 — Payment Integration: evidence and submission status

**Status (updated 12 Nov 2026, 13:40 UTC):** real **UPayments sandbox** payments now work end to end:
- hosted checkout
- successful KNET test payment
- declined test payment
- retry after a decline
- **verified webhook**
- booking status updated only by the server

No real money moved; only documented sandbox test cards were used.

Two bugs were found and fixed during live testing, and both fixes are deployed to the Supabase Edge Functions:
1. **Pay Now was blocked by the browser.** The app sends an `x-lang` header that the functions did not allow (CORS). Fixed in `initiate-payment`.
2. **Webhooks were rejected with 400.** UPayments posts form-encoded bodies, not JSON. The HMAC signature was already valid. Fixed in `payment-webhook`; the signature is still verified over the exact raw body.

The official CODED Day 10 handout was never available in this project. The checklist follows your Day 10 brief (Phase 10 deliverables).

- **Source:** `source/` is the merged `main` (`fd8ba08`).
- **GitHub:** https://github.com/afhaasan-tech/gym-tracker-public (merged into `main` via PR #1)

## Phase 10 deliverables checklist

| # | Deliverable | Status | Evidence |
|---|---|---|---|
| 1 | Gateway selected and why | **COMPLETE** | `source/docs/DAY10-PAYMENTS.md` |
| 2 | Architecture and trust boundaries | **COMPLETE** | `source/docs/DAY10-PAYMENTS.md` |
| 3 | Working GitHub link | **COMPLETE** | Branch link above |
| 4 | Working deployment link | **COMPLETE** | https://gym-tracker-afhaasan.vercel.app: merged to `main` (PR #1, commit `fd8ba08`) and deployed by Vercel on 12 Nov 2026 14:14 UTC. Production check: `17`, `18`. |
| 5 | Pay Now flow | **COMPLETE** | `01`, `05` |
| 6 | Hosted sandbox checkout | **COMPLETE** | `05` (UPayments sandbox page, 3.000 KWD from the server), `06` (KNET test page) |
| 7 | Verified webhook execution | **COMPLETE** | `16`: audit trail row `webhook · CAPTURED · applied` at 13:39:47 UTC |
| 8 | payment_status and RLS protection | **COMPLETE (tests)** | `03`: 55/55 DB tests (members cannot set payment_status, paid cannot be downgraded, functions are service-role only) |
| 9 | Real-time Owner payment badge | **NOT CAPTURED** | Needs your owner login with MFA. Statuses are visible to the member (`08`, `11`, `15`). |
| 10 | ≥ 2 failure scenarios | **COMPLETE** | **Declined payment**: `09`, `10`, `11`. **Retry after decline**: `12`–`15`. **Duplicate webhook and double-click**: DB tests (`03`). Signature rejection: `04`. |
| 11 | PASS / FAIL / BLOCKED checklist | **COMPLETE** | This file |
| 12 | Remaining setup actions | **COMPLETE** | See "Remaining" below |

## Screenshots (`screenshots/`, real and unedited, 12 Nov 2026)

| File | What it proves |
|---|---|
| `01-booking-unpaid-pay-now.png` | My Bookings: server price, "awaiting payment" badge, Pay Now |
| `02-pay-now-gateway-not-configured-safe-error.png` | Before the secrets were set: the server refused safely and nothing was marked paid |
| `03-db-payment-tests-55-pass.png` | Payment DB tests 55/55 and marketplace RLS 175/175 |
| `04-deno-upayments-unit-tests-pass.png` | HMAC and webhook signature unit tests 4/4 |
| `05-sandbox-hosted-checkout.png` | Real UPayments **sandbox** hosted checkout, 3.000 KWD |
| `06-knet-sandbox-test-card-approve.png` | KNET sandbox page with the documented **test** card (approve expiry 09/30) |
| `07-return-page-payment-verified-paid.png` | Return page: **"تم الدفع بنجاح" (payment succeeded) / Paid**, shown only after server verification |
| `08-my-bookings-status-paid.png` | Booking list shows **Paid** |
| `09-knet-sandbox-test-card-decline.png` | Test card with the documented **decline** expiry |
| `10-return-page-payment-failed.png` | Return page: **"لم تكتمل عملية الدفع" (payment not completed) / Failed**, with a retry button |
| `11-my-bookings-status-failed.png` | Booking list shows **Failed** |
| `12`–`15` | Retry of the declined booking: new checkout → payment → **Paid** (this one applied by the **webhook**) |
| `16-audit-trail-verified-webhook-applied.png` | `payment_events` audit trail: initiate → reconcile/webhook → applied |
| `17-PRODUCTION-my-bookings-paid.png` | The **live production site** after deployment: My Bookings shows **Paid** badges |
| `18-PRODUCTION-return-page-paid.png` | The **live production** return page: payment verified |

## Production data written (test account `gymtest-0-…@example.com` only, UPayments sandbox only)
- **Bookings:** no new bookings today besides the one noted earlier (`221faf06…`). The two existing test bookings `ab72641b…` and `221faf06…` are now **paid** (sandbox).
- **Payment attempts:** 2 failed today (gateway not configured, then a test decline) and 2 captured (sandbox).
- **Audit events:** 10 in `payment_events`.
- Nothing was deleted. No real customer or real money was involved.

## Remaining
1. **Owner real-time badge screenshot:** sign in as owner with MFA → Owner dashboard → bookings. Only you can do this.

Everything else in the checklist is complete. Payments remain **sandbox only**: the code refuses any non-sandbox UPayments host.
