// Live end-to-end test of the Supabase-backed Food Diary (real site, real Supabase, no mocks).
// Creates two throwaway accounts through the signup form (generated passwords, never printed).
// Usage: TEST_EMAIL_BASE=you@example.com node tests/food-diary-live.e2e.mjs [baseUrl]
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const base = process.argv[2] || 'https://gym-tracker-afhaasan.vercel.app'
const SUPABASE_URL = 'https://zbqdmebrxqshcsozamwg.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ' // public by design
const RUN = Date.now().toString(36)
const mk = (w) => ({ email: (process.env.TEST_EMAIL_BASE || 'your.name@gmail.com').replace('@', `+food${RUN}${w}@`), password: randomBytes(16).toString('hex') })
const A = mk('a'), B = mk('b')
const results = []
const step = async (name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', name) } catch (e) { results.push('FAIL'); console.log('FAIL', name, '-', String(e?.message ?? e).split('\n')[0]) } }
const today = new Date(); const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const TODAY = ymd(today), YESTERDAY = ymd(new Date(today.getTime() - 86400000))
const LEGACY = {
  'athar-meals': [
    { id: randomUUID(), name: 'Legacy Rice', serving: '1 cup', calories: 200, protein: 4, carbs: 44, fat: 0.4, date: TODAY },
    { id: randomUUID(), name: 'Legacy Eggs', serving: '2 eggs', calories: 140, protein: 12, carbs: 1, fat: 10, date: YESTERDAY },
  ],
  'athar-foods': [{ id: randomUUID(), name: 'Legacy Shake', serving: '300 ml', calories: 150, protein: 20, carbs: 10, fat: 3 }],
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newCtx = async (seed) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  if (seed) await ctx.addInitScript((data) => { for (const [k, v] of Object.entries(data)) if (localStorage.getItem(k) === null) localStorage.setItem(k, JSON.stringify(v)) }, LEGACY)
  return ctx
}
const heading = (p) => p.getByRole('heading', { name: 'تماريني' })
const goFood = async (p) => { await p.getByRole('button', { name: 'الغذاء', exact: true }).first().click(); await p.locator('.food-item').first().waitFor({ timeout: 20000 }) }
async function signup(p, acc) {
  await p.goto(base); await p.getByRole('button', { name: 'جديد؟ سوّي حساب' }).click()
  await p.getByLabel('الإيميل', { exact: true }).fill(acc.email); await p.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await p.getByRole('button', { name: 'سجّل', exact: true }).click(); await heading(p).waitFor({ timeout: 20000 })
}
async function login(p, acc) {
  await p.getByLabel('الإيميل', { exact: true }).fill(acc.email); await p.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await p.getByRole('button', { name: 'دخول', exact: true }).click(); await heading(p).waitFor({ timeout: 20000 })
}
const client = async (acc) => { const c = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword(acc); assert.ifError(error); return c }
const rows = async (c, t) => (await c.from(t).select('*')).data
const meals = (p) => p.locator('.food-meal-row')
const OLD_NOTICE = 'يبقى محفوظاً على هذا الجهاز فقط'

const ctx1 = await newCtx(true); const p1 = await ctx1.newPage()
let cA, cB, libName
await step('A: signup; Food tab shows the accurate "saved to your account" text and not the old device-only warning', async () => {
  await signup(p1, A); cA = await client(A); await goFood(p1)
  await p1.getByText('محفوظ بأمان في حسابك').waitFor(); assert.equal(await p1.getByText(OLD_NOTICE).count(), 0); assert.equal(await p1.getByText('لا يُرسل إلى Supabase').count(), 0)
})
await step('legacy localStorage records are offered for import (nothing is imported without consent)', async () => {
  await p1.getByRole('region', { name: 'نقل سجل الغذاء القديم' }).waitFor(); assert.equal((await rows(cA, 'food_entries')).length, 0)
  assert.ok(await p1.evaluate(() => JSON.parse(localStorage.getItem('athar-meals')).length === 2))
})
await step('import: 2 meals + 1 custom food copied to the account, local data kept', async () => {
  await p1.getByRole('button', { name: 'انقل السجل لحسابي' }).click(); await p1.getByText(/نقلنا 2 وجبة/).waitFor({ timeout: 20000 })
  const e = await rows(cA, 'food_entries'), f = await rows(cA, 'custom_foods')
  assert.equal(e.length, 2); assert.equal(f.length, 1); assert.ok(e.every((r) => r.legacy_id && r.user_id))
  assert.equal(e.find((r) => r.name === 'Legacy Rice').entry_date, TODAY); assert.equal(Number(e.find((r) => r.name === 'Legacy Rice').calories), 200)
  assert.ok(await p1.evaluate(() => JSON.parse(localStorage.getItem('athar-meals')).length === 2))
})
await step('importing the same legacy data again creates NO duplicates', async () => {
  await p1.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('gt-food-import:')) localStorage.removeItem(k) })
  await p1.reload(); await heading(p1).waitFor(); await goFood(p1)
  await p1.getByRole('button', { name: 'انقل السجل لحسابي' }).click(); await p1.getByText(/نقلنا 2 وجبة/).waitFor({ timeout: 20000 })
  assert.equal((await rows(cA, 'food_entries')).length, 2); assert.equal((await rows(cA, 'custom_foods')).length, 1)
})
await step('after refresh: no import prompt and the imported meal is still listed', async () => {
  await p1.reload(); await heading(p1).waitFor(); await goFood(p1); await meals(p1).first().waitFor()
  assert.equal(await p1.getByRole('region', { name: 'نقل سجل الغذاء القديم' }).count(), 0); await p1.locator('.food-meal-row', { hasText: 'Legacy Rice' }).waitFor()
})
await step("food search still works on the existing food database (and finds the migrated custom food in 'my foods')", async () => {
  const n = await p1.locator('.food-item').count(); assert.ok(n > 3)
  await p1.getByLabel('ابحث عن طعام أو حصة').fill('zzzzqqq'); await p1.waitForTimeout(400); assert.ok((await p1.locator('.food-item').count()) < n)
  await p1.getByLabel('ابحث عن طعام أو حصة').fill(''); await p1.getByRole('button', { name: /أطعمتي المخصصة/ }).click(); await p1.locator('.food-item', { hasText: 'Legacy Shake' }).waitFor()
  await p1.getByRole('button', { name: /جميع الأغذية/ }).click()
})
await step('add a library food through the UI: saved with the user id, survives refresh', async () => {
  const before = (await rows(cA, 'food_entries')).length
  const item = p1.locator('.food-item').first(); libName = (await item.locator('strong').first().innerText()).trim()
  await item.locator('.food-add-button').click(); await p1.waitForTimeout(1500)
  const r = await rows(cA, 'food_entries'); assert.equal(r.length, before + 1)
  const row = r.find((x) => x.name === libName); assert.ok(row); assert.equal(row.entry_date, TODAY); assert.ok(Number(row.calories) > 0)
  const uid = (await cA.auth.getUser()).data.user.id; assert.equal(row.user_id, uid)
  await p1.reload(); await heading(p1).waitFor(); await goFood(p1); await p1.locator('.food-meal-row', { hasText: libName }).first().waitFor()
})
await step('create a custom food through the UI: custom food + meal saved with calories and macros', async () => {
  await p1.getByRole('button', { name: /طعام مخصص/ }).click()
  await p1.getByLabel('الاسم', { exact: true }).fill('Day Test Bowl'); await p1.getByLabel('الحصة', { exact: true }).fill('1 bowl')
  await p1.getByLabel('السعرات', { exact: true }).fill('321'); await p1.getByLabel('بروتين (غ)').fill('12.5'); await p1.getByLabel('كربوهيدرات (غ)').fill('40'); await p1.getByLabel('دهون (غ)').fill('9')
  await p1.getByRole('button', { name: /حفظ وإضافة للتاريخ المختار/ }).click(); await p1.locator('.food-meal-row', { hasText: 'Day Test Bowl' }).waitFor(); await p1.waitForTimeout(1200)
  const f = (await rows(cA, 'custom_foods')).find((x) => x.name === 'Day Test Bowl'), m = (await rows(cA, 'food_entries')).find((x) => x.name === 'Day Test Bowl')
  assert.ok(f && m); assert.equal(Number(f.calories), 321); assert.equal(Number(f.protein), 12.5); assert.equal(Number(m.carbs), 40); assert.equal(Number(m.fat), 9)
})

