// VORA Expo app (web build of the same React Native code) in a real browser against a LOCAL Supabase stack.
// One member goes through every access level: free (muscle basics, one short trial conversation, Premium invitation),
// VORA Coins (pay per message), monthly subscriber (premium library read from the server, library-based cards), expiry.
// The operator role (e-mailed code, granting purchased coins, activating/expiring a period) is played through psql locally.
//   BASE=http://localhost:4300 LOCAL_URL=http://127.0.0.1:54399 LOCAL_SERVICE=<service key> node tests/mobile-web-local.e2e.mjs
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const BASE = process.env.BASE || 'http://localhost:4300', URL_ = process.env.LOCAL_URL, SERVICE = process.env.LOCAL_SERVICE, SHOTS = process.env.SHOTDIR
assert.ok(URL_ && /^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_) && SERVICE, 'local stack only')
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-c', q], { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const email = `app-${Date.now()}@example.com`, password = 'Pw-' + Math.random().toString(36).slice(2) + 'A1x'
const made = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) })
const uid = (await made.json()).id; assert.ok(uid, 'test user')
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, locale: 'ar-KW' }); const page = await ctx.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
const T = (id) => page.getByTestId(id)
let pass = 0, fail = 0
const step = async (id, name, fn) => { try { await fn(); if (SHOTS) await page.screenshot({ path: `${SHOTS}/${id}.png` }).catch(() => {}); pass++; console.log('PASS', id, name) } catch (e) { fail++; if (SHOTS) await page.screenshot({ path: `${SHOTS}/${id}-FAIL.png` }).catch(() => {}); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 260)) } }
const say = async (text) => { await T('msg').fill(text); await T('send').click() }
const fresh = async () => { await page.goto(BASE + '/'); await T('nav-home').waitFor({ timeout: 30000 }) }

