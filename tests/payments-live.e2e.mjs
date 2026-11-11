// Day 10 live payment tests: real Supabase Edge Functions + real UPayments SANDBOX + real browser. No mocks.
// usage: TEST_CREDS=<creds.json (>=3 pre-verified accounts)> HMAC_SECRET=<documented sandbox HMAC secret, test only>
//        node tests/payments-live.e2e.mjs <siteBaseUrl> <phase> [bookingId]
// phases: security | flow | decline | abandon1 | abandon2 <bookingId>
// Tests that need the gateway report BLOCKED (not PASS) if the gateway secrets are not configured.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'
import assert from 'node:assert/strict'
import { cred } from './_creds.mjs'

const base = (process.argv[2] || 'https://gym-tracker-afhaasan.vercel.app/').replace(/\/?$/, '/')
const phase = process.argv[3] || 'security'
const SUPA = 'https://zbqdmebrxqshcsozamwg.supabase.co', KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ'
const FN = SUPA + '/functions/v1', HMAC = process.env.HMAC_SECRET || ''
const results = []
const step = async (id, name, fn) => { try { const r = await fn(); if (r === 'BLOCKED') { results.push('BLOCKED'); console.log('BLOCKED', id, name) } else { results.push('PASS'); console.log('PASS', id, name) } } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 220)) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const client = () => createClient(SUPA, KEY, { auth: { persistSession: false } })
const signed = async (c) => { const x = client(); const { data, error } = await x.auth.signInWithPassword(c); assert.ifError(error); return { c: x, token: data.session.access_token, id: data.user.id } }
const invoke = async (name, token, body, extra = {}) => { const r = await fetch(`${FN}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, json: j } }
const webhook = async (payload, { secret = HMAC, ts = Math.floor(Date.now() / 1000), sign = true, url = `${FN}/payment-webhook` } = {}) => {
  const raw = JSON.stringify(payload); const h = { 'Content-Type': 'application/json' }
  if (sign) { h['X-Timestamp'] = String(ts); h['X-Signature'] = createHmac('sha256', secret).update(String(ts) + 'POST' + url + raw).digest('base64') }
  const r = await fetch(`${FN}/payment-webhook`, { method: 'POST', headers: h, body: raw }); let j = null; try { j = await r.json() } catch { /* */ } return { status: r.status, json: j }
}
async function newBooking(user, offsetDays) {   // a real booking through the member's own REST access (price decided by the DB trigger)
  const { data: svcs } = await user.c.from('services').select('id,price_kwd,name').gt('price_kwd', 0).eq('platform_owned', true).order('price_kwd').limit(5)
  for (const s of svcs ?? []) {
    const { data: slots } = await user.c.rpc('public_slots', { p_service: s.id })
    const row = { service_id: s.id, participants: 1 }
    if (slots?.length) row.slot_id = slots[Math.min(offsetDays, slots.length - 1)].id; else row.scheduled_at = new Date(Date.now() + (offsetDays + 2) * 864e5).toISOString()
    const { data, error } = await user.c.from('bookings').insert(row).select('id,price_kwd,payment_status').single()
    if (!error) return { ...data, service: s.name }
  }
  throw new Error('could not create a test booking')
}
const status = async (user, id) => (await user.c.from('bookings').select('payment_status').eq('id', id).single()).data?.payment_status
const attempts = async (user, id) => (await user.c.from('payment_attempts').select('id,status,amount_kwd,currency,failure_reason,verified_at').eq('booking_id', id).order('created_at')).data ?? []
const gatewayReady = async (user, id) => { const r = await invoke('initiate-payment', user.token, { booking_id: id }); return r }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
async function payKnet(url, expiry = '09/30') {   // drives the REAL sandbox hosted checkout + KNET test page (documented test card)
  const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage()
  await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  const body = await p.locator('body').innerText()
  await p.getByText('KNET', { exact: true }).first().click(); await p.waitForURL(/kpaytest/, { timeout: 30000 }); await p.waitForSelector('#debitNumber', { timeout: 20000 })
  await p.fill('#debitNumber', '8888880000000001'); await p.fill('#expiryDateInput', expiry); await p.fill('#cardPin', '1234'); await p.click('#proceed')
  await p.waitForURL((u) => !/kpaytest|sandbox\.upayments/.test(u.href), { timeout: 60000 })
  const finalUrl = p.url(); await p.context().close(); return { body, finalUrl }
}
const waitFor = async (fn, ms = 40000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout waiting for condition'); await sleep(1500) } }

const A = await signed(cred(0)), B = await signed(cred(1)), C = await signed(cred(2))

if (phase === 'security') {
  const bk = await newBooking(A, 1)
  await step('T07', 'anonymous caller cannot start a payment (no JWT / anon key as bearer)', async () => {
    const r1 = await invoke('initiate-payment', null, { booking_id: bk.id }); assert.ok([401, 403].includes(r1.status), 'no jwt: ' + r1.status)
    const r2 = await invoke('initiate-payment', KEY, { booking_id: bk.id }); assert.ok([401, 403].includes(r2.status), 'anon bearer: ' + r2.status)
    assert.equal(await status(A, bk.id), 'pending')
  })
  await step('T06', "another member cannot initiate payment on someone else's booking", async () => {
    const r = await invoke('initiate-payment', B.token, { booking_id: bk.id }); assert.equal(r.status, 404, JSON.stringify(r)); assert.equal((await attempts(A, bk.id)).length, 0)
  })
  await step('T08', 'member cannot change payment_status / price directly, call payment functions, or write attempts', async () => {
    for (const patch of [{ payment_status: 'paid' }, { payment_status: 'awaiting_payment' }, { price_kwd: 0.001 }]) { const { error } = await A.c.from('bookings').update(patch).eq('id', bk.id); assert.ok(error, 'update ' + JSON.stringify(patch)) }
    assert.equal(await status(A, bk.id), 'pending')
    assert.ok((await A.c.rpc('payment_apply', { p_attempt: bk.id, p_result: 'CAPTURED', p_amount: 1, p_currency: 'KWD', p_track: 't', p_response: {}, p_source: 'x' })).error)
    assert.ok((await A.c.rpc('payment_start', { p_booking: bk.id, p_user: A.id })).error)
    assert.ok((await A.c.from('payment_attempts').insert({ booking_id: bk.id, user_id: A.id, idempotency_key: 'x', amount_kwd: 1, expires_at: new Date(Date.now() + 36e5).toISOString() })).error)
    assert.ok((await A.c.from('payment_attempts').select('checkout_url')).error, 'checkout_url is not readable')
    const ins = await A.c.from('bookings').insert({ service_id: (await A.c.from('bookings').select('service_id').eq('id', bk.id).single()).data.service_id, scheduled_at: new Date(Date.now() + 5 * 864e5).toISOString(), payment_status: 'paid' }); assert.ok(ins.error, 'insert already-paid')
  })
  await step('T08b', 'anonymous client cannot read or change payment tables / bookings', async () => {
    const an = client()
    assert.ok((await an.from('payment_attempts').select('id')).error || ((await an.from('payment_attempts').select('id')).data ?? []).length === 0)
    assert.ok((await an.from('payment_events').select('id')).error || ((await an.from('payment_events').select('id')).data ?? []).length === 0)
    const u = await an.from('bookings').update({ payment_status: 'paid' }).eq('id', bk.id).select(); assert.ok(u.error || (u.data ?? []).length === 0)
    assert.ok((await an.rpc('payment_apply', { p_attempt: bk.id, p_result: 'CAPTURED', p_amount: 1, p_currency: 'KWD', p_track: 't', p_response: {}, p_source: 'x' })).error)
  })
  await step('T10', 'unsigned / badly signed / stale webhook requests cannot mark paid (401)', async () => {
    const payload = { result: 'CAPTURED', track_id: 'forged', requested_order_id: 'x' }
    assert.equal((await webhook(payload, { sign: false })).status, 401)
    assert.equal((await webhook(payload, { secret: 'not-the-secret' })).status, 401)
    if (HMAC) assert.equal((await webhook(payload, { ts: Math.floor(Date.now() / 1000) - 3600 })).status, 401, 'stale replay')
    assert.equal(await status(A, bk.id), 'pending')
  })
  await step('T10b', 'a correctly SIGNED but forged CAPTURED webhook still cannot mark paid (provider lookup refuses it)', async () => {
    if (!HMAC) return 'BLOCKED'
    const r0 = await gatewayReady(A, bk.id); if (r0.status === 502) return 'BLOCKED'
    const att = (await attempts(A, bk.id))[0]; assert.ok(att, 'attempt exists')
    const r = await webhook({ result: 'CAPTURED', track_id: 'forged-track-id', requested_order_id: att.id.replace(/-/g, ''), order_id: 'x' })
    assert.ok(r.status >= 400, 'forged signed webhook must not succeed: ' + JSON.stringify(r))
    assert.notEqual(await status(A, bk.id), 'paid')
  })
}

if (phase === 'flow') {
  const bk = await newBooking(A, 2), bk2 = await newBooking(A, 3)
  let checkout = null, probe = await gatewayReady(A, bk.id)
  if (probe.status === 502) { console.log('gateway is not configured/reachable (HTTP 502) -> gateway tests BLOCKED'); results.push('BLOCKED'); console.log('BLOCKED T01-T05,T09,T11-T14 gateway not configured'); await browser.close(); process.exit(0) }
  await step('T03', 'initiate-payment returns a genuine hosted checkout URL that loads and shows the server amount in KWD', async () => {
    assert.equal(probe.status, 200, JSON.stringify(probe)); checkout = probe.json.checkout_url
    const u = new URL(checkout); assert.equal(u.protocol, 'https:'); assert.match(u.hostname, /upayments\.com$/)
    assert.equal(Number(probe.json.amount_kwd), Number(bk.price_kwd))
    const p = await (await browser.newContext()).newPage(); const resp = await p.goto(checkout, { waitUntil: 'networkidle', timeout: 45000 }); assert.equal(resp.status(), 200)
    const txt = await p.locator('body').innerText(); assert.ok(txt.includes(Number(bk.price_kwd).toFixed(3)), 'hosted page shows ' + bk.price_kwd); await p.context().close()
    assert.equal(await status(A, bk.id), 'awaiting_payment')
  })
  await step('T02', 'injecting amount/currency/status in the request body does not change the charge', async () => {
    const r = await invoke('initiate-payment', A.token, { booking_id: bk2.id, amount: 0.001, currency: 'USD', payment_status: 'paid', price_kwd: 0.001 })
    assert.equal(r.status, 200, JSON.stringify(r)); assert.equal(Number(r.json.amount_kwd), Number(bk2.price_kwd)); assert.equal(r.json.currency, 'KWD')
    const at = await attempts(A, bk2.id); assert.equal(at.length, 1); assert.equal(Number(at[0].amount_kwd), Number(bk2.price_kwd))
    const p = await (await browser.newContext()).newPage(); await p.goto(r.json.checkout_url, { waitUntil: 'networkidle', timeout: 45000 })
    const txt = await p.locator('body').innerText(); assert.ok(txt.includes(Number(bk2.price_kwd).toFixed(3)) && !txt.includes('0.001'), 'gateway page shows the real price'); await p.context().close()
    assert.notEqual(await status(A, bk2.id), 'paid')
  })
  await step('T01', 'the Pay Now button sends ONLY the booking id (browser request inspected) and redirects to the sandbox checkout', async () => {
    const { data: s } = await A.c.auth.getSession()
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); let posted = null
    await p.addInitScript(([k, v]) => { localStorage.setItem(k, v) }, ['sb-zbqdmebrxqshcsozamwg-auth-token', JSON.stringify(s.session)])
    p.on('request', (r) => { if (r.url().includes('/functions/v1/initiate-payment') && r.method() === 'POST') posted = r.postData() })
    const bk3 = await newBooking(A, 4)
    await p.goto(base + '#/bookings'); await p.locator('li', { hasText: bk3.service }).first().waitFor({ timeout: 20000 })
    const btn = p.getByRole('button', { name: /ادفع الآن|Pay now/ }).first(); await btn.waitFor({ timeout: 20000 }); await btn.click()
    await p.waitForURL(/upayments\.com/, { timeout: 40000 })
    assert.deepEqual(Object.keys(JSON.parse(posted)), ['booking_id']); await ctx.close()
  })
  await step('T09', 'double click / 5 concurrent requests create ONE checkout and ONE attempt', async () => {
    const bk4 = await newBooking(A, 5)
    const rs = await Promise.all([1, 2, 3, 4, 5].map(() => invoke('initiate-payment', A.token, { booking_id: bk4.id })))
    assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)))
    assert.equal(new Set(rs.map((r) => r.json.checkout_url)).size, 1, 'same checkout URL for all clicks')
    assert.equal((await attempts(A, bk4.id)).length, 1, 'exactly one attempt')
  })
  await step('T04+T05', 'returning to the app (even with a forged ?status=success&result=CAPTURED) shows "Verifying" and does NOT mark paid', async () => {
    const { data: s } = await A.c.auth.getSession(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage()
    await p.addInitScript(([k, v]) => { localStorage.setItem(k, v) }, ['sb-zbqdmebrxqshcsozamwg-auth-token', JSON.stringify(s.session)])
    await p.goto(base + `#/pay/return/${bk.id}?status=success&result=CAPTURED&payment_id=1&track_id=forged`)
    await p.getByText(/نتحقق من الدفع|Verifying payment/).waitFor({ timeout: 20000 })
    assert.equal(await p.getByText(/تم الدفع بنجاح|Payment successful/).count(), 0)
    await sleep(8000); assert.equal(await status(A, bk.id), 'awaiting_payment'); assert.equal(await p.getByText(/تم الدفع بنجاح|Payment successful/).count(), 0); await ctx.close()
  })
  await step('T11+T14', 'real sandbox KNET payment: only the verified server confirmation marks it paid; Realtime delivers the change', async () => {
    const events = []; const ch = A.c.channel('t-' + Date.now()).on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `id=eq.${bk.id}` }, (e) => events.push(e.new?.payment_status)).subscribe()
    await sleep(2500)
    const { finalUrl } = await payKnet(checkout)
    console.log('   browser returned to:', finalUrl.slice(0, 90))
    const st = await waitFor(async () => (await status(A, bk.id)) === 'paid', 60000).catch(() => false)
    if (!st) { await invoke('payment-reconcile', A.token, { booking_id: bk.id }); await waitFor(async () => (await status(A, bk.id)) === 'paid', 30000) }
    const at = (await attempts(A, bk.id)); assert.equal(at[0].status, 'captured'); assert.ok(at[0].verified_at)
    await sleep(3000); console.log('   realtime events received:', JSON.stringify(events)); assert.ok(events.includes('paid'), 'Realtime delivered paid'); await A.c.removeChannel(ch)
  })
  await step('T11b', 'duplicate webhook: replaying the verified event does not process it twice', async () => {
    if (!HMAC) return 'BLOCKED'
    const at = (await attempts(A, bk.id))[0]
    const payload = { result: 'CAPTURED', requested_order_id: at.id.replace(/-/g, ''), order_id: 'dup' }
    const r1 = await webhook(payload), r2 = await webhook(payload)
    console.log('   replay responses:', JSON.stringify(r1.json), JSON.stringify(r2.json))
    assert.equal(r1.json?.outcome, 'duplicate'); assert.equal(r2.json?.outcome, 'duplicate')
    assert.equal(await status(A, bk.id), 'paid'); assert.equal((await attempts(A, bk.id)).length, 1)
  })
  await step('T15a', 'a paid booking cannot start another payment (409 already_paid)', async () => { const r = await invoke('initiate-payment', A.token, { booking_id: bk.id }); assert.equal(r.status, 409); assert.equal(r.json.error, 'already_paid') })
  console.log('BOOKING_FOR_NEXT_PHASES', bk2.id)
}

