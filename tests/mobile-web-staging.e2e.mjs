// VORA Expo app (web build of the same React Native code) against STAGING, in a real browser.
// Free user: trusted-device gate -> home -> workouts -> nutrition locked -> ONE free trial conversation with the single AI trainer
// (text, off-topic redirect, photo honesty, nutrition locked) -> support ticket. Then the operator activates a subscription:
// exact-cost confirmation, nutrition unlocked, cancel auto-renewal. Then the operator ends everything: paywall.
// Operator handshakes (files in HS_DIR): need-motp -> write the e-mailed code to code-motp; need-sub / need-end -> run the printed SQL, then create code-sub / code-end.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { cred } from './_creds.mjs'
const BASE = process.env.BASE || 'http://localhost:4300', HS = process.env.HS_DIR || '/tmp', IDX = Number(process.env.CRED_IDX || 0), SHOTS = process.env.SHOTDIR
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function handshake(label, payload) { for (const f of [`need-${label}`, `code-${label}`]) if (existsSync(`${HS}/${f}`)) rmSync(`${HS}/${f}`); writeFileSync(`${HS}/need-${label}`, payload); console.log('   NEED', label, payload.slice(0, 160)); const t0 = Date.now(); while (!existsSync(`${HS}/code-${label}`)) { if (Date.now() - t0 > 400000) throw new Error('operator timeout'); await sleep(1000) } await sleep(300); return readFileSync(`${HS}/code-${label}`, 'utf8').trim() }
const c = cred(IDX)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ar-KW', colorScheme: process.env.SCHEME || 'light' }); const page = await ctx.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
const T = (id) => page.getByTestId(id)
const step = async (id, name, fn) => { try { await fn(); if (SHOTS) await page.screenshot({ path: `${SHOTS}/${id}.png` }).catch(() => {}); results.push('PASS'); console.log('PASS', id, name) } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 260)); if (SHOTS) await page.screenshot({ path: `${SHOTS}/${id}-FAIL.png` }).catch(() => {}); try { console.log('   body:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)) } catch {} } }
const num = (s) => Number(String(s).replace(/[^0-9]/g, ''))
const say = async (text) => { await T('msg').fill(text); await T('send').click() }
const bubbles = () => page.getByTestId('chat').innerText()
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

await page.goto(BASE + '/')
await step('M01', 'sign in lands on the trusted-device gate; no private screen is visible', async () => {
  await T('email').fill(c.email); await T('password').fill(c.password); await T('auth-submit').click()
  await T('send-code').waitFor({ timeout: 25000 }); assert.equal(await T('nav-home').count(), 0)
})
await step('M02', 'a wrong code is rejected with a generic message', async () => {
  await T('send-code').click(); await T('otp').waitFor({ timeout: 20000 }); await T('otp').fill('000000'); await T('verify-code').click()
  await page.getByText(/غير صحيح|Invalid or expired/).waitFor({ timeout: 15000 })
})
const code = await handshake('motp', c.email)
await step('M03', 'the e-mailed code verifies the device and opens Home with the 7-day plan', async () => {
  await T('otp').fill(code); await T('verify-code').click(); await T('nav-home').waitFor({ timeout: 25000 })
  await T('plan-day').first().waitFor(); assert.equal(await T('plan-day').count(), 7)
})
await step('M04', 'Workouts (free): body map lists exercises; set counter advances and starts the rest timer; workout log saves', async () => {
  await T('nav-workouts').click(); await T('muscle-back').click(); await T('exercise-card').first().waitFor({ timeout: 10000 })
  await T('set-done').first().click(); await page.getByText(/^(راحة|Rest)$/).first().waitFor({ timeout: 5000 }); assert.match(await T('set-progress').first().innerText(), /2/)
  const w = 'Expo e2e ' + Date.now().toString(36)
  await T('seg-log').click(); await T('w-exercise').fill(w); await T('w-sets').fill('3'); await T('w-reps').fill('10'); await T('w-add').click(); await page.getByText(w).first().waitFor({ timeout: 15000 })
})
await step('M05', 'Nutrition is locked for a free user (no recipes shown)', async () => {
  await T('nav-nutrition').click(); await T('locked').waitFor({ timeout: 15000 }); assert.equal(await T('recipe-machboos').count(), 0)
})
await step('M06', 'ONE trainer chat, free trial: no credit confirmation, labelled mock reply with a workout card, remaining counter shown', async () => {
  await T('nav-coach').click(); await T('trainer-name').waitFor(); await page.getByText(/تجربة مجانية|Free trial|One free trial/).first().waitFor({ timeout: 15000 })
  assert.equal(await T('tab-nutritionist').count() + await T('tab-support').count(), 0, 'no separate agent tabs')
  await T('chip-explain').click(); await T('workout-card').first().waitFor({ timeout: 30000 }); assert.equal(await T('confirm-bar').count(), 0); await T('mock-label').first().waitFor()
  await sleep(2500); const left = num(await T('access-badge').innerText()); assert.ok(left >= 1 && left < 50, 'remaining shown: ' + left)
})
await step('M07', 'off-topic question is politely redirected to fitness (no answer, no cards)', async () => {
  const before = await T('workout-card').count()
  await say('What is the capital of France?'); await page.getByText(/VORA|fitness|لياق|مدرب/).last().waitFor({ timeout: 30000 }); await sleep(1500)
  const t = await bubbles(); assert.ok(!/Paris|باريس/.test(t), 'must not answer'); assert.equal(await T('workout-card').count(), before)
})
await step('M08', 'photo: explicit media consent first; mock mode says honestly that it could not inspect the media', async () => {
  await T('add-photo').click(); await T('media-consent').waitFor({ timeout: 8000 })
  const fc = page.waitForEvent('filechooser', { timeout: 15000 }); await T('media-consent-yes').click(); await (await fc).setFiles({ name: 'machine.png', mimeType: 'image/png', buffer: PNG })
  await T('attachment-chip').waitFor({ timeout: 15000 }); await T('msg').fill('شلون أستخدم هالجهاز؟'); await T('send').click()
  await T('media-note').first().waitFor({ timeout: 30000 })
})
await step('M09', 'nutrition request during the trial is not served: locked note instead of a meal card', async () => {
  await say('أبي وصفة مجبوس دجاج عالي بروتين'); await T('locked-note').first().waitFor({ timeout: 30000 }); assert.equal(await T('meal-card').count(), 0)
})
await step('M10', 'customer support is a normal form: a ticket is created and listed', async () => {
  await T('nav-profile').click(); await T('open-support').click(); await T('ticket-text').fill('اختبار تلقائي: مشكلة تجريبية في التطبيق'); await T('ticket-send').click()
  await T('ticket-done').waitFor({ timeout: 20000 }); await T('ticket-row').first().waitFor({ timeout: 15000 }); await page.goBack()
})
const uid = await page.evaluate(() => { for (const k of Object.keys(localStorage)) { if (k.includes('auth-token')) { try { return JSON.parse(localStorage.getItem(k)).user.id } catch {} } } return '' })
await handshake('sub', `select public.subscription_activate('${uid}','pro', now() + interval '30 days', true, 'e2e-${Date.now()}');`)
await step('M11', 'after a subscription is activated: account shows subscriber, nutrition recipes open, plan screen shows the subscription', async () => {
  await page.reload(); await T('nav-home').waitFor({ timeout: 30000 })
  await T('nav-nutrition').click(); await T('recipe-machboos').waitFor({ timeout: 20000 }); await T('recipe-machboos').click(); await T('macros').waitFor({ timeout: 10000 }); await page.goBack()
  await T('nav-profile').click(); await page.getByText(/مشترك|Subscriber/).first().waitFor({ timeout: 15000 })
})
await step('M12', 'subscriber chat: exact credit cost is confirmed first, then charged; nutrition is served (meal card)', async () => {
  await T('nav-coach').click(); await T('trainer-name').waitFor(); await page.getByText(/^(مشترك|Subscriber)$/).first().waitFor({ timeout: 15000 })
  await say('أبي وصفة مجبوس دجاج عالي بروتين'); await T('confirm-bar').waitFor({ timeout: 20000 }); assert.match(await T('confirm-bar').innerText(), /50/)
  await T('confirm').click(); await T('meal-card').first().waitFor({ timeout: 30000 })
  await page.getByText(/50 (credits charged)|خُصم 50/).first().waitFor({ timeout: 10000 })
})
await step('M13', 'wallet shows the charge; auto-renewal can be cancelled in one tap and access stays', async () => {
  await T('nav-profile').click(); await T('open-wallet').click(); await T('ledger-row').first().waitFor({ timeout: 15000 }); await page.goBack()
  await T('open-store').click(); await T('my-subscription').waitFor({ timeout: 15000 }); await T('cancel-renewal').click()
  await page.getByText(/متوقف|: off/).first().waitFor({ timeout: 15000 }); await page.goBack()
  await T('open-devices').click(); await T('device-row').first().waitFor({ timeout: 15000 }); await page.goBack()
})
await handshake('end', `update public.subscriptions set status='expired' where user_id='${uid}' and status='active'; update public.trainer_trials set ended_at=now() where user_id='${uid}';`)
await step('M14', 'no subscription and trial used: the trainer shows the paywall and nutrition is locked again', async () => {
  await page.reload(); await T('nav-home').waitFor({ timeout: 30000 })
  await T('nav-coach').click(); await T('paywall').waitFor({ timeout: 20000 }); assert.equal(await T('send').count(), 0)
  await T('nav-nutrition').click(); await T('locked').waitFor({ timeout: 15000 })
})
console.log('page errors:', errors.length ? errors.join(' | ').slice(0, 400) : 'none')
await browser.close()
const n = (s) => results.filter((x) => x === s).length
console.log(`\nVORA EXPO (web build, staging): ${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
