# VORA — Email-OTP and AI provider research (fetched 2026-11-12 from official pages)

**Nothing was activated.** No accounts, keys or SMTP settings were created or changed. Prices in USD as published; KWD figures use an assumed 1 KWD ≈ 3.25 USD (assumption).

## 1. Transactional email (OTP, new-device codes, password reset)
Supabase constraint (official doc): the default mailer delivers only to team addresses at **2 messages/hour** with no SLA; custom SMTP is required for OTP flows; a new custom SMTP starts at a **30 messages/hour** limit (adjustable); keep auth mail on its own sending domain/from-address. Supabase lists Resend, AWS SES, Postmark, SendGrid, ZeptoMail, Brevo as compatible.

| Provider | Published pricing | Notes |
|---|---|---|
| **Resend** | Free 3,000/mo (100/day); Pro $20/mo = 50,000, no daily cap; overage $0.90/1k; SMTP on all plans | Simple, SMTP works with Supabase; data-region/EU hosting **not stated** on the page |
| Postmark | Free 100/mo; Basic $15/mo = 10,000; overage $1.80/1k | Strong transactional reputation; SMTP per-plan and data location **not clear** from the page |
| Amazon SES | $0.10 per 1,000; $200 new-account credits | Cheapest; more setup (domain/DKIM, production-access request, EU region choice) |

**Recommendation:** start with **Resend** (free tier for staging/dev; Pro $20 at launch — OTP volume of a few thousand/month is far below 50k), authenticated sending subdomain (SPF/DKIM/DMARC), separate from any marketing mail; keep SES as the low-cost fallback if volume grows. **Blockers:** you need a domain you control for DKIM (the project is on `*.vercel.app` today) and an account; I will not create either. Confirm data-residency requirements (EU region) with the provider before launch — not verifiable from the pricing pages.

## 2. AI models (current published prices per 1M tokens)
| Tier | Candidate | Price (in / out) | Notes |
|---|---|---|---|
| Fast Q&A | Claude Haiku 5.5 | $0.10–$0.50 / $0.50–$2.50 (two table rows; verify which applies) | very cheap |
| Fast Q&A (alt) | Gemini 3.5 Flash-Lite | $0.30 / $2.50 | multimodal incl. audio |
| Planning / reasoning | Claude Sonnet 5.5 | $2 / $10 | good fit for workout/meal plans, vision |
| Planning (alt) | Gemini 3.8 Flash | $0.75 / $3.75 until 31 Dec 2026, then $1.50 / $7.50 | price rises on 1 Jan 2027 |
| High-end (rare) | Claude Opus 5.5 / Fable 5.2 | $4/$20 · $8/$40 | not needed for MVP |
| Speech-to-text | Gemini 3.5 Transcribe | $2.00/1M audio tok or ~$0.003/min | or browser Web Speech API (free, but browser vendor may process audio) |
| Text-to-speech | Gemini 3.8 Flash-Lite TTS | $0.50 in / $6 out (to 31 Dec 2026) | or browser `speechSynthesis` (free, lower quality) |
| OpenAI | — | **not verified**: `openai.com/api/pricing` returned HTTP 403 | |

Privacy terms (from the pages fetched): Gemini **free-tier data may be used to improve products; paid tier: No** → only the paid tier is acceptable for health-related content. Anthropic's pricing page does not state training/retention terms: **verify the commercial terms / DPA before sending sensitive data (unverified)**. Arabic/Kuwaiti quality: **no trustworthy public benchmark was found**; I recommend a 60-prompt Kuwaiti-Arabic evaluation set scored by native speakers before fixing the routing.

**Recommended routing (to validate):** Haiku 5.5 for quick questions → Sonnet 5.5 for full plans/modifications/meal-image analysis (vision) → browser STT/TTS first (zero cost, optional), Gemini transcribe/TTS later; provider chosen per route in `ai_routes`, with a second provider as automatic fallback. **No keys are created; an existing `OPENROUTER_API_KEY` secret (free models) still serves the old summary functions.**

## 3. Unit economics (assumptions, not measurements)
Token assumptions per call: quick Q 1.5k in/0.5k out; meal image 1.5k in/0.6k out (+image); modification 3k/1.5k; full plan 3k in/4k out. Using Haiku for quick Q and Sonnet 5.5 for the rest:
| Operation | Credits | Est. provider cost | Value at Essential rate (7.000 KWD = 10,000 credits ⇒ 0.0007 KWD/credit) |
|---|---:|---|---|
| Quick question | 50 | ≈ $0.002 | 0.035 KWD (≈ $0.11) |
| Meal image | 300 | ≈ $0.01 | 0.21 KWD (≈ $0.68) |
| Partial modification | 500 | ≈ $0.02 | 0.35 KWD (≈ $1.14) |
| Full workout/food plan | 1,500 | ≈ $0.05 | 1.05 KWD (≈ $3.41) |
Conclusion: **model tokens are a tiny share of revenue at these credit sizes**; payment fees, support, email and infrastructure dominate, and the drafted prices leave very large headroom (the real risks are abuse/automation and long-context chats). **Do not treat profitability as validated** until real token logs exist.

## 4. Recommended VIP / fair-use limits (configurable defaults, for Owner approval)
Per VIP user: ≤ 300 quick questions/day, ≤ 10 full plans/day, ≤ 30 image analyses/day, ≤ 60 requests/hour, monthly provider-spend ceiling **$15** per user (alert at 70%, soft-stop at 100%), global provider budget alarm, conversation context cap (e.g. last 20 messages), and no truly unlimited marketing claim. Same mechanism (`ai_limits`) applies to Elite/Pro with lower numbers. All thresholds live in the database and are Owner-editable; these are starting recommendations only.
