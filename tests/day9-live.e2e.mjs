// Day 9 live end-to-end test: real Chrome against the real site + real Supabase. No mocks.
// It signs up TWO brand-new accounts through the signup form (generated passwords, never printed) and exercises:
// signup/login/logout/session, workouts, cross-account isolation, profile persistence, demo bookings, admin-section
// visibility, payment_status protection.
// Usage:  node tests/day9-live.e2e.mjs [baseUrl]
// Cleanup: the run prints a RUN id; delete only that run's accounts (cascades to their rows) with the SQL it prints.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

const base = process.argv[2] || 'https://gym-tracker-theta-topaz.vercel.app'
const SUPABASE_URL = 'https://zbqdmebrxqshcsozamwg.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ' // public by design (ships in the site bundle)
const RUN = Date.now().toString(36)
const mkAcc = (who) => ({ email: (process.env.TEST_EMAIL_BASE || 'your.name@gmail.com').replace('@', `+day9live${RUN}${who}@`), password: randomBytes(16).toString('hex'), who })
const A = mkAcc('a'), B = mkAcc('b')
const results = []
const ok = (m) => { results.push(['PASS', m]); console.log('PASS', m) }
const fail = (m, e) => { results.push(['FAIL', m]); console.log('FAIL', m, '-', String(e?.message ?? e).split('\n')[0]) }
const step = async (name, fn) => { try { await fn(); ok(name) } catch (e) { fail(name, e) } }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newPage = async () => (await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage())
const heading = (p) => p.getByRole('heading', { name: 'تماريني' })
const goTab = (p, name) => p.getByRole('button', { name, exact: true }).first().click()

async function signup(page, acc) {
  await page.goto(base)
  await page.getByRole('button', { name: 'جديد؟ سوّي حساب' }).click()
  await page.getByLabel('الإيميل', { exact: true }).fill(acc.email)
  await page.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await page.getByRole('button', { name: 'سجّل', exact: true }).click()
  await heading(page).waitFor({ timeout: 20000 })
}
async function login(page, acc) {
  await page.getByLabel('الإيميل', { exact: true }).fill(acc.email)
  await page.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await page.getByRole('button', { name: 'دخول', exact: true }).click()
  await heading(page).waitFor({ timeout: 20000 })
}
async function addWorkout(page, name, sets, reps, weight) {
  await page.getByLabel('التمرين', { exact: true }).fill(name)
  await page.getByLabel('السيتات', { exact: true }).fill(sets)
  await page.getByLabel('الريبات', { exact: true }).fill(reps)
  await page.getByLabel('الوزن (كجم)', { exact: true }).fill(weight)
  await page.getByRole('button', { name: 'أضف تمرين', exact: true }).click()
  await page.locator('li', { hasText: name }).first().waitFor()
}
const client = () => createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })

const pageA = await newPage()
let clientA, clientB, aWorkoutIds = [], aBookingId

// ---- 1-2: signup, session, logout, login ----
await step('A: signup through the live form lands on the workouts page', () => signup(pageA, A))
await step('A: session persists after refresh', async () => { await pageA.reload(); await heading(pageA).waitFor() })
await step('A: logout returns to the login screen', async () => { await pageA.getByRole('button', { name: 'خروج', exact: true }).click(); await pageA.getByRole('button', { name: 'دخول', exact: true }).waitFor() })
await step('A: still logged out after refresh (private data not shown)', async () => { await pageA.reload(); await pageA.getByRole('button', { name: 'دخول', exact: true }).waitFor(); assert.equal(await heading(pageA).count(), 0) })
await step('A: wrong password shows an Arabic error', async () => {
  await pageA.getByLabel('الإيميل', { exact: true }).fill(A.email); await pageA.getByLabel('الرقم السري', { exact: true }).fill('wrong-password-123')
  await pageA.getByRole('button', { name: 'دخول', exact: true }).click()
  await pageA.getByRole('alert').filter({ hasText: 'مب صحيح' }).waitFor()
})
await step('A: login with correct credentials works', async () => { await pageA.reload(); await login(pageA, A) })