if (phase === 'decline') {
  const bk = await newBooking(C, 1); const r = await gatewayReady(C, bk.id)
  if (r.status === 502) { console.log('BLOCKED gateway not configured'); results.push('BLOCKED') } else {
    await step('T12', 'declined payment (sandbox KNET test card, wrong expiry) becomes failed only after provider-confirmed result; retry creates a new checkout', async () => {
      assert.equal(r.status, 200, JSON.stringify(r)); await payKnet(r.json.checkout_url, '01/31')
      const ok = await waitFor(async () => (await status(C, bk.id)) === 'failed', 60000).catch(() => false)
      if (!ok) { await invoke('payment-reconcile', C.token, { booking_id: bk.id }); await waitFor(async () => (await status(C, bk.id)) === 'failed', 30000) }
      const at = await attempts(C, bk.id); assert.ok(['failed', 'cancelled'].includes(at[0].status)); assert.equal(at[0].verified_at, null)
      const r2 = await invoke('initiate-payment', C.token, { booking_id: bk.id }); assert.equal(r2.status, 200, JSON.stringify(r2)); assert.notEqual(r2.json.attempt_id, r.json.attempt_id)
      assert.equal(await status(C, bk.id), 'awaiting_payment')
    })
  }
}
if (phase === 'abandon1') {
  const bk = await newBooking(C, 6); const r = await gatewayReady(C, bk.id)
  if (r.status !== 200) { console.log('BLOCKED gateway not configured'); results.push('BLOCKED') } else { console.log('ABANDONED_BOOKING', bk.id, r.json.checkout_url); assert.equal(await status(C, bk.id), 'awaiting_payment'); results.push('PASS'); console.log('PASS T13a checkout created and left unpaid') }
}
if (phase === 'abandon2') {
  const id = process.argv[4]; assert.ok(id, 'booking id required')
  await step('T13b', 'scheduled reconciliation expires the abandoned checkout (after the provider confirms no capture)', async () => {
    const r = await invoke('payment-reconcile', null, { sweep: true }, { Authorization: 'Bearer ' + KEY }); console.log('   sweep:', JSON.stringify(r.json))
    await waitFor(async () => (await status(C, id)) === 'expired', 90000); assert.equal((await attempts(C, id))[0].status, 'expired')
  })
  await step('T13c', 'a new payment can be started after expiry', async () => { const r = await invoke('initiate-payment', C.token, { booking_id: id }); assert.equal(r.status, 200, JSON.stringify(r)); console.log('NEW_CHECKOUT', r.json.checkout_url) })
}
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\nPHASE ${phase}: ${n('PASS')} passed, ${n('FAIL')} failed, ${n('BLOCKED')} blocked`); process.exit(n('FAIL') ? 1 : 0)
