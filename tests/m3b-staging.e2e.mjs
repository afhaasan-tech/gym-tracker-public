// M3B enforcement on STAGING: the database itself refuses untrusted sessions for balance/ledger/reservations/AI jobs.
// The trusted state is created by the operator via SQL (the device flow itself is covered by device-m3-staging.e2e.mjs).
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { cred } from './_creds.mjs'
const URL_ = process.env.STAGING_URL, KEY = process.env.STAGING_KEY, HS = process.env.HS_DIR || '/tmp'
assert.ok(URL_ && KEY && !URL_.includes('zbqdmebrxqshcsozamwg'), 'staging only')
const results = []
const step = async (id, name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', id, name) } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 260)) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function signIn(c) { const x = createClient(URL_, KEY, { auth: { persistSession: false } }); const { data, error } = await x.auth.signInWithPassword(c); assert.ifError(error); return { c: x, token: data.session.access_token, id: data.user.id, sid: JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url')).session_id } }
const coach = async (t) => { const r = await fetch(`${URL_}/functions/v1/ai-coach`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + t }, body: JSON.stringify({ operation: 'quick_question', message: 'سؤال تجريبي', persona: 'sarah', language: 'ar', tone: 'friendly', idempotency_key: 'k-' + randomUUID(), confirm_credits: 50 }) }); return r.status }
async function handshake(label, payload) { for (const f of [`need-${label}`, `code-${label}`]) if (existsSync(`${HS}/${f}`)) rmSync(`${HS}/${f}`); writeFileSync(`${HS}/need-${label}`, payload); console.log('   NEED', label, payload); const t0 = Date.now(); while (!existsSync(`${HS}/code-${label}`)) { if (Date.now() - t0 > 240000) throw new Error('operator timeout'); await sleep(1000) } await sleep(300) }
const A = await signIn(cred(0)), B = await signIn(cred(1)), A2 = await signIn(cred(0))
await step('E01', 'UNTRUSTED sessions: balance RPC refused; ledger, reservations, trial grant and AI jobs return nothing (database-level enforcement)', async () => {
  for (const u of [A, B]) {
    const b = await u.c.rpc('my_credit_balance'); assert.ok(b.error, 'balance must be refused'); assert.equal(b.error.code, '42501')
    for (const t of ['credit_ledger', 'credit_reservations', 'trial_grants', 'ai_jobs']) { const r = await u.c.from(t).select('*'); assert.ok(r.error || (r.data ?? []).length === 0, t + ' must be empty/refused') }
  }
})
await step('E02', 'untrusted: ai-coach still refuses (403)', async () => { assert.equal(await coach(A.token), 403) })
await handshake('sess-A', A.sid)   // operator marks A.sid as the active, device-verified session
await step('E03', 'TRUSTED session: balance, ledger, reservations and AI jobs are visible (own rows only)', async () => {
  const b = await A.c.rpc('my_credit_balance'); assert.ifError(b.error); assert.equal(typeof b.data.total, 'number'); console.log('   balance', JSON.stringify(b.data))
  const l = await A.c.from('credit_ledger').select('user_id'); assert.ok(l.data.length >= 1); assert.ok(l.data.every((r) => r.user_id === A.id), 'only own rows')
  assert.equal((await coach(A.token)), 200)
  const j = await A.c.from('ai_jobs').select('id,response_text'); assert.ok(j.data.length >= 1, 'own AI jobs visible')
})
await step('E04', 'CROSS-USER: B (untrusted, valid JWT) still sees nothing of A even though A is trusted', async () => { assert.ok((await B.c.rpc('my_credit_balance')).error); assert.equal(((await B.c.from('credit_ledger').select('*')).data ?? []).length, 0) })
await step('E05', 'SUPERSEDED session: a second sign-in of the same user (valid JWT, same device password) is NOT trusted', async () => {
  assert.ok((await A2.c.rpc('my_credit_balance')).error); assert.equal(((await A2.c.from('credit_ledger').select('*')).data ?? []).length, 0); assert.equal(await coach(A2.token), 403)
  assert.ifError((await A.c.rpc('my_credit_balance')).error)
})
await handshake('revoke-A', A.sid)   // operator revokes the device/session in SQL (active_session_id := null)
await step('E06', 'REVOKED trust: the same valid JWT loses access immediately', async () => { assert.ok((await A.c.rpc('my_credit_balance')).error); assert.equal(((await A.c.from('credit_ledger').select('*')).data ?? []).length, 0); assert.equal(await coach(A.token), 403) })
const n = (s) => results.filter((r) => r === s).length
console.log(`\nSTAGING M3B: ${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
