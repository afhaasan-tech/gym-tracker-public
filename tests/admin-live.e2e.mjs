// Admin live end-to-end test: real Chromium against the real site + real Supabase. No mocks, no service-role key.
// Positive half needs the admin's real credentials, passed ONLY through the environment (never printed, never stored):
//   node tests/admin-live.e2e.mjs [baseUrl]      -> asks for the admin password with HIDDEN input (not echoed, not in argv/history)
// (ADMIN_EMAIL / ADMIN_PASSWORD env vars are still honoured for CI.) Without a password only the normal-user (negative) half runs and the admin steps are reported as SKIPPED, not passed.
// It creates one brand-new normal account (generated password) and one demo booking for it; the admin leg adds one demo
// booking for the admin. It never edits or cancels existing bookings.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import readline from 'node:readline'

function askVisible(q) { return new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a.trim()) }) }) }
// Hidden password prompt: output is muted while typing, so the password never appears on screen, in argv or in shell history.
function askHidden(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (t) => { if (t.includes(q)) process.stdout.write(t) }
    rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a) })
  })
}

const base = process.argv[2] || 'https://gym-tracker-theta-topaz.vercel.app'
const SUPABASE_URL = 'https://zbqdmebrxqshcsozamwg.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ' // public by design (ships in the site bundle)
const RUN = Date.now().toString(36)
const U = { email: (process.env.TEST_EMAIL_BASE || 'your.name@gmail.com').replace('@', `+adminlive${RUN}u@`), password: randomBytes(16).toString('hex') }
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
if (!ADMIN.email && process.stdin.isTTY) ADMIN.email = await askVisible('Admin email: ')
if (ADMIN.email && !ADMIN.password && process.stdin.isTTY) ADMIN.password = await askHidden(`Admin password for ${ADMIN.email} (hidden): `)
const haveAdmin = Boolean(ADMIN.password)
const results = []
const ok = (m) => { results.push('PASS'); console.log('PASS', m) }
const fail = (m, e) => { results.push('FAIL'); console.log('FAIL', m, '-', String(e?.message ?? e).split('\n')[0]) }
const skip = (m) => { results.push('SKIP'); console.log('SKIP', m, '(no admin password supplied)') }
const step = async (name, fn, needsAdmin = false) => { if (needsAdmin && !haveAdmin) return skip(name); try { await fn(); ok(name) } catch (e) { fail(name, e) } }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/opt/pw-browsers/chromium') })
const newPage = async () => (await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage())
const heading = (p) => p.getByRole('heading', { name: 'تماريني' })
const goTab = (p, name) => p.getByRole('button', { name, exact: true }).first().click()
const client = () => createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })
const dash = (p) => p.getByLabel('لوحة الإدارة')

