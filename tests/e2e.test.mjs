// Full end-to-end test on a real site + real Supabase, using a brand-new account created through the signup form.
// Usage: node --env-file=.env tests/e2e.test.mjs <baseUrl> <desktop|mobile> <noai|ai>
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const [base, mode = 'desktop', ai = 'noai'] = process.argv.slice(2)
const viewport = mode === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 800 }
const email = (process.env.TEST_EMAIL_BASE || 'your.name@gmail.com').replace('@', `+gtui${mode}${Date.now()}@`)
const password = randomBytes(12).toString('hex')
let n = 0
const ok = (m) => console.log(`PASS ${++n}. [${mode}] ${m}`)

const dir = join(tmpdir(), 'gt-e2e'); mkdirSync(dir, { recursive: true })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const png2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8Dwn4EIwDiqENQAAC6MBHnC1U0wAAAAAElFTkSuQmCC', 'base64')
const f1 = join(dir, 'one.png'), f2 = join(dir, 'two.png'), txt = join(dir, 'note.txt'), big = join(dir, 'big.png')
writeFileSync(f1, png); writeFileSync(f2, png2); writeFileSync(txt, 'not an image'); writeFileSync(big, Buffer.alloc(5 * 1024 * 1024 + 2048, 1))

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const page = await (await browser.newContext({ viewport })).newPage()
const shot = (name) => page.screenshot({ path: `docs/screenshots/e2e-${mode}-${name}.png`, fullPage: true })
const heading = () => page.getByRole('heading', { name: 'تماريني' })
const add = async (name, sets = '3', reps = '8', weight = '60') => {
  await page.getByLabel('التمرين', { exact: true }).fill(name); await page.getByLabel('السيتات', { exact: true }).fill(sets); await page.getByLabel('الريبات', { exact: true }).fill(reps); await page.getByLabel('الوزن (كجم)', { exact: true }).fill(weight)
}

// --- Signup through the real UI (no email confirmation needed, no seeded users) ---
await page.goto(base)
await page.getByRole('button', { name: 'جديد؟ سوّي حساب' }).click()
await page.getByLabel('الإيميل', { exact: true }).fill(email); await page.getByLabel('الرقم السري', { exact: true }).fill(password)
await page.getByRole('button', { name: 'سجّل', exact: true }).click()
await heading().waitFor({ timeout: 20000 }); ok('NEW ACCOUNT signed up through the live signup form and landed on the workouts page')
await shot('1-after-signup')
await page.reload(); await heading().waitFor(); ok('session persists after page reload')
await page.getByRole('button', { name: 'خروج', exact: true }).click(); await page.getByRole('button', { name: 'دخول', exact: true }).waitFor(); ok('logout returns to login screen')
await page.reload(); await page.getByRole('button', { name: 'دخول', exact: true }).waitFor(); ok('still logged out after reload')
await page.getByLabel('الإيميل', { exact: true }).fill(email); await page.getByLabel('الرقم السري', { exact: true }).fill(password); await page.getByRole('button', { name: 'دخول', exact: true }).click()
await heading().waitFor(); ok('login with the new account works')

// --- Workout WITHOUT an image: clean placeholder ---
await add('Plain pushups', '2', '15', '0'); await page.getByRole('button', { name: 'أضف تمرين', exact: true }).click()
const row1 = page.locator('li', { hasText: 'Plain pushups' }); await row1.waitFor()
assert.equal(await row1.getByRole('img', { name: 'ما في صورة' }).count(), 1); ok('workout without image saved; shows "No photo" placeholder')
await shot('2-no-photo')

// --- Validation: images only, max 5 MB ---
await page.getByLabel('ملف صورة التمرين').setInputFiles(txt)
await page.getByRole('alert').filter({ hasText: 'اختر صورة' }).waitFor(); ok('non-image file rejected with a clear message')
await page.getByLabel('ملف صورة التمرين').setInputFiles(big)
await page.getByRole('alert').filter({ hasText: '5 ميغا' }).waitFor(); ok('image over 5 MB rejected with a clear message')
assert.equal(await page.getByAltText('معاينة صورة التمرين').count(), 0); ok('no preview shown for rejected files')

// --- Preview, replace, upload ---
await page.getByLabel('ملف صورة التمرين').setInputFiles(f1)
const prev = page.getByAltText('معاينة صورة التمرين'); await prev.waitFor()
const src1 = await prev.getAttribute('src'); assert.ok(src1.startsWith('blob:')); ok('preview shown before upload')
assert.equal(await page.getByRole('alert').filter({ hasText: '5 ميغا' }).count(), 0); ok('validation error cleared after a valid choice')
await page.getByRole('button', { name: 'غيّر الصورة' }).click().catch(() => {})
await page.getByLabel('ملف صورة التمرين').setInputFiles(f2)
await page.waitForFunction((s) => document.querySelector('img[alt="معاينة صورة التمرين"]')?.getAttribute('src') !== s, src1)
ok('selected photo replaced (preview changed)')
await shot('3-preview')
await add('Photo curls', '3', '12', '15'); await page.getByRole('button', { name: 'أضف تمرين', exact: true }).click()
const row2 = page.locator('li', { hasText: 'Photo curls' }); await row2.waitFor()
const img = row2.getByAltText('صورة Photo curls'); await img.waitFor()
await page.waitForFunction(() => { const i = [...document.images].find((x) => x.alt === 'صورة Photo curls'); return i && i.complete && i.naturalWidth > 0 })
ok('workout saved with photo; image loads from Supabase Storage signed URL')
await page.reload(); await page.locator('li', { hasText: 'Photo curls' }).getByAltText('صورة Photo curls').waitFor(); ok('photo still displays after reload')
await shot('4-history')

