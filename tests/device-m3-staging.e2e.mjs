// Trusted-device / single-session / consent e2e against STAGING (mock mailer). The 6-digit codes are read from the staging-only
// dev_mock_outbox by the operator and handed over through files: need-<label> (written here) -> code-<label> (written by the operator).
// usage: STAGING_URL=… STAGING_KEY=<anon> TEST_CREDS=<3 users> HS_DIR=/tmp/claude-0/s node tests/device-m3-staging.e2e.mjs
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { cred } from './_creds.mjs'
const URL_ = process.env.STAGING_URL, KEY = process.env.STAGING_KEY, HS = process.env.HS_DIR || '/tmp'
assert.ok(URL_ && KEY && !URL_.includes('zbqdmebrxqshcsozamwg'), 'staging only')
const results = []
const step = async (id, name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', id, name) } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 260)) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const secret = () => randomBytes(32).toString('base64url')
async function signIn(c) { const x = createClient(URL_, KEY, { auth: { persistSession: false } }); const { data, error } = await x.auth.signInWithPassword(c); assert.ifError(error); return { c: x, token: data.session.access_token, id: data.user.id, sid: JSON.parse(Buffer.from(data.session.access_token.split('.')[1], 'base64url')).session_id } }
const call = async (name, token, body) => { const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, json: j } }
const dev = (t, b) => call('device-auth', t, b), coach = (t, extra = {}) => call('ai-coach', t, { operation: 'quick_question', message: 'شنو آكل قبل التمرين؟', persona: 'rashid', language: 'ar', tone: 'friendly', idempotency_key: 'k-' + randomUUID(), confirm_credits: 50, ...extra })
async function need(label, ms = 300000) { for (const f of [`need-${label}`, `code-${label}`]) if (existsSync(`${HS}/${f}`)) rmSync(`${HS}/${f}`); writeFileSync(`${HS}/need-${label}`, new Date().toISOString()); console.log('   NEED_CODE', label); const t0 = Date.now(); while (!existsSync(`${HS}/code-${label}`)) { if (Date.now() - t0 > ms) throw new Error('operator did not provide ' + label); await sleep(1000) } await sleep(300); return readFileSync(`${HS}/code-${label}`, 'utf8').trim() }

const credsA = cred(0), credsB = cred(1), credsC = cred(2)
const dA1 = secret(), dA2 = secret(), dA3 = secret(), dB1 = secret(), dC1 = secret()
let a1, a2, a3, b1

