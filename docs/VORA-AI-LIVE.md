# VORA AI Personal Trainer: going live

Status on 2026-11-17: the trainer runs in **mock** mode. No live provider call has been made, no API key exists in the project, and no
spend is approved. This page lists what the owner must set to connect a real model, what each provider can do as implemented, and what
it will cost. Every figure marked **(A)** is an assumption that must be confirmed; figures marked **(V)** were verified against the
provider's own documentation on 2026-11-17.

Code: `supabase/functions/ai-trainer/` (Edge Function). Database: `supabase/migrations/20261115_ai_backend.sql` (budget gate, routes),
`20261117_m3a_foundation.sql` (owner functions), `20261124_included_usage.sql` (included usage per plan).

---

## 1. What the owner must set, in order

### 1.1 Edge Function secrets (names only; values are entered in Supabase, never in the repository or the app)

| # | Secret | Required | Effect |
|---|---|---|---|
| 1 | `ANTHROPIC_API_KEY` | yes | Text (Claude Haiku 5.5) and images (Claude Sonnet 5.5). |
| 2 | `GEMINI_API_KEY` | optional | Voice messages and video (Gemini 3.5 Flash-Lite). Without it, audio and video are **not analysed** and the reply says so. |
| 3 | `AI_MODE` = `live` | yes | Anything else (or unset) = mock. Set this **last**. |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase. Keys are read only inside the Edge
Function; they are never sent to the app, never logged, and never stored in the database.

Set them in the Supabase dashboard (Edge Functions → Secrets) or with `supabase secrets set NAME=...`, then redeploy `ai-trainer`.

### 1.2 Database switches (run as the owner: super admin, MFA session, TOTP verified in the last 10 minutes)

Each call is audited (`audit_log`) and refused without a recent step-up (error `PO001`).

```sql
-- 1. Check the configuration first (routes, operation prices, budget, plans, flags).
select public.owner_get_commerce_config();

-- 2. Confirm the routes (already the defaults after 20261124; shown for completeness).
--    owner_set_route(operation, provider, model, max_output_tokens, fallback_provider, fallback_model)
select public.owner_set_route('trainer_message', 'anthropic', 'claude-haiku-5-5',      3000, null, null);
select public.owner_set_route('trainer_image',   'anthropic', 'claude-sonnet-5-5',     3000, null, null);
select public.owner_set_route('trainer_audio',   'gemini',    'gemini-3.5-flash-lite', 3000, null, null);
select public.owner_set_route('trainer_video',   'gemini',    'gemini-3.5-flash-lite', 3000, null, null);

-- 3. Included usage per plan (provisional defaults 40 requests / 10 media per day; see section 4 for the recommendation).
--    owner_set_plan_usage(plan, daily_requests, daily_media)
select public.owner_set_plan_usage('monthly', 40, 5);
select public.owner_set_plan_usage('yearly',  40, 5);

-- 4. THE BUDGET GATE: master switch + hard monthly cap + per-call cap, in micro-USD (1 USD = 1,000,000).
--    owner_set_ai_budget(live, monthly_cap_micro, per_call_cap_micro). Hard ceiling in code: 1,000 USD per month.
--    Example: live, 25 USD per month, at most 0.06 USD per single call.
select public.owner_set_ai_budget(true, 25000000, 60000);

-- 5. Show the trainer in the apps (the flag the web app reads).
select public.owner_set_flag('ai_coach_enabled', true);
-- 6. Record the decision (high-risk flag, step-up required). The Edge Function itself is gated by AI_MODE + the budget gate above.
select public.owner_set_flag('live_ai_enabled', true);
```

Then set the secret `AI_MODE=live` (1.1, row 3). A live call happens only when **all** of these are true: `AI_MODE=live`, the provider's
key exists, the model has a row in the price table (`providers.ts`), and `ai_budget_authorize()` accepts the estimated cost
(`live_calls_enabled`, monthly cap not exceeded, estimate at most the per-call cap). In live mode the function fails **closed**: if any
of them is missing the member gets `503 provider_unavailable` and nothing is charged or counted. It never falls back to a mock answer.

Per-call cap: the pre-call estimate is deliberately pessimistic (full output cap, system prompt priced as a cache write). Measured
estimates: text 0.001 to 0.002 USD, image 0.044 USD, 5 MB voice file 0.034 USD, 12 MB video 0.054 USD. The default per-call cap of
50,000 micro-USD therefore **blocks a maximum-size video**; 60,000 lets every allowed request through.

