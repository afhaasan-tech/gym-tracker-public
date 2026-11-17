// Purchase flow against the LOCAL stack + the REAL UPayments SANDBOX (public test key, no real money):
// initiate-purchase creates a hosted checkout from the server-side price; purchase-status asks the provider.
// With PAY=1 a browser pays the hosted page with the documented KNET test card and the order must become paid exactly once.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
const URL_ = process.env.LOCAL_URL, KEY = process.env.LOCAL_ANON, SERVICE = process.env.LOCAL_SERVICE, KIND = process.env.KIND || 'coins', ITEM = process.env.ITEM || 'starter'
assert.ok(URL_ && /^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_) && KEY && SERVICE, 'local stack only')
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-c', q], { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim()
const call = async (name, token, body) => { const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) } }
let pass = 0, fail = 0
const step = async (id, name, fn) => { try { await fn(); pass++; console.log('PASS', id, name) } catch (e) { fail++; console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 400)) } }
const email = `buy-${Date.now()}@example.com`, password = 'Pw-' + randomBytes(9).toString('base64url') + 'a1'
const made = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) })
const uid = (await made.json()).id
const c = createClient(URL_, KEY, { auth: { persistSession: false } }); const { data } = await c.auth.signInWithPassword({ email, password }); const token = data.session.access_token
let order, checkout
await step('P01', 'an untrusted session cannot start a purchase', async () => { const r = await call('initiate-purchase', token, { kind: KIND, item_key: ITEM, idempotency_key: 'e2e-' + randomUUID() }); assert.equal(r.status, 403); assert.equal(r.json.error, 'device_not_trusted') })
const secret = randomBytes(32).toString('base64url')
await call('device-auth', token, { action: 'send_code', device_secret: secret, language: 'en' })
const code = sql(`select substring(body from '[0-9]{6}') from public.dev_mock_outbox where to_email='${email}' order by id desc limit 1`)
await call('device-auth', token, { action: 'verify_code', device_secret: secret, code, label: 'e2e' })
await step('P02', 'checkout is created on the UPayments SANDBOX with the price taken from the server', async () => {
  const idem = 'e2e-' + randomUUID()
  const r = await call('initiate-purchase', token, { kind: KIND, item_key: ITEM, idempotency_key: idem, amount_kwd: 0.001 }); assert.equal(r.status, 200, JSON.stringify(r.json))
  order = r.json.order_id; checkout = r.json.checkout_url; console.log('   checkout:', new URL(checkout).host, 'amount', r.json.amount_kwd)
  assert.match(new URL(checkout).host, /sandbox|uat|dev|test/i, 'sandbox host')
  const expected = sql(KIND === 'coins' ? `select price_kwd from public.coin_packs where key='${ITEM}'` : `select price_kwd from public.plans where key='${ITEM}'`)
  assert.equal(Number(r.json.amount_kwd), Number(expected), 'a client-sent amount is ignored')
  const again = await call('initiate-purchase', token, { kind: KIND, item_key: ITEM, idempotency_key: idem }); assert.equal(again.json.order_id, order, 'same key = same order (no duplicate)')
})
await step('P03', 'before paying: the server reports the order as not paid and nothing is granted', async () => {
  const r = await call('purchase-status', token, { order_id: order }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.notEqual(r.json.status, 'paid'); assert.equal(r.json.fulfilled, false)
  assert.equal(sql(`select coalesce(sum(amount),0) from public.credit_ledger where user_id='${uid}' and source='purchased'`), '0')
  assert.equal(sql(`select count(*) from public.subscriptions where user_id='${uid}'`), '0')
})
if (process.env.PAY === '1') {
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] }); const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage()
  await step('P04', 'pay the hosted sandbox page with the KNET test card', async () => {
    await page.goto(checkout, { waitUntil: 'domcontentloaded', timeout: 60000 }); await page.waitForTimeout(5000)
    if (process.env.SHOTDIR) await page.screenshot({ path: process.env.SHOTDIR + '/pay-1.png' })
    const knet = page.getByText(/K-?NET|كي ?نت/i).first(); if (await knet.count()) await knet.click().catch(() => {})
    const go = page.getByRole('button', { name: /pay|ادفع|proceed|continue|متابعة/i }).first(); if (await go.count()) await go.click().catch(() => {})
    await page.waitForSelector('select[name="bank"], #bank', { timeout: 45000 })
    await page.selectOption('select[name="bank"], #bank', { index: 1 }); await page.waitForTimeout(800)
    await page.fill('input[name="debitNumber"], #debitNumber', '0000000001'); await page.selectOption('select[name="expmnth"], #debitMonthSelect', '9').catch(() => page.selectOption('#debitMonthSelect', '09')); await page.selectOption('select[name="expyear"], #debitYearSelect', '2030'); await page.fill('input[name="cardPin"], #cardPin', '1234')
    if (process.env.SHOTDIR) await page.screenshot({ path: process.env.SHOTDIR + '/pay-2.png' })
    await page.click('#proceed'); await page.waitForSelector('#proceedConfirm', { timeout: 30000 }); await page.click('#proceedConfirm'); await page.waitForTimeout(12000)
    if (process.env.SHOTDIR) await page.screenshot({ path: process.env.SHOTDIR + '/pay-3.png' })
  })
  await step('P05', 'the SERVER verifies the payment with the provider: order paid and fulfilled', async () => {
    let r; for (let i = 0; i < 8; i++) { r = await call('purchase-status', token, { order_id: order }); if (r.json.status === 'paid' && r.json.fulfilled) break; await new Promise((x) => setTimeout(x, 6000)) }
    assert.equal(r.json.status, 'paid', JSON.stringify(r.json)); assert.equal(r.json.fulfilled, true); assert.equal(r.json.verified_with_provider, true)
  })
  await step('P06', 'entitlement activated exactly once, even when the status is checked again', async () => {
    for (let i = 0; i < 3; i++) { await call('purchase-status', token, { order_id: order }); await new Promise((x) => setTimeout(x, 5500)) }
    if (KIND === 'coins') { const coins = sql(`select coins from public.coin_packs where key='${ITEM}'`); assert.equal(sql(`select coalesce(sum(amount),0) from public.credit_ledger where user_id='${uid}' and source='purchased'`), coins); const a = (await c.rpc('my_trainer_access')).data; assert.equal(a.purchased_coins, Number(coins)) }
    else { assert.equal(sql(`select count(*) from public.subscriptions where user_id='${uid}' and status='active'`), '1'); const a = (await c.rpc('my_trainer_access')).data; assert.equal(a.tier, 'subscriber'); assert.equal(a.auto_renew, false); assert.equal(a.library, true) }
  })
  await browser.close()
}
console.log(`PURCHASE local (${KIND}/${ITEM}): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