await page.goto(BASE + '/')
await step('A01', 'sign in lands on the trusted-device gate; a wrong code is rejected', async () => {
  await T('email').fill(email); await T('password').fill(password); await T('auth-submit').click()
  await T('send-code').waitFor({ timeout: 25000 }); assert.equal(await T('nav-home').count(), 0)
  await T('send-code').click(); await T('otp').waitFor({ timeout: 20000 }); await T('otp').fill('000000'); await T('verify-code').click()
  await page.getByText(/غير صحيح|Invalid or expired/).waitFor({ timeout: 15000 })
})
await step('A02', 'the e-mailed code verifies the device and opens Home', async () => {
  const code = sql(`select substring(body from '[0-9]{6}') from public.dev_mock_outbox where to_email='${email}' order by id desc limit 1`)
  await T('otp').fill(code); await T('verify-code').click(); await T('nav-home').waitFor({ timeout: 25000 })
})
await step('A03', 'FREE workouts: muscle basics for the picked muscle; premium library NOT shown (preview + invitation only); log works', async () => {
  await T('nav-workouts').click(); await T('muscle-info').waitFor({ timeout: 15000 }); const chest = await T('muscle-info').innerText()
  await T('muscle-back').click(); await page.waitForFunction((t) => document.querySelector('[data-testid="muscle-info"]')?.innerText !== t, chest, { timeout: 8000 })
  assert.match(await T('muscle-info').innerText(), /الظهر|Back/); await T('library-preview').waitFor(); assert.equal(await T('exercise-card').count(), 0)
  const w = 'Expo e2e ' + Date.now().toString(36)
  await T('seg-log').click(); await T('w-exercise').fill(w); await T('w-sets').fill('3'); await T('w-reps').fill('10'); await T('w-add').click(); await page.getByText(w).first().waitFor({ timeout: 15000 })
})
await step('A04', 'FREE nutrition is locked', async () => { await T('nav-nutrition').click(); await T('locked').waitFor({ timeout: 15000 }) })
await step('A05', 'FREE trainer: one short answer, no exercise card, no cost confirmation, Premium invitation that can be dismissed', async () => {
  await T('nav-coach').click(); await T('trainer-name').waitFor(); await page.getByText(/تجربة مجانية|Free trial|One free trial/).first().waitFor({ timeout: 15000 })
  await say('شنو أفضل تمرين للصدر؟'); await T('mock-label').first().waitFor({ timeout: 30000 })
  assert.equal(await T('workout-card').count(), 0); assert.equal(await T('confirm-bar').count(), 0)
  await T('upgrade-prompt').first().waitFor({ timeout: 8000 }); await T('upgrade-dismiss').first().click(); await sleep(400); assert.equal(await T('upgrade-prompt').count(), 0, 'dismissed')
})
await step('A06', 'off-topic question is redirected to fitness, not answered', async () => {
  await say('What is the capital of France?'); await sleep(6000); const t = await page.locator('body').innerText(); assert.ok(!/Paris|باريس/.test(t)); assert.match(t, /VORA|fitness|لياق|مدرب/)
})
await step('A07', 'Premium invitation → Premium preview with benefits and BOTH durations → store with 2 plans and the 3 approved coin packs', async () => {
  await say('أبي خطة تمارين أسبوعية'); await T('upgrade-prompt').first().waitFor({ timeout: 30000 }); await T('upgrade-cta').first().click()
  await T('premium-benefit').first().waitFor({ timeout: 15000 }); assert.ok(await T('premium-benefit').count() >= 4)
  await T('premium-plan-monthly').waitFor(); await T('premium-plan-yearly').waitFor(); await T('premium-go-store').click()
  await T('pack-card').first().waitFor({ timeout: 15000 }); assert.equal(await T('pack-card').count(), 3); assert.equal(await T('plan-card').count(), 2)
  const t = await page.locator('body').innerText(); for (const p of ['0.990', '2.490', '4.990']) assert.ok(t.includes(p), 'price ' + p)
})
// operator: the trial is over and the member bought coins
sql(`insert into public.trainer_trials (user_id, conversation_id, ended_at) values ('${uid}', gen_random_uuid(), now()) on conflict (user_id) do update set ended_at = now()`)
await step('A08', 'trial ended: the trainer shows the paywall with plans and VORA Coins', async () => { await fresh(); await T('nav-coach').click(); await T('paywall').waitFor({ timeout: 20000 }) })
sql(`select public.credit_grant('${uid}', 'purchased', 100, 'purchase', 'app-e2e-${Date.now()}', 'e2e purchased coins')`)
await step('A09', 'VORA COINS: price (50) shown before charging, charged after confirm, no exercise card; library still closed', async () => {
  await fresh(); await T('nav-coach').click(); await page.getByText(/VORA Coins|ڤورا كوينز/).first().waitFor({ timeout: 20000 })
  await say('شلون أستخدم جهاز السحب العلوي؟'); await T('confirm-bar').waitFor({ timeout: 30000 }); assert.match(await T('confirm-bar').innerText(), /50/)
  await T('confirm').click(); await page.getByText(/50 (VORA Coins charged)|خُصم 50/).first().waitFor({ timeout: 30000 }); assert.equal(await T('workout-card').count(), 0)
  await T('nav-workouts').click(); await T('library-preview').waitFor({ timeout: 15000 }); assert.equal(await T('exercise-card').count(), 0)
})
sql(`select public.subscription_activate('${uid}', 'monthly', now() + interval '30 days', false, 'app-e2e-sub-${Date.now()}')`)
await step('A10', 'MONTHLY: workouts show the premium library from the server with details, safety and references; set counter + rest timer', async () => {
  await fresh(); await T('nav-workouts').click(); await T('exercise-card').first().waitFor({ timeout: 20000 }); assert.ok(await T('exercise-card').count() >= 3); assert.equal(await T('library-preview').count(), 0)
  await T('exercise-details').first().click(); await T('exercise-detail-body').first().waitFor(); assert.match(await T('exercise-detail-body').first().innerText(), /السلامة|Safety/); await T('exercise-sources').first().waitFor()
  await T('set-done').first().click(); await page.getByText(/^(راحة|Rest)$/).first().waitFor({ timeout: 5000 })
})
await step('A11', 'MONTHLY trainer: confirmed request returns an exercise card built from the library; nutrition tab is open', async () => {
  await T('nav-coach').click(); await T('trainer-name').waitFor(); await say('عطني تمرين صدر'); await T('confirm-bar').waitFor({ timeout: 30000 }); await T('confirm').click()
  await T('workout-card').first().waitFor({ timeout: 30000 }); assert.equal(await T('upgrade-prompt').count(), 0)
  await T('nav-nutrition').click(); await sleep(2500); assert.equal(await T('locked').count(), 0)
})
sql(`update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id='${uid}'`); sql('select public.subscriptions_expire_due()')
await step('A12', 'after the period ends the library closes again (preview shown, no premium records)', async () => {
  await fresh(); await T('nav-workouts').click(); await T('library-preview').waitFor({ timeout: 20000 }); assert.equal(await T('exercise-card').count(), 0); await T('muscle-info').waitFor()
})
await step('A13', 'no uncaught page errors during the whole journey', async () => { assert.deepEqual(errors, []) })
await browser.close()
console.log(`APP local: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