// ---- cross-device sync ----
const ctx2 = await newCtx(false); const p2 = await ctx2.newPage()
await step('second device (fresh browser, no local data): same account shows the same meals and custom foods', async () => {
  await p2.goto(base); await login(p2, A); await goFood(p2)
  for (const n of ['Legacy Rice', libName, 'Day Test Bowl']) await p2.locator('.food-meal-row', { hasText: n }).first().waitFor({ timeout: 15000 })
  assert.equal(await p2.getByRole('region', { name: 'نقل سجل الغذاء القديم' }).count(), 0)
  await p2.getByRole('button', { name: /أطعمتي المخصصة/ }).click(); await p2.locator('.food-item', { hasText: 'Day Test Bowl' }).waitFor(); await p2.getByRole('button', { name: /جميع الأغذية/ }).click()
})
await step('a meal added on device 2 appears on device 1 without a manual reload (refetch on focus)', async () => {
  await p2.locator('.food-item').nth(1).locator('.food-add-button').click(); await p2.waitForTimeout(1500)
  const n1 = await meals(p1).count()
  await p1.evaluate(() => window.dispatchEvent(new Event('focus'))); await p1.waitForFunction((n) => document.querySelectorAll('.food-meal-row').length > n, n1, { timeout: 15000 })
})
await step('a delete on device 1 disappears on device 2 after refresh', async () => {
  await p1.locator('.food-meal-row', { hasText: 'Day Test Bowl' }).getByRole('button').click(); await p1.waitForTimeout(1500)
  assert.equal((await rows(cA, 'food_entries')).filter((x) => x.name === 'Day Test Bowl').length, 0)
  await p2.reload(); await heading(p2).waitFor(); await goFood(p2); await p2.locator('.food-meal-row').first().waitFor(); assert.equal(await p2.locator('.food-meal-row', { hasText: 'Day Test Bowl' }).count(), 0)
})