async function signup(page, acc) {
  await page.goto(base)
  await page.getByRole('button', { name: 'جديد؟ سوّي حساب' }).click()
  await page.getByLabel('الإيميل', { exact: true }).fill(acc.email)
  await page.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await page.getByRole('button', { name: 'سجّل', exact: true }).click()
  await heading(page).waitFor({ timeout: 20000 })
}
async function login(page, acc) {
  await page.goto(base)
  await page.getByLabel('الإيميل', { exact: true }).fill(acc.email)
  await page.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await heading(page).waitFor({ timeout: 20000 })
}
async function bookDemo(page) {
  await goTab(page, 'احجز جلسة')
  await page.getByText('خدمات تجريبية للعرض فقط').waitFor()
  await page.getByText('جلسة تدريب شخصي (تجريبي)').click()
  const d = new Date(Date.now() + 6 * 86400000); const pad = (n) => String(n).padStart(2, '0')
  await page.getByLabel(/الموعد المطلوب/).fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T17:00`)
  await page.getByRole('button', { name: 'ثبّت الحجز التجريبي' }).click()
  await page.getByRole('heading', { name: 'تم تثبيت الحجز التجريبي' }).waitFor()
}

let uId, uBookingId, adminBookingId, adminClient, adminId
const userPage = await newPage()

await step('normal user: signup + demo booking through the live UI', async () => {
  await signup(userPage, U); await bookDemo(userPage)
  const c = client(); const { error } = await c.auth.signInWithPassword(U); assert.ifError(error)
  uId = (await c.auth.getUser()).data.user.id
  const { data } = await c.from('bookings').select('id'); assert.equal(data.length, 1); uBookingId = data[0].id
})
await step('normal user: no admin dashboard in the UI and is_admin() is false', async () => {
  await userPage.reload(); await heading(userPage).waitFor(); await goTab(userPage, 'احجز جلسة'); await userPage.getByText('خدمات تجريبية للعرض فقط').waitFor()
  await userPage.waitForTimeout(800); assert.equal(await dash(userPage).count(), 0)
  const c = client(); await c.auth.signInWithPassword(U); assert.equal((await c.rpc('is_admin')).data, false)
})
await step('normal user: admins table is unreadable/empty and cannot be written via the API', async () => {
  const c = client(); await c.auth.signInWithPassword(U)
  const r = await c.from('admins').select('*'); assert.ok(r.error || (r.data ?? []).length === 0)
  const w = await c.from('admins').insert({ user_id: uId }); assert.ok(w.error)
  assert.equal((await c.rpc('is_admin')).data, false)
})

await step('admin: login through the live form shows the admin dashboard', async () => {
  const p = await newPage(); await login(p, ADMIN); await goTab(p, 'احجز جلسة'); await dash(p).waitFor({ timeout: 15000 })
  adminClient = client(); const { error } = await adminClient.auth.signInWithPassword(ADMIN); assert.ifError(error)
  adminId = (await adminClient.auth.getUser()).data.user.id
  assert.equal((await adminClient.rpc('is_admin')).data, true)
  await p.reload(); await heading(p).waitFor(); await goTab(p, 'احجز جلسة'); await dash(p).waitFor()
  await p.close()
}, true)
await step("admin: dashboard (UI) and API both list the normal user's booking", async () => {
  const { data } = await adminClient.from('bookings').select('id,user_id'); assert.ok(data.some((b) => b.id === uBookingId && b.user_id === uId))
  const p = await newPage(); await login(p, ADMIN); await goTab(p, 'احجز جلسة')
  await dash(p).locator('li', { hasText: uBookingId.slice(0, 8) }).waitFor({ timeout: 15000 }); await p.close()
}, true)
await step('admin: creates own demo booking and sees it in the dashboard', async () => {
  const p = await newPage(); await login(p, ADMIN); await bookDemo(p)
  const { data } = await adminClient.from('bookings').select('id,user_id').eq('user_id', adminId).order('created_at', { ascending: false }).limit(1); adminBookingId = data[0].id
  await p.reload(); await heading(p).waitFor(); await goTab(p, 'احجز جلسة')
  await dash(p).locator('li', { hasText: adminBookingId.slice(0, 8) }).waitFor({ timeout: 15000 }); await p.close()
}, true)
await step("admin: Confirm then Cancel on THIS RUN's test booking persist after refresh; payment_status unchanged", async () => {
  const p = await newPage(); await login(p, ADMIN); await goTab(p, 'احجز جلسة')
  const row = () => dash(p).locator('li', { hasText: uBookingId.slice(0, 8) })
  const status = async () => (await adminClient.from('bookings').select('booking_status,payment_status').eq('id', uBookingId).single()).data
  await row().getByRole('button', { name: 'أكّد' }).click()
  await p.waitForFunction(() => true); await p.waitForTimeout(1500)
  let s1 = await status(); assert.equal(s1.booking_status, 'confirmed'); assert.equal(s1.payment_status, 'pending')
  await p.reload(); await heading(p).waitFor(); await goTab(p, 'احجز جلسة'); await row().waitFor()
  assert.equal((await status()).booking_status, 'confirmed')
  await row().getByRole('button', { name: 'إلغاء' }).click(); await p.waitForTimeout(1500)
  let s2 = await status(); assert.equal(s2.booking_status, 'cancelled'); assert.equal(s2.payment_status, 'pending')
  await p.reload(); await heading(p).waitFor(); await goTab(p, 'احجز جلسة'); await row().waitFor()
  assert.equal((await status()).booking_status, 'cancelled'); await p.close()
}, true)
await step("normal user still cannot see the admin's booking or any admin data", async () => {
  const c = client(); await c.auth.signInWithPassword(U)
  const { data } = await c.from('bookings').select('id'); assert.deepEqual(data.map((b) => b.id), [uBookingId])
  if (adminBookingId) { const r = await c.from('bookings').select('id').eq('id', adminBookingId); assert.equal(r.data.length, 0) }
  const u = await c.from('bookings').update({ booking_status: 'confirmed' }).eq('id', uBookingId).select(); assert.equal((u.data ?? []).length, 0)
})
await step('logged-out client cannot read bookings or admins', async () => {
  const a = client(); for (const t of ['bookings', 'admins']) { const r = await a.from(t).select('*'); assert.ok(r.error || (r.data ?? []).length === 0, t) }
})

await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\nRUN ${RUN}: ${n('PASS')} passed, ${n('FAIL')} failed, ${n('SKIP')} skipped`)
process.exit(n('FAIL') ? 1 : 0)
