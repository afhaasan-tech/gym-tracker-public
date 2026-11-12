# VORA — Live AI benchmark: secure API-key setup (instructions only — nothing here has been done)

Goal: run the Coach benchmark (`benchmarks/coach/`) against Anthropic **without** exposing a key to anyone/anything but the runner, and with a hard spend ceiling. **Do not start until you approve the budget.** Console menu names may differ slightly; the intent matters.

## 1. Cap the money on Anthropic's side first
1. In the Claude Console, create a **new workspace** (e.g. `vora-staging-bench`).
2. Set the workspace **spend limit to the approved test budget** (recommended: **$5**).
3. Confirm **auto-reload / automatic top-up is OFF** (Billing). Do not add a card.
4. Keep the rest of your free credit unassigned to this workspace.

## 2. Create a dedicated key
1. In that workspace create an API key named `vora-staging-bench`. Copy it once.
2. **Never** paste it into chat, a commit, a ticket or a screenshot. Never reuse it for production.
3. Note the date; plan to **delete the key** when the benchmark is finished (Console → API keys → delete).

## 3. Choose ONE way to use it
**A. On your own computer (simplest, key never leaves it)**
```
export ANTHROPIC_API_KEY=…            # your shell only
# 1) edit benchmarks/coach/approved-budget.json  ->  {"total_usd": 5}   (your decision, not mine)
deno run --allow-read --allow-write --allow-env --allow-net=api.anthropic.com benchmarks/coach/run.ts --live --budget-usd 2 --models claude-haiku-5-5,claude-sonnet-5-5
```
The runner refuses unless: `--live`, the env key, `--budget-usd > 0` **and** an approved total are all present; it stops before any call whose worst-case cost would exceed either cap.

**B. Through `vora-staging` (exercises the real path: credits, budget gate, privacy)** — staging only, never production:
1. Supabase dashboard → project **vora-staging** → Edge Functions → Secrets: add `ANTHROPIC_API_KEY` (your key) and `AI_MODE=live`. *I cannot and will not write secrets.*
2. As the owner (MFA fresh within 10 minutes) call the owner functions: `owner_set_ai_budget(true, 5000000, 50000)` (= live on, $5 monthly cap, $0.05 per call) then `owner_set_flag('live_ai_enabled', true)`. The flag is refused unless the budget gate is on.
3. Run the benchmark prompts through a test member account; watch `owner_ai_usage_summary()` for cost.
4. **Kill switch**: `owner_set_ai_budget(false, 0, 0)` (database) and/or delete the `AI_MODE` secret (function). Either alone stops all billable calls.

## 4. After the run
Delete the API key, set `approved-budget.json` back to `0`, review `benchmarks/coach/results/*.csv` with native-speaker raters, and decide model routing from the scores — not before.

## What can still go wrong (and the guard)
| Risk | Guard |
|---|---|
| Key leaked in logs/chat | never in code; secrets only in your shell or the Supabase secret store; runner prints no key |
| Runaway spend | Console workspace limit + runner caps + DB monthly/per-call cap + rate limits (12/min, 300/day per user) |
| Accidental production use | function checks `AI_MODE`; production has no live secrets; the DB gate defaults to closed |
| Wrong price assumptions | prices in `providers.ts` are the conservative published rows — re-verify on the pricing page before the run |
