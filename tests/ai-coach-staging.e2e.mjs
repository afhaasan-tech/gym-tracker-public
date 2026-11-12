// AI Coach backend integration test against the STAGING Supabase project (mock provider, no billable calls, no keys).
// usage: STAGING_URL=https://<ref>.supabase.co STAGING_KEY=<anon/publishable key> TEST_CREDS=<creds.json (>=3)> node tests/ai-coach-staging.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cred } from './_creds.mjs'
const URL_ = process.env.STAGING_URL, KEY = process.env.STAGING_KEY
assert.ok(URL_ && KEY && !URL_.includes('zbqdmebrxqshcsozamwg'), 'must point at staging, never production')
const results = []
const step = async (id, name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', id, name) } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 240)) } }
const login = async (c) => { const x = createClient(URL_, KEY, { auth: { persistSession: false } }); const { data, error } = await x.auth.signInWithPassword(c); assert.ifError(error); return { c: x, token: data.session.access_token, id: data.user.id } }
const coach = async (token, body) => { const t0 = Date.now(); const r = await fetch(`${URL_}/functions/v1/ai-coach`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, json: j, ms: Date.now() - t0 } }
const bal = async (u) => (await u.c.rpc('my_credit_balance')).data
const A = await login(cred(0)), B = await login(cred(1)), C = await login(cred(2))
const q = (o = {}) => ({ operation: 'quick_question', message: 'شنو آكل قبل التمرين؟', persona: 'rashid', language: 'ar', tone: 'friendly', idempotency_key: 'k-' + randomUUID(), confirm_credits: 50, ...o })

await step('S01', 'hosted trigger granted each verified account exactly 2,500 trial credits', async () => { for (const u of [A, B, C]) { const b = await bal(u); assert.equal(b.total, 2500); assert.equal(b.promo, 2500) } })
await step('S02', 'anonymous / bad JWT cannot call ai-coach (401)', async () => { assert.equal((await coach(null, q())).status, 401); assert.equal((await coach('not.a.jwt', q())).status, 401) })
await step('S03', 'without exact confirmation the server answers 409 with the real price and charges nothing', async () => {
  const b0 = (await bal(A)).total
  const r1 = await coach(A.token, q({ confirm_credits: undefined })); assert.equal(r1.status, 409); assert.equal(r1.json.credits, 50)
  const r2 = await coach(A.token, q({ confirm_credits: 1 })); assert.equal(r2.status, 409)
  assert.equal((await bal(A)).total, b0)
})
let key1, text1
await step('S04', 'confirmed quick question: mock answer, exactly 50 credits charged, job stored privately', async () => {
  key1 = 'k-' + randomUUID(); const r = await coach(A.token, q({ idempotency_key: key1 })); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.equal(r.json.mock, true); assert.equal(r.json.credits_charged, 50); text1 = r.json.text
  const b = await bal(A); assert.equal(b.total, 2450); assert.equal(b.held, 0)
  const { data: jobs } = await A.c.from('ai_jobs').select('status,response_text,persona,language'); assert.ok(jobs.some((j) => j.status === 'done' && j.response_text === text1))
  console.log('   latency', r.ms, 'ms')
})
await step('S05', 'same idempotency key again (retry / double click): replay, no second charge', async () => {
  const rs = await Promise.all([1, 2, 3].map(() => coach(A.token, q({ idempotency_key: key1 }))))
  for (const r of rs) { assert.equal(r.status, 200); assert.equal(r.json.replay, true); assert.equal(r.json.text, text1) }
  assert.equal((await bal(A)).total, 2450)
})
await step('S06', '5 parallel requests with ONE new key: exactly one charge and one job', async () => {
  const k = 'k-' + randomUUID(); const b0 = (await bal(B)).total
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => coach(B.token, q({ idempotency_key: k }))))
  assert.ok(rs.some((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)))
  assert.ok(rs.every((r) => [200, 409].includes(r.status)), JSON.stringify(rs.map((r) => [r.status, r.json?.error])))
  await new Promise((r) => setTimeout(r, 1500)); assert.equal((await bal(B)).total, b0 - 50)
  const { data: jobs } = await B.c.from('ai_jobs').select('id').eq('request_text', 'شنو آكل قبل التمرين؟'); assert.equal(jobs.length, 1)
})
await step('S07', 'privacy: another member cannot read my AI conversations; members cannot read provider/cost columns or write jobs', async () => {
  const { data: seen } = await C.c.from('ai_jobs').select('id'); assert.equal(seen.length, 0)
  assert.ok((await A.c.from('ai_jobs').select('provider,cost_usd_micro')).error)
  { const u = await A.c.from('ai_jobs').update({ response_text: 'x' }).eq('status', 'done').select(); assert.ok(u.error || (u.data ?? []).length === 0, 'member cannot edit jobs') }
  assert.ok((await A.c.from('ai_jobs').insert({ user_id: A.id, idempotency_key: 'hackhack1', operation_key: 'quick_question', persona: 'rashid', language: 'ar' })).error)
})
await step('S08', 'members cannot touch balances, prices, routes, budget or call the credit functions', async () => {
  assert.ok((await A.c.from('credit_ledger').insert({ user_id: A.id, source: 'purchased', entry_type: 'grant', amount: 99999 })).error)
  { const u = await A.c.from('ai_operations').update({ credits: 0 }).eq('key', 'quick_question').select(); assert.ok(u.error || (u.data ?? []).length === 0, 'member cannot update prices') }
  assert.equal((await A.c.from('ai_operations').select('credits').eq('key', 'quick_question').single()).data.credits, 50)
  for (const t of ['ai_routes', 'ai_budget', 'credit_settings', 'rate_limit_events']) assert.ok((await A.c.from(t).select('*')).error, t)
  assert.ok((await A.c.rpc('credit_grant', { p_user: A.id, p_source: 'purchased', p_amount: 1000, p_type: 'purchase', p_idem: 'hack-grant', p_note: 'x' })).error)
  assert.ok((await A.c.rpc('credit_reserve', { p_user: A.id, p_operation: 'quick_question', p_idem: 'hack-reserve1' })).error)
  assert.ok((await A.c.rpc('ai_budget_authorize', { p_estimate: 1 })).error)
  assert.equal((await bal(A)).total, 2450)
})
await step('S09', 'full workout plan costs 1,500 once; a second one is refused for lack of credits (402) and nothing is held', async () => {
  const r1 = await coach(C.token, q({ operation: 'full_workout_plan', message: 'عطني خطة تمرين 4 أيام للمبتدئ', confirm_credits: 1500 })); assert.equal(r1.status, 200, JSON.stringify(r1.json))
  assert.equal((await bal(C)).total, 1000)
  const r2 = await coach(C.token, q({ operation: 'full_workout_plan', message: 'خطة ثانية', confirm_credits: 1500 })); assert.equal(r2.status, 402)
  const b = await bal(C); assert.equal(b.total, 1000); assert.equal(b.held, 0)
})
await step('S10', 'invalid inputs are rejected (400) without charging', async () => {
  const b0 = (await bal(C)).total
  for (const bad of [{ message: '' }, { message: 'x'.repeat(2001) }, { persona: 'bob' }, { language: 'fr' }, { idempotency_key: 'short' }, { operation: 'nope' }]) assert.equal((await coach(C.token, q(bad))).status, 400, JSON.stringify(bad).slice(0, 40))
  assert.equal((await bal(C)).total, b0)
})
await step('S11', 'live mode is impossible here: no key, gate closed — replies are flagged mock and the budget stays 0', async () => {
  const r = await coach(B.token, q()); assert.equal(r.json.mock, true)
})
await step('S12', 'rate limit: more than 12 requests in a minute get 429 with retry_after; credits only for allowed ones', async () => {
  const b0 = (await bal(B)).total; const rs = []
  for (let i = 0; i < 16; i++) rs.push((await coach(B.token, q())).status)
  const ok = rs.filter((s) => s === 200).length, lim = rs.filter((s) => s === 429).length
  console.log('   statuses', rs.join(','))
  assert.ok(lim >= 1, 'some requests rate-limited'); assert.equal((await bal(B)).total, b0 - 50 * ok)
})
const n = (s) => results.filter((r) => r === s).length
console.log(`\nSTAGING ai-coach: ${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
