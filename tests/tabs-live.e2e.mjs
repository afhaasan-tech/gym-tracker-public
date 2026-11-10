// Live smoke test of the content tabs (exercise library, food diary, 3D anatomy) on the deployed site, desktop and mobile.
// Signs up one throwaway account through the form (generated password, never printed).
// Usage: TEST_EMAIL_BASE=you@example.com node tests/tabs-live.e2e.mjs [baseUrl]
import { chromium } from 'playwright-core'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'

const base = process.argv[2] || 'https://gym-tracker-afhaasan.vercel.app'
const RUN = Date.now().toString(36)
const mail = (process.env.TEST_EMAIL_BASE || 'your.name@gmail.com').replace('@', `+tabs${RUN}@`)
const password = randomBytes(16).toString('hex')
const results = []
const step = async (name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', name) } catch (e) { results.push('FAIL'); console.log('FAIL', name, '-', String(e?.message ?? e).split('\n')[0]) } }

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })

for (const [mode, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, isMobile: mode === 'mobile' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message)))
  const glb = []
  page.on('response', (r) => { if (r.url().includes('.glb')) glb.push(r.status()) })
  const tab = (name) => page.getByRole('button', { name, exact: true }).first().click()

  await step(`[${mode}] signup/login reaches the app`, async () => {
    await page.goto(base)
    if (mode === 'desktop') {
      await page.getByRole('button', { name: 'جديد؟ سوّي حساب' }).click()
      await page.getByLabel('الإيميل', { exact: true }).fill(mail); await page.getByLabel('الرقم السري', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'سجّل', exact: true }).click()
    } else {
      await page.getByLabel('الإيميل', { exact: true }).fill(mail); await page.getByLabel('الرقم السري', { exact: true }).fill(password)
      await page.getByRole('button', { name: 'دخول', exact: true }).click()
    }
    await page.getByRole('heading', { name: 'تماريني' }).waitFor({ timeout: 20000 })
  })
  await step(`[${mode}] exercise library: cards render, search filters, details dialog opens`, async () => {
    await tab(mode === 'mobile' ? 'المكتبة' : 'مكتبة التمارين'); await page.getByRole('heading', { name: 'مكتبة التمارين' }).waitFor()
    const cards = page.locator('.exercise-grid article, .exercise-grid > *'); await cards.first().waitFor(); const n = await cards.count(); assert.ok(n > 1, `cards=${n}`)
    await page.getByPlaceholder(/ابحث باسم التمرين/).fill('zzzzqqq'); await page.waitForTimeout(400); assert.ok((await page.locator('.exercise-grid article').count()) < n)
    await page.getByPlaceholder(/ابحث باسم التمرين/).fill('')
    await page.locator('.exercise-grid article button, .exercise-grid article').first().click(); await page.getByRole('dialog').waitFor(); await page.getByRole('button', { name: 'إغلاق التفاصيل' }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' })
  })
  await step(`[${mode}] food diary: foods list renders and search filters`, async () => {
    await tab(mode === 'mobile' ? 'الغذاء' : 'الغذاء'); await page.locator('.food-item').first().waitFor({ timeout: 15000 })
    const n = await page.locator('.food-item').count(); assert.ok(n > 3, `foods=${n}`)
    await page.getByPlaceholder(/ابحث/).first().fill('zzzzqqq'); await page.waitForTimeout(500); assert.ok((await page.locator('.food-item').count()) < n)
    await page.getByPlaceholder(/ابحث/).first().fill('')
  })
  await step(`[${mode}] 3D anatomy: viewer renders a WebGL canvas and the model file loads`, async () => {
    await tab(mode === 'mobile' ? 'التشريح' : 'التشريح 3D'); await page.getByRole('heading', { name: /التشريح/ }).first().waitFor()
    await page.locator('canvas').first().waitFor({ timeout: 25000 }); await page.waitForTimeout(2500)
    assert.ok(glb.includes(200), `glb responses: ${glb.join(',') || 'none'}`)
    const box = await page.locator('canvas').first().boundingBox(); assert.ok(box.width > 100 && box.height > 100)
  })
  await step(`[${mode}] no uncaught page errors while visiting the tabs`, async () => { assert.deepEqual(errors, []) })
  await step(`[${mode}] no horizontal overflow`, async () => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)) })
  await ctx.close()
}
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\nRUN ${RUN}: ${n('PASS')} passed, ${n('FAIL')} failed`)
process.exit(n('FAIL') ? 1 : 0)