// ---- offline ----
await step('offline: saving fails with a clear Arabic message, nothing appears saved, nothing reaches the database', async () => {
  const before = (await rows(cA, 'food_entries')).length, shown = await meals(p1).count()
  await ctx1.setOffline(true); await p1.locator('.food-item').nth(2).locator('.food-add-button').click()
  await p1.getByRole('alert').filter({ hasText: 'ما قدرنا نتصل' }).waitFor({ timeout: 15000 })
  await p1.waitForFunction((n) => document.querySelectorAll('.food-meal-row').length === n, shown, { timeout: 5000 })
  await ctx1.setOffline(false); assert.equal((await rows(cA, 'food_entries')).length, before)
  await p1.getByRole('button', { name: 'تمام' }).click()
})

// ---- isolation ----
const ctx3 = await newCtx(false); const p3 = await ctx3.newPage()
await step('account isolation: B signs up and sees none of A\'s food records', async () => {
  await signup(p3, B); cB = await client(B); await goFood(p3); await p3.waitForTimeout(1200)
  assert.equal(await meals(p3).count(), 0); assert.equal((await rows(cB, 'food_entries')).length, 0); assert.equal((await rows(cB, 'custom_foods')).length, 0)
})
await step("B cannot read, edit or delete A's records by id; A's data is unchanged", async () => {
  const aEntries = await rows(cA, 'food_entries'), aFoods = await rows(cA, 'custom_foods'); const e = aEntries[0], f = aFoods[0]
  assert.equal((await cB.from('food_entries').select('*').eq('id', e.id)).data.length, 0)
  assert.equal(((await cB.from('food_entries').update({ calories: 1 }).eq('id', e.id).select()).data ?? []).length, 0)
  assert.equal(((await cB.from('food_entries').delete().eq('id', e.id).select()).data ?? []).length, 0)
  assert.equal(((await cB.from('custom_foods').update({ name: 'hacked' }).eq('id', f.id).select()).data ?? []).length, 0)
  assert.equal(((await cB.from('custom_foods').delete().eq('id', f.id).select()).data ?? []).length, 0)
  const after = await rows(cA, 'food_entries'); assert.equal(after.length, aEntries.length); assert.equal(Number(after.find((x) => x.id === e.id).calories), Number(e.calories))
})
await step("B cannot forge user_id on insert, move a row to another user, or insert invalid values", async () => {
  const aId = (await cA.auth.getUser()).data.user.id
  assert.ok((await cB.from('food_entries').insert({ user_id: aId, entry_date: TODAY, name: 'forged' })).error)
  assert.ok((await cB.from('custom_foods').insert({ user_id: aId, name: 'forged', serving: '1' })).error)
  const mine = await cB.from('food_entries').insert({ entry_date: TODAY, name: 'B own', calories: 10 }).select().single(); assert.ifError(mine.error); assert.notEqual(mine.data.user_id, aId)
  assert.ok((await cB.from('food_entries').update({ user_id: aId }).eq('id', mine.data.id)).error)
  assert.ok((await cB.from('food_entries').insert({ entry_date: TODAY, name: 'neg', calories: -5 })).error)
  assert.ok((await cB.from('food_entries').insert({ entry_date: TODAY, name: 'huge', calories: 999999 })).error)
  assert.ok((await cB.from('food_entries').insert({ entry_date: 'not-a-date', name: 'bad date' })).error)
})
await step('logged-out client reads and writes nothing in the food tables', async () => {
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { persistSession: false } })
  for (const t of ['food_entries', 'custom_foods']) { const r = await anon.from(t).select('*'); assert.ok(r.error || (r.data ?? []).length === 0, t); assert.ok((await anon.from(t).insert({ name: 'x', serving: '1', entry_date: TODAY })).error) }
})
await step('shared device: another account on the same browser is OFFERED the old local records (consent), can decline, and nothing is imported', async () => {
  await p1.getByRole('button', { name: 'خروج', exact: true }).click(); await p1.getByRole('button', { name: 'دخول', exact: true }).waitFor()
  await login(p1, B); await goFood(p1); await p1.getByRole('region', { name: 'نقل سجل الغذاء القديم' }).waitFor()
  await p1.getByRole('button', { name: 'لا، تجاهله' }).click(); await p1.waitForTimeout(800)
  assert.equal(await p1.getByRole('region', { name: 'نقل سجل الغذاء القديم' }).count(), 0)
  assert.ok(!(await rows(cB, 'food_entries')).some((r) => /Legacy/.test(r.name)))
})
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\nRUN ${RUN}: ${n('PASS')} passed, ${n('FAIL')} failed`)
process.exit(n('FAIL') ? 1 : 0)
