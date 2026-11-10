// GENUINE AI test against the deployed Edge Functions and real OpenRouter free models. No stubs.
// Exit codes: 0 = passed, 1 = failed, 3 = BLOCKED by the AI provider's free quota (not a pass, not an app bug).
// Usage: node --env-file=.env tests/ai-real.test.mjs <creds.json>
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const [A] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const { error: le } = await c.auth.signInWithPassword(A); assert.ifError(le)
let n = 0; const ok = (m) => console.log(`PASS ${++n}. ${m}`)
async function call(fn, body) {
  const t = Date.now(); const r = await c.functions.invoke(fn, { body })
  if (!r.error) return { status: 200, data: r.data, secs: ((Date.now() - t) / 1000).toFixed(1) }
  const j = await r.error.context.json().catch(() => ({})); return { status: r.error.context.status, data: j, secs: ((Date.now() - t) / 1000).toFixed(1) }
}
async function blockedCheck(res) {
  if (res.status === 503 && res.data?.source === 'provider-quota') {
    console.log(`\nBLOCKED (exit 3): ${res.data.error}\nThis is the AI provider's quota, not an app failure; nothing was verified by this run.`); await c.from('workouts').delete().eq('exercise', 'AI test bench press'); process.exit(3)
  }
}
await c.from('workouts').insert({ exercise: 'AI test bench press', sets: 3, reps: 8, weight: 60 }) // so the 7-day analysis has data
const s = await call('ai-summary', { exercise: 'Back squat', sets: 4, reps: 6, weight: 100 }); await blockedCheck(s)
assert.equal(s.status, 200, JSON.stringify(s.data)); assert.ok(typeof s.data.summary === 'string' && s.data.summary.length >= 10)
assert.ok(!/^MOCK/i.test(s.data.summary)); assert.ok(s.data.model && !/mock/i.test(s.data.model))
ok(`ai-summary genuine response in ${s.secs}s from model "${s.data.model}": "${s.data.summary}"`)
await new Promise((r) => setTimeout(r, 1500))
const a = await call('ai-analysis', {}); await blockedCheck(a)
assert.equal(a.status, 200, JSON.stringify(a.data)); assert.ok(a.data.analysis.length >= 30 && a.data.workouts_analyzed >= 1); assert.ok(!/^MOCK/i.test(a.data.analysis))
ok(`ai-analysis genuine response in ${a.secs}s from model "${a.data.model}" (${a.data.workouts_analyzed} workouts analyzed): "${a.data.analysis.replace(/\s+/g, ' ').slice(0, 200)}"`)
await c.from('workouts').delete().eq('exercise', 'AI test bench press')
console.log(`\nALL ${n} GENUINE AI CHECKS PASSED`)