// ---- 3: workouts ----
await step('A: three workouts created and still listed after refresh', async () => {
  await addWorkout(pageA, 'Day9 Bench', '3', '8', '60'); await addWorkout(pageA, 'Day9 Squat', '4', '6', '100'); await addWorkout(pageA, 'Day9 Row', '3', '10', '45')
  await pageA.reload(); await heading(pageA).waitFor()
  for (const n of ['Day9 Bench', 'Day9 Squat', 'Day9 Row']) await pageA.locator('li', { hasText: n }).first().waitFor()
})
await step('A: REST session sees exactly its 3 workouts', async () => {
  clientA = client(); const { error } = await clientA.auth.signInWithPassword({ email: A.email, password: A.password }); assert.ifError(error)
  const { data } = await clientA.from('workouts').select('id,user_id'); assert.equal(data.length, 3); aWorkoutIds = data.map((r) => r.id)
})

// ---- 4-5: Account B ----
const pageB = await newPage()
await step('B: signup works (second account)', () => signup(pageB, B))
await step("B: UI shows none of A's workouts", async () => { for (const n of ['Day9 Bench', 'Day9 Squat', 'Day9 Row']) assert.equal(await pageB.locator('li', { hasText: n }).count(), 0) })
await step("B: cannot read A's workouts by id (REST)", async () => {
  clientB = client(); const { error } = await clientB.auth.signInWithPassword({ email: B.email, password: B.password }); assert.ifError(error)
  const { data } = await clientB.from('workouts').select('*').in('id', aWorkoutIds); assert.equal(data.length, 0)
})
await step("B: cannot delete A's workouts (0 rows affected) and A still has all 3", async () => {
  const del = await clientB.from('workouts').delete().in('id', aWorkoutIds).select(); assert.equal((del.data ?? []).length, 0)
  const { data } = await clientA.from('workouts').select('id'); assert.equal(data.length, 3)
})
await step("B: forged user_id insert is rejected", async () => {
  const { data: me } = await clientA.auth.getUser()
  const { error } = await clientB.from('workouts').insert({ user_id: me.user.id, exercise: 'forged', sets: 1, reps: 1, weight: 1 }); assert.ok(error)
})

// ---- 6-8: profile ----
await step('A: profile saved with name, date of birth, height, weight and shows success + computed age', async () => {
  await goTab(pageA, 'حسابي')
  await pageA.getByLabel('الاسم الكامل').fill('Day9 Test User')
  await pageA.getByLabel('تاريخ الميلاد (اختياري)').fill('1995-05-05')
  await pageA.getByLabel('الطول (سم) (اختياري)').fill('175.5')
  await pageA.getByLabel('الوزن (كجم) (اختياري)').fill('80.5')
  await pageA.getByRole('button', { name: 'احفظ التغييرات' }).click()
  await pageA.getByText('تم حفظ بياناتك بنجاح').waitFor()
  const age = new Date().getFullYear() - 1995 - ((new Date().getMonth() + 1 < 5 || (new Date().getMonth() + 1 === 5 && new Date().getDate() < 5)) ? 1 : 0)
  await pageA.getByText(`العمر: ${age} سنة`).waitFor()
})
const checkProfile = async (p) => {
  await goTab(p, 'حسابي')
  await p.getByLabel('الاسم الكامل').waitFor()
  await p.waitForFunction(() => document.querySelector('input[maxlength="80"]')?.value === 'Day9 Test User')
  assert.equal(await p.getByLabel('تاريخ الميلاد (اختياري)').inputValue(), '1995-05-05')
  assert.equal(Number(await p.getByLabel('الطول (سم) (اختياري)').inputValue()), 175.5)
  assert.equal(Number(await p.getByLabel('الوزن (كجم) (اختياري)').inputValue()), 80.5)
}
await step('A: all profile fields persist after refresh', async () => { await pageA.reload(); await heading(pageA).waitFor(); await checkProfile(pageA) })
await step('A: profile loads in a fresh browser session after a new login', async () => {
  const fresh = await newPage(); await fresh.goto(base); await login(fresh, A); await checkProfile(fresh)
})
await step("B: sees an empty profile, not A's", async () => { await goTab(pageB, 'حسابي'); await pageB.getByLabel('الاسم الكامل').waitFor(); await pageB.waitForTimeout(800); assert.equal(await pageB.getByLabel('الاسم الكامل').inputValue(), '') })
await step('profile validation: height 10 cm is rejected (browser and database)', async () => {
  const { error } = await clientA.from('profiles').update({ height_cm: 10 }).eq('user_id', (await clientA.auth.getUser()).data.user.id); assert.ok(error)
})

