# Day 10 — Payments for VORA (sandbox only)

> **Note on the brief:** the "attached CODED Day 10 instructions" file was not present in the conversation. This work follows the requirements written in the message itself. If the CODED handout has extra items, compare against `DAY10-SUBMISSION.md`.

## Gateway decision
**UPayments (Kuwait), sandbox** — verified against the current official docs (`developers.upayments.com`, fetched 2026-11-11):

| Item | Verified value |
|---|---|
| Sandbox base | `https://sandboxapi.upayments.com/api/v1/` |
| Create hosted checkout | `POST charge` → `201 {status:true, data:{link}}` (a `sandbox.upayments.com?session_id=…` page) — **confirmed by a real sandbox call** |
| Auth | `Authorization: Bearer <API key>`; optional-but-documented HMAC headers `X-Timestamp` + `X-Signature` = Base64(HMAC-SHA256(secret, `timestamp + METHOD + path + body`)), path = text after `/api/v1/` |
| Required body | `order{id,description,currency,amount}`, `language`, `reference{id}`, `returnUrl`, `cancelUrl`, `notificationUrl`; optional `paymentLinkExpiryInMinutes` (default 30) |
| KWD amount | decimal number, e.g. `2.5` (we send 3-decimal-rounded numbers) |
| Sandbox credentials | published in the docs ("Test Mode"): non-whitelabel test bearer key + test HMAC secret — **shared public sandbox keys, no account needed**; kept in Supabase secrets anyway |
| Test cards | KNET `8888880000000001`, expiry `09/30` = captured; any other expiry = Not Captured. Credit-card expiry `01/39` = APPROVED, `05/39` = DECLINED |
| Webhook | `POST` to `notificationUrl`; headers `X-Timestamp`, `X-Signature`; signature = Base64(HMAC-SHA256(secret, `timestamp + "POST" + FULL_NOTIFICATION_URL + raw body`)). Payload fields include `result`, `track_id`, `order_id`, `requested_order_id`, `payment_id`, `isTerminalStatus` |
| Authoritative check | `GET get-payment-status/{track_id}` or `?session_id=` (30 req/min limit) |
| Results | `CAPTURED` (paid), `NOT CAPTURED`, `CANCELED`, `FAILED`, `ERROR`, `PENDING`, … |
| Idempotency | **No documented idempotency-key header.** We therefore use our own attempt ID as `order.id`/`reference.id` (unique per attempt) plus a DB uniqueness rule "one active attempt per booking" and row locks. |

MyFatoorah/Tap were not needed: UPayments is reachable and testable now.

## Architecture
```
Member browser ──(booking id only)──▶ initiate-payment (Edge Fn, JWT)
   │                                    1 authenticate user, 2 check ownership, 3 load booking + service price
   │                                    4 payment_start() locks booking, creates ONE attempt (status created)
   │                                    5 POST UPayments /charge (amount from DB, KWD)  6 payment_set_checkout() → awaiting_payment
   ◀───────────── hosted checkout URL ──┘
Browser ──▶ UPayments hosted page (card data never touches VORA) ──▶ returnUrl / cancelUrl  (#/pay/return — display only)
UPayments ──(signed webhook)──▶ payment-webhook (Edge Fn, no JWT, HMAC)
                                    verify HMAC + timestamp → GET get-payment-status (server-to-server)
                                    match attempt, amount, currency, reference → payment_apply() → paid / failed
payment-reconcile (cron + on-demand) ─▶ asks provider for overdue / unresolved attempts → payment_apply() or expire
Supabase Realtime (bookings) ──▶ Owner dashboard badge changes live; member return page polls its own row
```

### Trust boundaries
1. **Browser is untrusted.** It sends only `booking_id`. Amount, currency, status are never accepted from it. The `?status=` on the return URL is ignored; the page shows "Verifying payment" until the row in the database says otherwise.
2. **Edge Functions are trusted** and hold the provider key/secret in Supabase secrets. They are the only callers (service role) of the payment SQL functions.
3. **UPayments is trusted only through verification:** webhook HMAC **and** a fresh server-to-server status lookup. A webhook body alone never marks anything paid.
4. **Database is the last line of defence:** `payment_status` cannot be changed by `anon`/`authenticated` (column privileges + trigger); `paid` requires a verified captured attempt row and can never be downgraded.

### Payment states (`bookings.payment_status`)
`pending` → `awaiting_payment` (checkout created) → `paid` (verified CAPTURED) | `failed` (verified decline/cancel) | `expired` (abandoned, reconciled). `failed`/`expired` may start a **new** attempt (back to `awaiting_payment`). `paid` is terminal.
Attempt states: `created`, `checkout_ready`, `captured`, `failed`, `cancelled`, `expired`.

### Four failure modes
1. **Declined payment** — provider result `NOT CAPTURED`/`FAILED`/`CANCELED`; becomes `failed` only after the server-side provider lookup confirms it.
2. **Abandoned checkout** — the link expires (15 min); the scheduled reconcile asks the provider first, expires the attempt only if it is not captured. A late `CAPTURED` after expiry is still applied (money received is never ignored; audit row `late_capture_applied`).
3. **Double click on Pay Now** — button disabled while pending; server returns the existing active attempt (unique partial index + `FOR UPDATE` lock) so only one checkout and one charge exist.
4. **Duplicate webhook** — each event has an idempotency key (`attempt + track_id + result`); the second delivery is logged as `duplicate` and changes nothing.

## Data model (migration `20261113_payments.sql`, forward-only)
`payment_attempts` (provider ids, amount, currency, idempotency key, checkout URL, status, failure reason, gateway response, timestamps), `payment_events` (append-only audit trail), guard trigger on `bookings`, `SECURITY DEFINER` functions `payment_start / payment_set_checkout / payment_apply / payment_overdue` executable by `service_role` only, `bookings` added to the Realtime publication (RLS still applies).

## Verified facts discovered while integrating (real sandbox calls)
- `reference.id` is limited to **35 characters** (a 36-char UUID gets HTTP 422). We send the attempt UUID **without dashes (32 hex)** as `order.id`, `order.reference` and `reference.id`, and map it back in the webhook (`requested_order_id`).
- An **unpaid** checkout answers `get-payment-status?session_id=…` with `result: "NOT CAPTURED"`, `status: "PENDING"` and no `track_id`. That is *not* a decline. A terminal failure is only accepted when the provider also returns a `track_id` / `status: done`.
- Sandbox KNET test page (`kpaytest.com.kw`): card `8888880000000001`, expiry `09/30`, any PIN → `CAPTURED`; any other expiry (e.g. `01/31`) → `NOT CAPTURED` with a `track_id` (the documented decline path).
- The provider appends `?payment_id=…&result=…&track_id=…&requested_order_id=…` to `returnUrl`; the app **ignores all of it**.
- The provider calls `notificationUrl` itself after payment (`notify_url_called: true`).