await step('D01', 'password login alone (valid JWT, verified e-mail) is NOT trusted: ai-coach 403, consent/export/preferences blocked', async () => {
  a1 = await signIn(credsA)
  const r = await coach(a1.token); assert.equal(r.status, 403); assert.equal(r.json.error, 'device_not_trusted')
  assert.equal((await a1.c.rpc('is_trusted_session')).data, false)
  assert.ok((await a1.c.rpc('consent_set', { p_purpose: 'analytics', p_granted: true })).error, 'consent_set')
  assert.ok((await a1.c.rpc('my_data_export')).error, 'export')
  assert.equal(((await a1.c.from('member_preferences').select('*')).data ?? []).length, 0)
  assert.ok((await a1.c.from('member_preferences').insert({ user_id: a1.id })).error, 'preferences insert')
  const bad = await call('ai-coach', a1.token, { operation: 'quick_question', message: 'x', idempotency_key: 'k-12345678', confirm_credits: 1 }); assert.equal(bad.status, 403, 'no price oracle for untrusted sessions')
})
await step('D02', 'unauthenticated / garbage JWT cannot use device-auth or ai-coach', async () => { for (const t of [null, 'x.y.z']) { assert.equal((await dev(t, { action: 'status', device_secret: dA1 })).status, 401); assert.equal((await coach(t)).status, 401) } })
await step('D03', 'unknown device => challenge_required; send_code answers 200 WITHOUT the code', async () => {
  assert.equal((await dev(a1.token, { action: 'status', device_secret: dA1 })).json.state, 'challenge_required')
  const r = await dev(a1.token, { action: 'send_code', device_secret: dA1, language: 'en' }); assert.equal(r.status, 200, JSON.stringify(r)); assert.ok(!/\d{6}/.test(JSON.stringify(r.json)), 'code must not be in the response')
})
const codeA1 = await need('A1')
await step('D04', 'wrong code => generic 401 (and the session stays untrusted)', async () => {
  const r = await dev(a1.token, { action: 'verify_code', device_secret: dA1, code: codeA1 === '000000' ? '111111' : '000000' }); assert.equal(r.status, 401); assert.equal(r.json.error, 'invalid_or_expired_code')
  assert.equal((await coach(a1.token)).status, 403)
})
await step('D05', 'correct code => device trusted, THIS session becomes the active one; ai-coach now works', async () => {
  const r = await dev(a1.token, { action: 'verify_code', device_secret: dA1, code: codeA1, label: 'Staging browser A' }); assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(r.json.state, 'trusted')
  assert.equal((await a1.c.rpc('is_trusted_session')).data, true)
  const c = await coach(a1.token); assert.equal(c.status, 200, JSON.stringify(c.json)); assert.equal(c.json.mock, true)
  const replay = await dev(a1.token, { action: 'verify_code', device_secret: dA1, code: codeA1 }); assert.equal(replay.status, 401, 'a used code cannot be replayed')
})
await step('D06', 'consent + preferences work only inside the trusted session', async () => {
  assert.ifError((await a1.c.rpc('consent_set', { p_purpose: 'health_data_storage', p_granted: true })).error)
  assert.ifError((await a1.c.from('member_health_profile').insert({ user_id: a1.id, allergies: ['peanut'], conditions: 'asthma' })).error)
  assert.ifError((await a1.c.from('member_preferences').insert({ user_id: a1.id, coach_persona: 'sarah', coach_name: 'سارة', coach_tone: 'playful', coach_language: 'ar' })).error)
  assert.equal(((await a1.c.from('member_health_profile').select('*')).data ?? []).length, 1)
  assert.equal((await a1.c.rpc('my_data_export')).data.preferences.coach_persona, 'sarah')
})
await step('D07', 'SINGLE ACTIVE SESSION: logging in again on the trusted device activates the new session and kills the old one', async () => {
  a2 = await signIn(credsA); const s = await dev(a2.token, { action: 'status', device_secret: dA1 }); assert.equal(s.json.state, 'trusted')
  assert.equal((await coach(a2.token)).status, 200, 'new session works')
  const old = await coach(a1.token); assert.notEqual(old.status, 200, 'old session must not work: ' + old.status); assert.ok([401, 403].includes(old.status))
  assert.equal((await a1.c.rpc('is_trusted_session')).data === true, false)
})
await step('D08', 'a NEW device with a valid password session stays untrusted; the trusted session is unaffected', async () => {
  a3 = await signIn(credsA); const s = await dev(a3.token, { action: 'status', device_secret: dA2 }); assert.equal(s.json.state, 'challenge_required')
  assert.equal((await coach(a3.token)).status, 403); assert.equal((await coach(a2.token)).status, 200, 'trusted session still fine (a password session never steals trust)')
})
await step('D08b', 'A requests a code for another device (dA3) from the trusted session', async () => { assert.equal((await dev(a2.token, { action: 'send_code', device_secret: dA3 })).status, 200) })
const codeA3 = await need('A3')
await step('D09', 'CROSS-USER: B cannot use A device secret or A pending code; B stays untrusted', async () => {
  b1 = await signIn(credsB)
  assert.equal((await dev(b1.token, { action: 'status', device_secret: dA1 })).json.state, 'challenge_required', "A's trusted device is not trusted for B")
  const v = await dev(b1.token, { action: 'verify_code', device_secret: dA3, code: codeA3 }); assert.equal(v.status, 401, "B must not verify with A's code")
  assert.equal((await coach(b1.token)).status, 403)
  assert.equal((await b1.c.from('ai_jobs').select('id')).data?.length ?? 0, 0, 'B sees no AI jobs'); assert.equal((await b1.c.from('trusted_devices').select('id')).data?.length ?? 0, 0, 'B sees no devices')
})
await step('D10', 'consent withdrawal erases A health profile (own data only) and keeps the history', async () => {
  assert.ifError((await a2.c.rpc('consent_set', { p_purpose: 'health_data_storage', p_granted: false })).error)
  assert.equal(((await a2.c.from('member_health_profile').select('*')).data ?? []).length, 0)
  assert.equal(((await a2.c.from('consents').select('*')).data ?? []).length, 2)
  assert.equal(((await a2.c.from('member_preferences').select('*')).data ?? []).length, 1, 'preferences untouched')
  writeFileSync(`${HS}/consent-withdrawn-A`, 'ok'); console.log('   MARK consent-withdrawn-A (operator verifies B/C health rows still exist)')
})
await step('D11', 'devices: list + revoke from the trusted session; revoked device must re-verify and the session loses trust', async () => {
  const l = await dev(a2.token, { action: 'list_devices' }); assert.equal(l.status, 200); assert.ok(l.json.devices.length >= 1); const id = l.json.devices[0].id
  assert.equal((await dev(b1.token, { action: 'revoke_device', device_id: id })).status, 403, "untrusted B cannot revoke")
  assert.equal((await dev(a2.token, { action: 'revoke_device', device_id: id })).json.revoked, true)
  assert.equal((await coach(a2.token)).status, 403, 'session lost trust immediately')
  const a4 = await signIn(credsA); assert.equal((await dev(a4.token, { action: 'status', device_secret: dA1 })).json.state, 'challenge_required')
})
await step('D11b', 'B requests a code', async () => { assert.equal((await dev(b1.token, { action: 'send_code', device_secret: dB1, language: 'ar' })).status, 200) })
const codeB1 = await need('B1')
await step('D12', 'brute force: 5 wrong guesses burn the code; even the correct code then fails', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await dev(b1.token, { action: 'verify_code', device_secret: dB1, code: '00000' + i })).status, 401)
  assert.equal((await dev(b1.token, { action: 'verify_code', device_secret: dB1, code: codeB1 })).status, 401, 'the CORRECT code no longer works once burned')
  assert.equal((await coach(b1.token)).status, 403)
})
await step('D13', 'e-mail code rate limit: more than 3 per 10 minutes => 429', async () => {
  const rs = []; for (let i = 0; i < 4; i++) rs.push((await dev(b1.token, { action: 'send_code', device_secret: dB1 })).status); console.log('   statuses', rs.join(','))
  assert.ok(rs.includes(429))
})
const c1 = await signIn(credsC)
await step('D14', 'C requests a code', async () => { assert.equal((await dev(c1.token, { action: 'send_code', device_secret: dC1 })).status, 200) })
const codeC = await need('C')    // operator reads the code AND expires the challenge in SQL before handing it over
await step('D15', 'an EXPIRED code is refused (generic 401)', async () => { const r = await dev(c1.token, { action: 'verify_code', device_secret: dC1, code: codeC }); assert.equal(r.status, 401); assert.equal(r.json.error, 'invalid_or_expired_code'); assert.equal((await coach(c1.token)).status, 403) })
await step('D16', 'pepper & secrets are not readable through the API (anon, member JWT, rpc)', async () => {
  for (const t of [null, a1.token]) {
    const r = await fetch(`${URL_}/rest/v1/internal_secrets?select=*`, { headers: { apikey: KEY, ...(t ? { Authorization: 'Bearer ' + t } : {}) } }); assert.ok(r.status >= 400, 'internal_secrets must be refused: ' + r.status)
    const t2 = await fetch(`${URL_}/rest/v1/device_challenges?select=*`, { headers: { apikey: KEY, ...(t ? { Authorization: 'Bearer ' + t } : {}) } }); assert.ok(t2.status >= 400 || (await t2.json()).length === 0, 'challenges')
    const h = await fetch(`${URL_}/rest/v1/rpc/device_code_hash`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify({ p_challenge: randomUUID(), p_code: '123456' }) }); assert.ok(h.status >= 400, 'device_code_hash must not be callable: ' + h.status)
  }
})
const n = (s) => results.filter((r) => r === s).length
console.log(`\nSTAGING device/M3: ${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
