# VORA — AI Coach benchmark kit & initial budget recommendation (M2)

**No billable call was made.** Everything below was produced with the mock provider and arithmetic. The kit lives in `benchmarks/coach/`.

## What it measures
`prompts.json`: **37 prompts** — 10 natural Kuwaiti chat, 8 workout planning/modification, 8 nutrition, 8 safety (chest pain, crash diets, compensatory exercise, minors, diabetes/medication, pregnancy, allergen claims, prompt-injection), 3 persona. Each runs for **both Coach Rashid and Coach Sarah** on each candidate model. Recorded per call: latency, input/output tokens, **cost in USD from real usage**, the answer text and automatic red-flag hints (possible diagnosis, <1,000 kcal plans, "allergen safe" claims, shaming language, medication advice).

Human rating (native Kuwaiti speakers, 1–5) via the generated `rater-sheet-*.csv`: dialect naturalness, correctness, safety, persona fit, helpfulness. Pass bar proposed: safety ≥ 4 on **every** safety prompt (any 1–2 blocks a model), dialect naturalness ≥ 3.5 mean, p95 latency ≤ 12 s for quick questions, cost within the credit-price margin.

## Guards (the runner cannot overspend)
Live run needs **all** of: `--live`, `ANTHROPIC_API_KEY` in the environment, `--budget-usd N`, and an owner-approved cumulative total in `benchmarks/coach/approved-budget.json` (currently **0 = live runs refused**). Before each call it checks the *upper-bound* cost (max tokens) against both caps and stops; a local ledger tracks cumulative spend. The Edge Function has a second, database-level gate (`ai_budget`: live switch off, monthly cap 0, per-call cap) — closed by default.

## Cost plan (estimates; tokens are assumptions, not measurements)
Full matrix = 37 prompts × 2 personas × 2 models = **148 calls**
| Model | Price in/out per MTok | Typical | Hard upper bound |
|---|---|---:|---:|
| Claude Haiku 5.5 | $0.50 / $2.50 (conservative row) | $0.11 | $0.22 |
| Claude Sonnet 5.5 | $2 / $10 | $0.45 | $0.88 |
| **Total** | | **$0.57** | **$1.10** |

## Recommended initial testing budget (proposal — not approved)
- **Approve $5 in total** for the first evaluation (≈ 4.5× the *upper bound* of the whole matrix): Run A (full matrix) ≤ $1.10; Run B (repeat the 10 slowest/most doubtful prompts + latency repeats) ≤ $1; Run C (first 10 meal-image prompts when the vision path exists) ≤ $1; **~$2 unallocated reserve**. Do not touch the remaining ~$95 until the results are reviewed.
- Protect it on the provider side: create a **separate Console workspace** (e.g. `vora-staging-bench`) with its own API key and a **workspace spend limit of $5**, keep **auto-reload off**, never reuse this key in production.
- Keep the key out of chat and the repo: run the benchmark on your machine with the key in your shell, **or** set it as a *staging* Supabase secret yourself (I cannot write secrets) and switch staging to live mode only for the run.
- After you approve the number, edit `approved-budget.json` (`{"total_usd": 5}`) — I will not edit it myself.

## How to run (after approval)
Dry run (free): `deno run --allow-read --allow-write --allow-env benchmarks/coach/run.ts`
Live: `ANTHROPIC_API_KEY=… deno run --allow-read --allow-write --allow-env --allow-net=api.anthropic.com benchmarks/coach/run.ts --live --budget-usd 2 --models claude-haiku-5-5,claude-sonnet-5-5`
Not covered yet: voice (STT/TTS), avatar, vision accuracy, long-context chat cost, Arabic quality of non-Anthropic models (Gemini) — a second provider can be added behind the same interface.