### 1.3 Switching back to mock (either one is enough; do both to be sure)

```sql
select public.owner_set_ai_budget(false, 0, 50000);     -- gate off: no live call can be authorised
```

and set the secret `AI_MODE=mock` (or delete it) and redeploy. With the gate off and `AI_MODE=live` still set, requests get 503 (fail
closed), so change the secret too if the trainer should keep answering with mock replies.

### 1.4 First live check (needs the owner's approval: it spends real money, a few cents)

1. One text message as a subscriber, one as a trial account. Expect `mock: false`; `ai_jobs` shows provider, model, tokens, cost.
2. `select spent_usd_micro from ai_budget` moves by the logged cost.
3. One image. Then, with `GEMINI_API_KEY`, one 10-second voice message and one short video.
4. Send the same text twice within five minutes and compare `cost_usd_micro` (prompt cache: the second should be cheaper).

---

## 2. Capability matrix (as implemented)

| Input | Anthropic (`ANTHROPIC_API_KEY`) | Gemini (`GEMINI_API_KEY`) | Mock |
|---|---|---|---|
| Text | yes, Claude Haiku 5.5 | yes (only if routed there) | yes, labelled `[MOCK]` |
| Image (JPEG, PNG, WebP, up to 4 MB) | yes, Claude Sonnet 5.5 | yes | received, never inspected, says so |
| Voice message (up to 5 MB) | **no** | yes, Gemini 3.5 Flash-Lite | received, never inspected, says so |
| Video (MP4, MOV, WebM, up to 12 MB) | **no** | yes, Gemini 3.5 Flash-Lite | received, never inspected, says so |
| Spoken reply (text to speech) | not implemented (the answer carries a `voice_script` text for the app to speak) | not implemented | same |

Honesty rules enforced in code and covered by tests:

- **Only an Anthropic key**: a voice message or a video is not sent anywhere. The reply states that the file could not be analysed
  (`media.analyzed: []`, `media.note` set), nothing is charged and no daily unit is kept. If the member also typed a message, the text
  is answered by the text route and the model is told that it received no file. There is no transcription step, real or simulated.
- A provider is never handed a media kind it cannot take (checked in the core and again in the adapter).
- The model is instructed to describe only what is actually visible or audible, and the server sets `media.analyzed`, not the model.

Request shape actually sent (verified against the Claude API reference, 2026-11-03 snapshot **(V)**):

