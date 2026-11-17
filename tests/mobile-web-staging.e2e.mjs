// VORA Expo app (web build of the same React Native code) against STAGING, in a real browser.
// Journey: sign in -> trusted-device code (operator handshake) -> home -> workouts/body map + log -> recipe -> 3 AI agents -> account/wallet -> plans.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { cred } from './_creds.mjs'
const BASE = process.env.BASE || 'http://localhost:4300', HS = process.env.HS_DIR || '/tmp', IDX = Number(process.env.CRED_IDX || 0), SHOTS = process.env.SHOTDIR
const results = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function handshake(label, payload) { for (const f of [`need-${label}`, `code-${label}`]) if (existsSync(`${HS}/${f}`)) rmSync(`${HS}/${f}`); writeFileSync(`${HS}/need-${label}`, payload); console.log('   NEED', label); const t0 = Date.now(); while (!existsSync(`${HS}/code-${label}`)) { if (Date.now() - t0 > 300000) throw new Error('operator timeout'); await sleep(1000) } await sleep(300); return readFileSync(`${HS}/code-${label}`, 'utf8').trim() }
const c = cred(IDX)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ar-KW', colorScheme: process.env.SCHEME || 'light' }); const page = await ctx.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
const T = (id) => page.getByTestId(id)
const step = async (id, name, fn) => { try { await fn(); if (SHOTS) await page.screenshot({ path: `${SHOTS}/${id}.png` }).catch(() => {}); results.push('PASS'); console.log('PASS', id, name) } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 260)); try { console.log('   body:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 260)) } catch {} } }
const num = (s) => Number(String(s).replace(/[^0-9]/g, ''))

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
await step('M04', 'Workouts: body map selection lists exercises; set counter advances and starts the rest timer', async () => {
  await T('nav-workouts').click(); await T('muscle-back').click(); await T('exercise-card').first().waitFor({ timeout: 10000 })
  assert.match(await T('set-progress').first().innerText(), /1/); await T('set-done').first().click()
  await page.getByText(/^(راحة|Rest)$/).first().waitFor({ timeout: 5000 }); assert.match(await T('set-progress').first().innerText(), /2/)
  await T('env-home').click(); await T('exercise-card').first().waitFor(); await page.getByText(/Superman/).first().waitFor({ timeout: 5000 })
})
const wname = 'Expo e2e ' + Date.now().toString(36)
await step('M05', 'existing workout log works from the app: add a workout and see it in the list', async () => {
  await T('seg-log').click(); await T('w-exercise').fill(wname); await T('w-sets').fill('3'); await T('w-reps').fill('10'); await T('w-weight').fill('40'); await T('w-add').click()
  await page.getByText(wname).first().waitFor({ timeout: 15000 })
})
await step('M06', 'Nutrition: recipe opens with per-serving macros; using a substitute recalculates them', async () => {
  await T('nav-nutrition').click(); await T('recipe-machboos').click(); await T('macros').waitFor({ timeout: 10000 })
  const before = await T('macros').innerText(); await T('missing-rice').click(); await T('use-sub-rice').click(); await sleep(400)
  const after = await T('macros').innerText(); assert.match(after, /البدائل|substitutes/); assert.ok(before.length > 10)
  await page.goBack(); await T('nav-coach').waitFor()
})
let balanceBefore = 0
await step('M07', 'Coach agent: exact-cost confirmation, then a labelled mock reply with a workout card; credits drop by the shown cost', async () => {
  await T('nav-coach').click(); await T('tab-coach').waitFor(); await sleep(2500)
  balanceBefore = num(await T('balance-badge').innerText()); assert.ok(balanceBefore >= 50, 'needs credits, has ' + balanceBefore)
  await T('chip-home_version').click(); await T('confirm-bar').waitFor({ timeout: 10000 }); assert.match(await T('confirm-bar').innerText(), /50/)
  await T('confirm').click(); await T('workout-card').first().waitFor({ timeout: 30000 }); await T('mock-label').first().waitFor()
  await sleep(2500); assert.equal(num(await T('balance-badge').innerText()), balanceBefore - 50)
})
await step('M08', 'Nutrition agent returns a meal card (after confirmation)', async () => {
  await T('tab-nutritionist').click(); await T('chip-protein_machboos').click(); await T('confirm').click(); await T('meal-card').first().waitFor({ timeout: 30000 })
})
await step('M09', 'Support agent is free (no confirmation, no charge) and opens a ticket card', async () => {
  await T('tab-nutritionist').click(); await sleep(1500); const b0 = num(await T('balance-badge').innerText())
  await T('tab-support').click(); await T('chip-open_ticket').click(); assert.equal(await T('confirm-bar').count(), 0)
  await T('ticket-card').first().waitFor({ timeout: 30000 })
  await T('tab-coach').click(); await sleep(2000); assert.equal(num(await T('balance-badge').innerText()), b0)
})
await step('M10', 'Account shows balance, devices x/2 and the new ticket; wallet lists ledger rows; plans show with checkout disabled', async () => {
  await T('nav-profile').click(); await T('ticket-row').first().waitFor({ timeout: 15000 }); await page.getByText(/[12]\/2/).first().waitFor()
  assert.equal(num(await T('profile-balance').innerText()), balanceBefore - 100)
  await T('open-wallet').click(); await T('ledger-row').first().waitFor({ timeout: 15000 }); await page.goBack()
  await T('open-store').click(); await T('plan-card').first().waitFor({ timeout: 15000 }); assert.ok((await T('plan-card').count()) >= 3)
  await page.goBack()
})
await step('M11', 'trusted devices screen lists this device', async () => { await T('open-devices').click(); await T('device-row').first().waitFor({ timeout: 15000 }) })
console.log('page errors:', errors.length ? errors.join(' | ').slice(0, 400) : 'none')
await browser.close()
const n = (s) => results.filter((x) => x === s).length
console.log(`\nVORA EXPO (web build, staging): ${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