// ---- 9-12: bookings ----
await step('A: demo booking created through the UI, confirmation shows server price and no Pay button', async () => {
  await goTab(pageA, 'احجز جلسة')
  await pageA.getByText('خدمات تجريبية للعرض فقط').waitFor()
  await pageA.getByText('جلسة تدريب شخصي (تجريبي)').click()
  const d = new Date(Date.now() + 5 * 86400000); const pad = (n) => String(n).padStart(2, '0')
  await pageA.getByLabel(/الموعد المطلوب/).fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:00`)
  await pageA.getByRole('button', { name: 'ثبّت الحجز التجريبي' }).click()
  await pageA.getByRole('heading', { name: 'تم تثبيت الحجز التجريبي' }).waitFor()
  await pageA.getByText('12.000 د.ك').waitFor()
  assert.equal(await pageA.getByRole('button', { name: /ادفع|دفع/ }).count(), 0)
})
await step('A: booking persists after refresh and has pending payment status', async () => {
  await pageA.reload(); await goTab(pageA, 'احجز جلسة'); await pageA.locator('.bookings li', { hasText: 'جلسة تدريب شخصي' }).first().waitFor()
  const { data } = await clientA.from('bookings').select('*'); assert.equal(data.length, 1); assert.equal(data[0].payment_status, 'pending'); assert.equal(Number(data[0].price_kwd), 12); aBookingId = data[0].id
})
await step("B: cannot read A's booking", async () => { const { data } = await clientB.from('bookings').select('*').eq('id', aBookingId); assert.equal(data.length, 0) })
await step("B: cannot modify A's booking status (0 rows) or payment_status (rejected)", async () => {
  const u1 = await clientB.from('bookings').update({ booking_status: 'confirmed' }).eq('id', aBookingId).select(); assert.equal((u1.data ?? []).length, 0)
  const u2 = await clientB.from('bookings').update({ payment_status: 'paid' }).eq('id', aBookingId).select(); assert.ok(u2.error)
})
await step('A: customer cannot set payment_status or price, and cannot confirm own booking', async () => {
  const u1 = await clientA.from('bookings').update({ payment_status: 'paid' }).eq('id', aBookingId).select(); assert.ok(u1.error)
  const i1 = await clientA.from('bookings').insert({ service_id: (await clientA.from('services').select('id').limit(1)).data[0].id, scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), payment_status: 'paid' }); assert.ok(i1.error)
  const i2 = await clientA.from('bookings').insert({ service_id: (await clientA.from('services').select('id').limit(1)).data[0].id, scheduled_at: new Date(Date.now() + 3 * 86400000).toISOString(), price_kwd: 0 }); assert.ok(i2.error)
  const u3 = await clientA.from('bookings').update({ booking_status: 'confirmed' }).eq('id', aBookingId).select(); assert.equal((u3.data ?? []).length, 0)
})
await step('A and B (non-admins): no admin dashboard section; is_admin() is false', async () => {
  assert.equal(await pageA.getByLabel('لوحة الإدارة').count(), 0)
  await goTab(pageB, 'احجز جلسة'); await pageB.getByText('خدمات تجريبية للعرض فقط').waitFor(); assert.equal(await pageB.getByLabel('لوحة الإدارة').count(), 0)
  assert.equal((await clientA.rpc('is_admin')).data, false); assert.equal((await clientB.rpc('is_admin')).data, false)
})
await step('logged-out client cannot read bookings, profiles, services or admins', async () => {
  const anon = client()
  for (const t of ['bookings', 'profiles', 'services', 'admins']) { const r = await anon.from(t).select('*'); assert.ok(r.error || (r.data ?? []).length === 0, t) }
})

await browser.close()
const failed = results.filter(([s]) => s === 'FAIL').length
console.log(`\nRUN ${RUN}: ${results.length - failed} passed, ${failed} failed`)
console.log("Cleanup (run in Supabase SQL editor; deletes ONLY this run's two accounts and, by cascade, their rows):")
console.log(`delete from auth.users where email in ('${A.email}', '${B.email}');`)
process.exit(failed ? 1 : 0)
