// VORA minimal-UI journey on STAGING (browser): sign in -> device verification (OTP via operator handshake) -> onboarding/consents -> AI Coach (mock) with cost confirmation -> wallet -> existing workouts feature.
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { cred } from './_creds.mjs'
const BASE = process.env.BASE || 'http://localhost:4173', HS = process.env.HS_DIR || '/tmp', IDX = Number(process.env.CRED_IDX || 0)
const results = []
const step = async (id, name, fn) => { try { await fn(); if (process.env.SHOTDIR) await page.screenshot({ path: `${process.env.SHOTDIR}/${id}.png` }).catch(() => {}); results.push('PASS'); console.log('PASS', id, name) } catch (e) { results.push('FAIL'); console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 300)); try { console.log('   body:', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)) } catch {} } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function handshake(label, payload) { for (const f of [`need-${label}`, `code-${label}`]) if (existsSync(`${HS}/${f}`)) rmSync(`${HS}/${f}`); writeFileSync(`${HS}/need-${label}`, payload); console.log('   NEED', label); const t0 = Date.now(); while (!existsSync(`${HS}/code-${label}`)) { if (Date.now() - t0 > 240000) throw new Error('operator timeout'); await sleep(1000) } await sleep(300); return readFileSync(`${HS}/code-${label}`, 'utf8').trim() }
const c = cred(IDX)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } }); const page = await ctx.newPage()
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(BASE + '/#/login'); await page.evaluate(() => localStorage.setItem('lang', 'en')).catch(() => {})
await step('U01', 'sign in with email/password lands on the device-verification gate (no private screen visible)', async () => {
  await page.locator('input[type=email]').first().fill(c.email); await page.locator('input[type=password]').first().fill(c.password)
  await page.locator('form button[type=submit], form button.primary').first().click()
  await page.getByRole('heading', { name: /Verify this device|تأكيد هذا الجهاز/ }).waitFor({ timeout: 20000 })
  assert.equal(await page.locator('[data-testid=chat]').count(), 0)
})
await step('U02', 'wrong 6-digit code is rejected with a generic message', async () => {
  await page.getByRole('button', { name: /Send code|أرسل الرمز/ }).click(); await page.getByTestId('otp').waitFor()
  await page.getByTestId('otp').fill('000000'); await page.getByRole('button', { name: /^(Verify|تأكيد)$/ }).click()
  await page.getByText(/Invalid or expired code|غير صحيح/).waitFor({ timeout: 15000 })
})
const code = await handshake('otp', c.email)
await step('U03', 'correct emailed code verifies the device and opens the app', async () => {
  await page.getByTestId('otp').fill(code); await page.getByRole('button', { name: /^(Verify|تأكيد)$/ }).click()
  await page.getByTestId('chat').waitFor({ timeout: 20000 })
})
await step('U04', 'onboarding saves preferences + a consent is recorded', async () => {
  await page.goto(BASE + '/#/onboarding'); await page.getByRole('heading', { name: /Set up your profile|إعداد حسابك/ }).waitFor()
  await page.getByTestId('coach-sarah').click(); await page.getByRole('radio', { name: 'English' }).click()
  await page.getByRole('checkbox').first().click(); await sleep(1500)
  await page.getByRole('button', { name: /Save and continue|حفظ ومتابعة/ }).click()
  await page.getByText(/Ask your coach|اسأل مدربك/).waitFor({ timeout: 15000 })
})
await step('U05', 'AI Coach (mock): cost confirmation required, then a reply arrives', async () => {
  await page.getByTestId('msg').fill('Give me a quick 3 day plan'); await page.getByRole('button', { name: /^(Send|إرسال)/ }).click()
  await page.getByTestId('confirm').waitFor({ timeout: 15000 })
  await page.getByText(/will cost \d+ credits|سيتم خصم/).waitFor()
  await page.getByTestId('confirm').click()
  await page.getByText(/\[mock\]/).waitFor({ timeout: 25000 })
})
await step('U06', 'wallet shows the balance and a ledger entry for the charge', async () => {
  await page.goto(BASE + '/#/wallet'); await page.getByTestId('wallet').waitFor()
  await page.locator('.vora-ledger li').first().waitFor({ timeout: 15000 })
  const txt = await page.getByTestId('wallet').innerText(); console.log('   wallet:', txt.replace(/\s+/g, ' ').slice(0, 200))
})
await step('U07', 'plans page lists provisional plans from the database, with checkout disabled', async () => {
  await page.goto(BASE + '/#/plans'); await page.getByText(/provisional|مؤقتة/).first().waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: /Checkout unavailable|الدفع غير متاح/ }).first().waitFor({ timeout: 15000 })
  assert.ok(await page.getByRole('button', { name: /Checkout unavailable|الدفع غير متاح/ }).first().isDisabled())
})
await step('U08', 'EXISTING workouts feature still works against staging: add a workout and see it in the list', async () => {
  await page.goto(BASE + '/#/workouts'); await sleep(1500)
  const ex = page.locator('input').first(); await ex.fill('VORA bench press')
  const nums = page.locator('input[type=number]'); const n = await nums.count(); assert.ok(n >= 2, 'sets/reps inputs')
  await nums.nth(0).fill('3'); await nums.nth(1).fill('10'); if (n > 2) await nums.nth(2).fill('40')
  await page.locator('form button.primary, form button[type=submit]').first().click()
  await page.getByText('VORA bench press').first().waitFor({ timeout: 15000 })
})
await page.screenshot({ path: process.env.SHOT || '/tmp/vora-ui.png' })
console.log('page errors:', errors.length ? errors.join(' | ').slice(0, 300) : 'none')
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\nVORA UI (staging): ${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