// --- AI features ---
// ai=mock: ONLY the two AI responses are stubbed in the browser (used when the free OpenRouter quota is exhausted).
// Saving, Storage, auth and the rate-limit step below still hit the real Supabase project.
const mock = ai === 'mock'
if (mock && process.env.ALLOW_MOCK_AI !== '1') { console.error('Refusing ai=mock without ALLOW_MOCK_AI=1. Mocks exist only inside this test browser and must never be used as proof of real AI.'); process.exit(2) }
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' }
if (mock) {
  await page.route('**/functions/v1/ai-summary', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ summary: 'MOCK: 4 sets of 6 squats at 100 kg.' }) }))
  await page.route('**/functions/v1/ai-analysis', (r) => r.request().method() === 'OPTIONS'
    ? r.fulfill({ status: 204, headers: cors })
    : r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ analysis: 'MOCK: Well covered: quads. Needs more attention: back.', workouts_analyzed: 1 }) }))
  console.log('   (AI responses are MOCKED in this run; everything else is real)')
}
await add('Squat', '4', '6', '100')
await page.getByRole('button', { name: 'اقترح ملخص بالذكاء الاصطناعي' }).click()
if (ai === 'ai' || mock) {
  await page.waitForFunction(() => document.querySelector('textarea')?.value.length > 5, null, { timeout: 60000 })
  const generated = await page.locator('textarea').inputValue(); if (ai === 'ai') assert.ok(!/^MOCK/.test(generated), 'real mode must never show mock text'); ok(`AI summary generated: "${generated.slice(0, 80)}"`)
  const edited = generated + ' (edited by me)'; await page.locator('textarea').fill(edited)
  await page.getByRole('button', { name: 'أضف تمرين', exact: true }).click()
  await page.locator('li', { hasText: 'Squat' }).getByText('(edited by me)').waitFor(); ok('user-edited AI summary saved and shown in history')
  await shot('5-ai-summary')
  await page.getByRole('button', { name: 'حلّل أسبوعي' }).click()
  await page.getByLabel('تحليل الأسبوع').waitFor({ timeout: 60000 })
  const a = await page.getByLabel('تحليل الأسبوع').innerText(); ok(`7-day analysis returned: "${a.slice(0, 100).replace(/\n/g, ' ')}..."`)
  await shot('6-analysis')
} else {
  await page.getByRole('status').or(page.getByRole('alert')).first().waitFor(); console.log('   (AI skipped: noai mode)')
}

// --- Rate limit through the UI (6th AI request in a minute) ---
if (ai !== 'noai') {
  if (mock) { await page.unroute('**/functions/v1/ai-summary'); await page.unroute('**/functions/v1/ai-analysis') } // 6th request hits the REAL server limiter
  else await page.waitForTimeout(62000) // fresh window
  // Free models can be slow, so six sequential UI clicks may outlast the 60 s window. Burst requests 1-5
  // directly (same account, same shared limiter), then make the 6th request through the real UI.
  const burst = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
  await burst.auth.signInWithPassword({ email, password })
  const codes = await Promise.all([1, 2, 3, 4, 5].map((i) => burst.functions.invoke(i % 2 ? 'ai-summary' : 'ai-analysis', { body: { exercise: 'Row', sets: 3, reps: 10, weight: 40 } }).then((r) => (r.error ? r.error.context.status : 200))))
  console.log('   burst statuses (requests 1-5):', codes.join(', '))
  assert.ok(codes.every((c) => c !== 429), 'requests 1-5 must not be limited')
  await page.getByRole('button', { name: 'حلّل أسبوعي' }).click()
  const limited = page.getByRole('alert').filter({ hasText: 'وصلت الحد الأقصى' }); await limited.waitFor({ timeout: 30000 })
  const last = await limited.innerText(); assert.ok(last.includes('بالدقيقة'))
  ok('6th AI request (made in the UI) shows the helpful 429 message: ' + last.slice(0, 160))
  await shot('7-rate-limit')
}

// --- Delete: row disappears AND the photo file is removed from Storage ---
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const { data: auth } = await sb.auth.signInWithPassword({ email, password })
let files = await sb.storage.from('progress-photos').list(auth.user.id); assert.equal(files.data.length, 1); ok('exactly 1 photo object exists in Storage before delete')
await page.getByRole('button', { name: 'احذف Photo curls' }).click()
await page.locator('li', { hasText: 'Photo curls' }).waitFor({ state: 'detached' })
await page.waitForTimeout(1500)
files = await sb.storage.from('progress-photos').list(auth.user.id); assert.equal(files.data.length, 0); ok('deleting the workout also removed its photo from Storage')
await page.reload(); await heading().waitFor(); assert.equal(await page.locator('li', { hasText: 'Photo curls' }).count(), 0); ok('deletion persists after reload')
// overflow check on small screens
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth); assert.equal(overflow, false); ok('no horizontal overflow at this viewport')
await browser.close()
console.log(`\nE2E (${mode}, ai=${ai}) PASSED — account used: ${email.replace(/\+.*@/, '+…@')}`)
