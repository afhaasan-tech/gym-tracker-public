// Live test of the e-mail verification gate against the real site + real Supabase (no mocks).
// It needs ONE real account whose e-mail is NOT yet verified. Create it without touching anyone else's data:
//   node tests/verify-email-live.e2e.mjs --make <credsFile> <sqlFile>   (writes a creds file and a one-user SQL script; only a bcrypt HASH is in the SQL)
//   run the SQL in the Supabase SQL editor, then:
//   node tests/verify-email-live.e2e.mjs <credsFile> [baseUrl]
// The correct-code path needs the real e-mail: see the interactive step at the end (set VERIFY_INTERACTIVE=1 and type the code, hidden).
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

if (process.argv[2] === '--make') {
  const { default: bcrypt } = await import('bcryptjs')
  const [credsOut, sqlOut] = process.argv.slice(3)
  const u = { id: randomUUID(), email: `verifytest-${randomBytes(3).toString('hex')}@example.com`, password: randomBytes(12).toString('hex') }
  const hash = bcrypt.hashSync(u.password, 10)
  writeFileSync(credsOut, JSON.stringify(u))
  writeFileSync(sqlOut, `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','${u.id}','authenticated','authenticated','${u.email}','${hash}',null,'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities (id,user_id,provider_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
values (gen_random_uuid(),'${u.id}','${u.id}','{"sub":"${u.id}","email":"${u.email}","email_verified":false}','email',now(),now(),now());`)
  console.log('unverified test account:', u.email); process.exit(0)
}

const U = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const base = process.argv[3] || 'https://gym-tracker-afhaasan.vercel.app'
const SUPABASE_URL = 'https://zbqdmebrxqshcsozamwg.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ' // public by design
const results = []
const step = async (name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', name) } catch (e) { results.push('FAIL'); console.log('FAIL', name, '-', String(e?.message ?? e).split('\n')[0]) } }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage()
const heading = page.getByRole('heading', { name: 'تماريني' })
const code = page.getByLabel('رمز التحقق')
const verifyBtn = page.getByRole('button', { name: 'تحقّق', exact: true })

await step('REST: unverified account cannot get a session (email_not_confirmed)', async () => {
  const c = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signInWithPassword({ email: U.email, password: U.password })
  assert.equal(data.session, null); assert.equal(error?.code, 'email_not_confirmed')
  const r = await c.from('workouts').select('id'); assert.ok(r.error || (r.data ?? []).length === 0)
})
await step('login form: unverified account lands on the Arabic verification screen, not the app', async () => {
  await page.goto(base)
  await page.getByLabel('الإيميل', { exact: true }).fill(U.email); await page.getByLabel('الرقم السري', { exact: true }).fill(U.password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await page.getByRole('heading', { name: 'أكّد إيميلك' }).waitFor({ timeout: 15000 })
  assert.equal(await heading.count(), 0)
  assert.equal(await page.locator('main').first().evaluate((el) => getComputedStyle(el).direction), 'rtl')
  await page.getByText(U.email).waitFor()
})
await step('after refresh the protected pages are still closed', async () => { await page.reload(); await page.getByLabel('الإيميل', { exact: true }).waitFor(); assert.equal(await heading.count(), 0) })
await step('too-short code is rejected in Arabic without contacting the server', async () => {
  await page.getByLabel('الإيميل', { exact: true }).fill(U.email); await page.getByLabel('الرقم السري', { exact: true }).fill(U.password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click(); await code.waitFor()
  let calls = 0; page.on('request', (r) => { if (r.url().includes('/auth/v1/verify')) calls++ })
  await code.fill('123'); await verifyBtn.click(); await page.getByRole('alert').filter({ hasText: '6 أرقام' }).waitFor(); assert.equal(calls, 0)
})
await step('non-digits are stripped from the code field', async () => { await code.fill('12ab34'); assert.equal(await code.inputValue(), '1234') })
await step('wrong 6-digit code: real Supabase rejects it and the app shows the Arabic wrong/expired message', async () => {
  await code.fill('000000'); await verifyBtn.click(); await page.getByRole('alert').filter({ hasText: 'غلط أو انتهت' }).waitFor({ timeout: 15000 }); assert.equal(await heading.count(), 0)
})
await step('after 5 wrong codes the app asks for a new code instead of trying again', async () => {
  for (let i = 0; i < 4; i++) { await code.fill('111111'); await verifyBtn.click(); await page.waitForTimeout(700) }
  await code.fill('222222'); await verifyBtn.click(); await page.getByRole('alert').filter({ hasText: 'اطلب رمز جديد' }).waitFor({ timeout: 10000 })
})
let resendResult = ''
await step('resend: button works once, then shows a countdown and is disabled (cooldown)', async () => {
  await page.getByRole('button', { name: /أرسل رمز جديد/ }).click()
  const cd = page.getByRole('button', { name: /بعد \d+ ثانية/ }); await cd.waitFor({ timeout: 15000 }); assert.ok(await cd.isDisabled())
  resendResult = (await page.getByRole('status').count()) ? 'sent' : 'provider error shown: ' + (await page.getByRole('alert').first().innerText())
  console.log('   resend outcome:', resendResult)
})
await step('cooldown survives a refresh', async () => {
  await page.reload(); await page.getByLabel('الإيميل', { exact: true }).fill(U.email); await page.getByLabel('الرقم السري', { exact: true }).fill(U.password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click(); await page.getByRole('button', { name: /بعد \d+ ثانية/ }).waitFor()
})
await step('back returns to the login form', async () => { await page.getByRole('button', { name: 'رجوع', exact: true }).click(); await page.getByRole('button', { name: 'دخول', exact: true }).waitFor() })

if (process.env.VERIFY_INTERACTIVE === '1' && process.stdin.isTTY) {
  const readline = await import('node:readline')
  const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true }); rl._writeToOutput = (t) => { if (t.includes(q)) process.stdout.write(t) }; rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a.trim()) }) })
  await step('REAL code from the inbox verifies the account and opens the app', async () => {
    await page.getByLabel('الإيميل', { exact: true }).fill(U.email); await page.getByLabel('الرقم السري', { exact: true }).fill(U.password)
    await page.getByRole('button', { name: 'دخول', exact: true }).click(); await code.waitFor()
    await code.fill(await ask('Enter the 6-digit code from the e-mail (hidden): ')); await verifyBtn.click(); await heading.waitFor({ timeout: 20000 })
  })
}
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\n${n('PASS')} passed, ${n('FAIL')} failed`)
process.exit(n('FAIL') ? 1 : 0)
