// UNIT test of the model-fallback logic in supabase/functions/*/shared.ts using a SIMULATED provider (fetch is faked).
// This is NOT a test of genuine model output - see tests/ai-real.test.mjs for that.
// Run: node --experimental-transform-types tests/fn-fallback.test.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const src = readFileSync('supabase/functions/ai-summary/shared.ts', 'utf8')
  .replace("import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'",
    "const createClient: any = () => { throw new Error('not used') }; type SupabaseClient = any; type User = any")
const dir = mkdtempSync(join(tmpdir(), 'fn-')); const file = join(dir, 'shared.ts'); writeFileSync(file, src)
let env = { OPENROUTER_API_KEY: 'test-key-not-real' }
globalThis.Deno = { env: { get: (k) => env[k] } }
let calls = [], script = {}, catalogue = null
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/models')) {
    if (!catalogue) throw new Error('catalogue down')
    return new Response(JSON.stringify({ data: catalogue }), { status: 200 })
  }
  const model = JSON.parse(init.body).model; calls.push(model)
  const r = script[model] ?? { status: 200, body: { model, choices: [{ message: { content: 'ok from ' + model }, finish_reason: 'stop' }] } }
  return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers ?? {} })
}
let seq = 0
const fresh = () => import(pathToFileURL(file).href + '?t=' + (++seq)) // new module instance = empty model cache
let m = await fresh()
const mk = (id, extra = {}) => ({ id, context_length: 262144, architecture: { output_modalities: ['text'] }, ...extra })
let n = 0; const ok = (s) => console.log(`PASS ${++n}. ${s}`)
const reset = () => { calls = []; script = {} }
const e429 = (msg, hdr = {}) => ({ status: 429, body: { error: { message: msg, metadata: { headers: hdr } } } })

// 1 model-specific 429 -> falls back to next model and succeeds
catalogue = [mk('google/gemma-4-31b-it:free'), mk('google/gemma-4-26b-a4b-it:free')]; reset()
script['google/gemma-4-31b-it:free'] = e429('google/gemma-4-31b-it:free is temporarily rate-limited upstream')
let r = await m.askModel('s', 'u'); assert.equal(r.model, 'google/gemma-4-26b-a4b-it:free'); assert.deepEqual(calls, ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free']); ok('single busy model -> falls back to the next free model')

// 2 account daily limit -> stops immediately (all free models share it), 503 with exact reset time
reset(); script['google/gemma-4-31b-it:free'] = e429('Rate limit exceeded: free-models-per-day. Add 10 credits...', { 'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.UTC(2026, 10, 9)) })
await assert.rejects(m.askModel('s', 'u'), (e) => { assert.equal(e.status, 503); assert.equal(e.extra.source, 'provider-quota'); assert.match(e.message, /2026-11-09 00:00 UTC/); assert.ok(e.extra.retry_after_seconds > 0); return true })
assert.equal(calls.length, 1); ok('daily account quota -> ONE call only, clear 503 with exact reset time (no pointless retries)')

// 3 per-minute account limit -> also stops
reset(); script['google/gemma-4-31b-it:free'] = e429('Rate limit exceeded: free-models-per-min', { 'X-RateLimit-Reset': String(Date.now() + 20000) })
await assert.rejects(m.askModel('s', 'u'), (e) => e.status === 503 && /per-minute/.test(e.message)); assert.equal(calls.length, 1); ok('per-minute account limit -> stops, reports per-minute')

// 4 empty answer (reasoning ate the budget) -> next model
reset(); script['google/gemma-4-31b-it:free'] = { status: 200, body: { choices: [{ message: { content: '' }, finish_reason: 'length' }] } }
r = await m.askModel('s', 'u'); assert.equal(r.model, 'google/gemma-4-26b-a4b-it:free'); ok('empty answer -> next model')

// 5 provider 5xx and timeouts -> next model
reset(); script['google/gemma-4-31b-it:free'] = { status: 503, body: { error: { message: 'down' } } }
r = await m.askModel('s', 'u'); assert.equal(r.model, 'google/gemma-4-26b-a4b-it:free'); ok('provider 5xx -> next model')

// 6 every model busy (not account quota) -> 502 busy
reset(); for (const id of ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free']) script[id] = e429(id + ' is temporarily rate-limited upstream')
await assert.rejects(m.askModel('s', 'u'), (e) => e.status === 502 && e.extra.source === 'provider-busy'); ok('all models busy -> 502 "busy", distinct from account quota')

// 7 only FREE text models are ever used: paid / vision / code ids from the live catalogue are ignored
reset(); catalogue = [mk('openai/gpt-5'), mk('nvidia/nemotron-3.5-super-vl:free'), mk('cohere/north-mini-code:free'), mk('some/tiny:free', { context_length: 8000 }), mk('google/gemma-4-31b-it:free')]
m = await fresh(); r = await m.askModel('s', 'u'); assert.deepEqual(calls, ['google/gemma-4-31b-it:free']); ok('paid, vision, code and tiny-context models are never called')

// 8 a paid id forced through OPENROUTER_MODELS is still refused
reset(); env.OPENROUTER_MODELS = 'openai/gpt-5,google/gemma-4-31b-it:free'; r = await m.askModel('s', 'u'); assert.deepEqual(calls, ['google/gemma-4-31b-it:free']); delete env.OPENROUTER_MODELS; ok('a paid model configured by mistake is filtered out (never called)')

// 9 catalogue unreachable -> built-in preferred list still works
reset(); catalogue = null; m = await fresh(); r = await m.askModel('s', 'u'); assert.equal(r.model, 'google/gemma-4-31b-it:free'); ok('catalogue outage -> built-in free-model list is used')

// 10 missing key
env.OPENROUTER_API_KEY = undefined; await assert.rejects(m.askModel('s', 'u'), (e) => e.status === 503 && /missing OPENROUTER_API_KEY/.test(e.message)); ok('missing key -> clear 503, no calls'); env.OPENROUTER_API_KEY = 'x'

// 11 no canned text anywhere in the server code
for (const f of ['supabase/functions/ai-summary/index.ts', 'supabase/functions/ai-analysis/index.ts', 'supabase/functions/ai-summary/shared.ts']) assert.ok(!/mock|stub|canned|fake/i.test(readFileSync(f, 'utf8').replace(/never returns canned\/mock AI text/, '')), f)
ok('Edge Function source contains no mock/stub/canned responses')
console.log(`\nALL ${n} CHECKS PASSED (simulated provider)`)