- Anthropic: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type`.
  Body: `model`, `max_tokens`, `system` (two text blocks: a cacheable prefix with `cache_control: {type: "ephemeral"}`, then the
  per-request exercise list), `output_config: {effort: "low"}`, one `user` message (optional base64 `image` block, then text). No
  `temperature` / `top_p` / `top_k`, no thinking budget, no prefill, no forced tool: each of those is rejected by these models.
  `stop_reason: "refusal"` and `"max_tokens"` are treated as failed calls (not charged). Text is read from `text` blocks by type,
  because the answer can be preceded by thinking blocks.
- Gemini: `POST .../v1beta/models/gemini-3.5-flash-lite:generateContent`, key in the `x-goog-api-key` header. Body:
  `systemInstruction`, one user turn (`inlineData` + text), `generationConfig` with `responseMimeType: application/json`,
  `responseJsonSchema`, `maxOutputTokens`, `thinkingConfig: {thinkingLevel: "minimal"}`. A blocked prompt or any `finishReason` other
  than `STOP` is a failed call.

---

## 3. Cost model

### 3.1 Prices used (USD per 1 million tokens)

| Model | Input | Output | Notes |
|---|---|---|---|
| `claude-haiku-5-5` | 0.10 **(V)** | 0.50 **(V)** | Prompts above 100K tokens: 0.50 / 2.50 (never reached here). Cache read 0.01, 5-minute cache write 0.125. |
| `claude-sonnet-5-5` | 2.00 **(V)** | 10.00 **(V)** | Cache read 0.10, 5-minute cache write 2.50. |
| `gemini-3.5-flash-lite` | 0.30 **(V)** | 2.50 **(V)** | One input price for text, image, audio and video. Output price includes thinking tokens. |

Sources: Anthropic model table in the Claude API reference (cached 2026-11-03); Google "Gemini Developer API pricing" page, paid tier,
standard (read 2026-11-17). Exchange rate: **1 USD = 0.307 KWD (A)**.

### 3.2 Tokens and cost per request type

Token counts are estimates **(A)**: measured prompt length in characters divided by 3.2 (the newer Claude tokenizer; Arabic history at
about 2 characters per token). "Typical" assumes a few turns of history and an answer well below the cap. "Ceiling" is the most one
call can cost: full history, the output cap used up, system prompt written to the cache.

| Request | Model | Input tokens (typical) | Output tokens (typical) | Typical USD | Typical KWD | Ceiling USD |
|---|---|---|---|---|---|---|
| Trial short answer | Haiku 5.5 | 2,700 (system 2,415 + message and history) | 250 (cap 1,024) | 0.00040 | 0.00012 | 0.0009 |
| Coins short answer | Haiku 5.5 | 2,700 | 250 (cap 1,024) | 0.00040 | 0.00012 | 0.0009 |
| Subscriber exercise answer, 12 library candidates in the prompt | Haiku 5.5 | 3,860 (system 2,990 + list 570 + 300) | 500 (cap 3,000) | 0.00064 | 0.00020 | 0.0020 |
| Weekly plan, 24 candidates | Haiku 5.5 | 4,400 (list 1,110) | 1,700 (cap 3,000) | 0.0013 | 0.00040 | 0.0021 |
| Image | Sonnet 5.5 | 5,880 (incl. about 2,000 for the image **(A)**) | 500 | 0.017 | 0.0052 | 0.051 |
| Voice message, 30 s | Gemini 3.5 Flash-Lite | 4,630 (audio 32 tokens/s **(V)** = 960) | 400 | 0.0024 | 0.00074 | 0.034 (5 MB file) |
| Video, 15 s | Gemini 3.5 Flash-Lite | 8,170 (about 300 tokens/s **(A)** = 4,500) | 500 | 0.0037 | 0.0011 | 0.054 (12 MB file) |

Output token counts include a small amount of model thinking **(A)**: Claude at effort `low`, Gemini at `minimal`. This is the least
certain number in the table and the first thing to measure in the live check (1.4).

Prompt cache effect on text (Haiku): a cache hit lowers a trial answer from 0.00040 to 0.00018 USD and a subscriber answer from
0.00064 to 0.00037; a miss costs 0.00046 / 0.00071 (the write premium). It pays off once more than about one request in five reuses a
prefix within five minutes. At very low traffic it costs slightly more than no caching (hundredths of a cent per request).

**Cost per text message: about 0.0004 USD (trial / coins) to 0.0006 USD (subscriber), i.e. 0.00012 to 0.0002 KWD.**

### 3.3 Cost per subscriber per month at the proposed caps

A month = 30 days. Caps as migrated: 40 requests per day, of which at most 10 with media.

| Scenario | Requests per month | Assumed mix (A) | USD / month | KWD / month |
|---|---|---|---|---|
| Realistic: 5 requests a day | 150 | 112 exercise or question answers, 28 plans, 8 images, 1 voice, 1 video | 0.25 | 0.08 |
| Text only at the cap | 1,200 | every request a weekly plan | 1.56 | 0.48 |
| Worst case at the caps, typical call cost | 1,200 | 900 plans + 300 images (10 a day, every day) | 6.20 | 1.90 |
| Absolute ceiling at the caps | 1,200 | every call uses its full output cap, 300 maximum-size images or videos | 17.20 | 5.28 |

Images on Sonnet 5.5 are the cost driver: one image costs as much as about 26 text answers. With a media cap of 5 a day the worst
case at typical call cost falls to 3.90 USD (1.20 KWD) and the absolute ceiling to about 9.90 USD (3.00 KWD).

### 3.4 Margin

Payment fee: **UPayments fee = 3 % of the amount (A, to be confirmed with the UPayments contract; a fixed fee per KNET transaction
would change the small coin pack most, see below).**

| Plan | Price | Fee (A) | Net per month | AI cost realistic | Margin realistic | AI cost worst case (typical call cost) | Margin worst case | Margin at the absolute ceiling |
|---|---|---|---|---|---|---|---|---|
| Monthly (provisional) | 7.000 KWD | 0.210 | 6.790 | 0.08 | 6.71 KWD (96 %) | 1.90 | 4.89 KWD (70 %) | 1.51 KWD (22 %) |
| Yearly (provisional) | 70.000 KWD = 5.833 per month | 0.175 per month | 5.658 | 0.08 | 5.58 KWD (96 %) | 1.90 | 3.76 KWD (64 %) | 0.38 KWD (6 %) |

Margin percentages are of the price. Not included: Supabase hosting, app store commission if the plans are ever sold in-app, support,
tax. The global budget gate caps total provider spend regardless of these estimates.

VORA Coins (pay as you go; operation prices as migrated: message 50, voice 100, image 300, video 500 coins):

| Pack | Coins | Price KWD | Coins per KWD | Revenue per 50-coin message | AI cost of that message | Fee at 3 % (A) | Fee if 0.150 KWD flat (A) |
|---|---|---|---|---|---|---|---|
| Starter | 500 | 0.990 | 505 | 0.099 KWD | 0.00012 KWD | 0.030 | 0.150 (15 % of the pack) |
| Plus | 1,500 | 2.490 | 602 | 0.083 KWD | 0.00012 KWD | 0.075 | 0.150 (6 %) |
| Value | 3,500 | 4.990 | 701 | 0.071 KWD | 0.00012 KWD | 0.150 | 0.150 (3 %) |

A 50-coin text message sells for 0.07 to 0.10 KWD and costs about 0.00012 KWD in provider fees: the provider cost is under 0.2 % of
the revenue. An image (300 coins = 0.43 to 0.59 KWD) costs about 0.005 KWD; a video (500 coins = 0.71 to 0.99 KWD) about 0.001 KWD.
Coin prices are set by positioning, not by provider cost.

For reference, the allocation that was **not** granted: 10,000 coins = 200 text messages = about 0.08 to 0.13 USD of provider cost
(0.57 USD if all spent on images). The provider cost of such a grant would be small; what it would cost is coin-pack revenue, since a
subscriber holding 10,000 coins has no reason to buy a pack. That is a commercial decision for the owner, not a cost constraint.

### 3.5 The free trial

One trial conversation of at most 10 short answers = about 0.004 USD (0.0012 KWD) per new account. 1,000 sign-ups = about 4 USD.

---

## 4. Recommendation

1. **Requests: keep 40 per day.** Even a subscriber who asks for 40 plans every day costs about 0.5 KWD a month in text.
2. **Media: lower the cap from 10 to 5 per day** until real usage is measured, or keep 10 and move images off Sonnet 5.5. Routing
   `trainer_image` to Gemini 3.5 Flash-Lite (already supported by the adapter; needs `GEMINI_API_KEY`) cuts an image from about
   0.017 to about 0.003 USD **(A)**; answer quality on form photos must be compared first. Claude Haiku 5.5 for images is a second
   option **(A: image input on Haiku 5.5 was not checked in this pass)**.
3. **Coin allocation: none for now** (as decided). If the owner later wants one, `owner_upsert_plan(...)` with a non-null
   `monthly_credits` switches that plan back to coin billing; nothing is distributed until then.
4. **Global budget: start at 25 USD per month** with a per-call cap of 0.06 USD. That covers about 100 realistic subscribers, or a
   handful of heavy ones, and stops everything if the estimates here are wrong. Raise it from the measured numbers
   (`select public.owner_ai_usage_summary(30)`).
5. **Before real customers: run the live check in 1.4** and replace the **(A)** token figures in 3.2 with measured ones.

---

## 5. Not verified (no live call was allowed)

- No request has been sent to Anthropic or Google. The request shapes were checked against documentation only.
- Output and thinking token counts per answer are estimates. A short answer that still hits the 1,024-token cap is returned as
  503 and not charged; if that happens in the live check, raise `SHORT_MAX_OUTPUT_TOKENS` or route short answers with a lower effort.
- JSON output on Claude relies on the prompt plus server-side validation (invalid JSON = failed call, not charged). The API also
  offers schema-constrained output (`output_config.format`); it was not switched on because the schema cannot be test-compiled without
  a live call.
- Gemini: `responseJsonSchema` and `thinkingConfig.thinkingLevel: "minimal"` are documented for `generateContent`, but Google's guides
  now lead with a newer Interactions API; the exact enum spelling accepted over REST, and the `x-goog-api-key` header, were not
  confirmed on the current reference page. `gemini-2.5-flash` (the previous route) is deprecated and is rerouted by Google to
  `gemini-3.5-flash-lite` from 2026-12-01, which is why the route and price table were moved now.
- Video token rate (100 versus 300 tokens per second depending on media resolution), image token count, the USD/KWD rate and the
  UPayments fee are assumptions.
- A safety refusal by Claude Sonnet 5.5 can be retried server-side on another model (`fallbacks`, a beta feature). It is not enabled:
  a refused request simply fails and is not charged. Claude Haiku 5.5 has no such fallback.
- The older `ai-coach` function keeps its own, higher price row for Claude Haiku 5.5 (it over-estimates; it was not in scope).
