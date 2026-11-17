# VORA — effects of the pending migrations (20261119 → 20261124)

Status: applied and tested on a **local Supabase stack** only (real Postgres 17, auth, PostgREST, Edge Functions run with Deno).
**Not applied to staging or production.** Apply in file-name order. Every file is wrapped in one transaction and is additive:
no table is dropped, no customer row is deleted, no balance or ledger row is changed.

| File | What it changes | Effect on existing data |
|---|---|---|
| `20261119_two_devices_trainer.sql` | Two trusted devices per account (`user_active_sessions`), `subscriptions`, the one free trial conversation (`trainer_trials`, `trainer_settings`), `trainer_access()`, support tickets, trainer operation prices (50 / 300 / 100 / 500 coins) | The current active session of each member is copied into the new table, so nobody is signed out. Replaces the device functions (a third device now evicts the oldest instead of the only one). Re-creates two check constraints on `ai_routes` to allow the provider name `gemini`. |
| `20261120_purchases.sql` | `coin_packs`, `purchase_orders`, `purchase_events`, purchase functions (server-side price snapshot, exactly-once fulfilment) | None. New tables only. |
| `20261121_exercise_library.sql` | `muscles`, `exercise_library`, subscriber-only library RPCs, plans `monthly` / `yearly` (provisional KWD 7 / 70), `plans.period_days`, approved provisional coin packs (0.990 / 2.490 / 4.990) | The four old plans and the three first-draft packs are **disabled, not deleted**. A member on an old plan keeps it until its period ends; it cannot be renewed. |
| `20261122_exercise_library_seed.sql` | Content: 9 muscles, 61 exercises | Idempotent upsert of content rows only. |
| `20261123_library_verification.sql` | `exercise_library.source_checked` (was this row compared with an opened reference page) | New column, default false. |
| `20261124_included_usage.sql` | Subscribers' trainer use is included up to configurable daily caps (`plans.ai_daily_requests` 40, `ai_daily_media` 10, provisional); `monthly_credits` of monthly / yearly set to null so **no coins are granted automatically**; Gemini route model updated | No ledger row is written or removed. The old `vip` plan (which never had a coin allocation) also becomes included-usage. |

## Behaviour that changes for members when these go live
- The promotional 2,500 credits every member holds stay in the ledger untouched, but **alone they no longer open the trainer**:
  access is trial → purchased VORA Coins → subscription. Promotional credits are spent first once a member buys coins.
  (Production today: 33 wallets, 82,500 promotional credits in total, nothing purchased.)
- The old AI Coach screen of the web app (`ai-coach` function) is not changed by these files; the Expo app uses `ai-trainer`.

## Edge Functions to deploy together with the migrations
`ai-trainer` (new), `device-auth` (updated: no longer signs out other sessions), `initiate-purchase` (new), `purchase-status` (new),
`payment-webhook` and `payment-reconcile` (updated: also handle purchase orders; booking behaviour unchanged).

## Secrets
| Secret | Needed for | Note |
|---|---|---|
| `UPAYMENTS_API_KEY` | every payment call | Sandbox verified: the key alone authenticates API requests. |
| `UPAYMENTS_HMAC_SECRET` | verifying incoming webhooks; signing requests | Must be the HMAC secret of the **same merchant account as the API key**. A request signed with a different secret is rejected (HTTP 401 "Invalid signature"). If it is unset, requests are sent unsigned (accepted by the sandbox), webhooks are rejected (fail closed) and orders are confirmed through the server-side status check instead. |
| `APP_URL`, `PURCHASE_RETURN_ORIGINS` | allowed checkout return pages | The web origin(s) that may receive the customer after payment. |
| `ANTHROPIC_API_KEY`, optional `GEMINI_API_KEY`, `AI_MODE=live` | real AI answers | See `docs/VORA-AI-LIVE.md` for the order and the database budget switches. |

## Rollback
The new objects can be left in place with the app pointing at the old functions. `supabase/rollback/` holds the rollback for the
earlier M3B step; no destructive rollback is provided for these files because they add objects only.
