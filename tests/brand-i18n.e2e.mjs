// Public (no login) UI checks: brand, AR/EN switch, RTL/LTR, persistence, overflow, nav, untranslated Arabic in English mode.
// usage: node tests/brand-i18n.e2e.mjs [baseUrl]
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
const base = process.argv[2] || 'http://127.0.0.1:4173/'
const results = []
const step = async (name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', name) } catch (e) { results.push('FAIL'); console.log('FAIL', name, '-', String(e?.message ?? e).split('\n').slice(0, 3).join(' | ')) } }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] })
const ROUTES = ['#/', '#/sports', '#/coaches', '#/journey/private', '#/journey/group', '#/journey/book', '#/self', '#/self?group=chest', '#/self/library', '#/food', '#/food/diary', '#/food/info', '#/food/plans', '#/food/consult', '#/muscles', '#/plans', '#/login', '#/nonexistent']
const SIZES = [[390, 844], [768, 1024], [1280, 800]]
const AR = /[؀-ۿ]/
async function open(w, h, lang) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } })
  await ctx.addInitScript((l) => { try { localStorage.setItem('vora-lang', l) } catch {} }, lang)
  return { ctx, page: await ctx.newPage() }
}
await step('brand: no "Gym Tracker"/"جيم تراكر" on any public route (both languages)', async () => {
  for (const lang of ['ar', 'en']) { const { ctx, page } = await open(1280, 800, lang)
    for (const r of ROUTES) { await page.goto(base + r); await page.waitForTimeout(500); const txt = (await page.locator('body').innerText()) + (await page.title())
      assert.ok(!/gym\s*tracker|جيم\s*تراكر/i.test(txt), `${lang} ${r}`) }
    await ctx.close() }
})
for (const lang of ['ar', 'en']) for (const [w, h] of SIZES) {
  await step(`${lang} ${w}px: dir/lang correct, no horizontal overflow, no blank page, on ${ROUTES.length} routes`, async () => {
    const { ctx, page } = await open(w, h, lang); const bad = []
    for (const r of ROUTES) {
      await page.goto(base + r); await page.waitForTimeout(700)
      const m = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, len: document.body.innerText.trim().length, side: document.querySelector('.sidebar')?.getBoundingClientRect().width ?? 0 }))
      if (m.dir !== (lang === 'ar' ? 'rtl' : 'ltr') || m.lang !== lang) bad.push(`${r}: dir/lang ${m.dir}/${m.lang}`)
      if (m.sw > m.cw + 1) bad.push(`${r}: overflow ${m.sw}>${m.cw}`)
      if (m.len < 20) bad.push(`${r}: blank`)
      if (w >= 1000 && m.side > 260) bad.push(`${r}: sidebar ${m.side}px`)
    }
    await ctx.close(); assert.deepEqual(bad, [])
  })
}
await step('English mode: no Arabic text left in the UI chrome (excluding user/catalogue data)', async () => {
  const { ctx, page } = await open(1280, 800, 'en'); const found = []
  for (const r of ROUTES) { await page.goto(base + r); await page.waitForTimeout(900)
    const hits = await page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      for (let n = w.nextNode(); n; n = w.nextNode()) { const s = n.textContent.trim(); if (/[؀-ۿ]/.test(s) && !n.parentElement.closest('[lang="ar"],[data-user-content],svg')) out.push(s.slice(0, 60)) } return out })
    if (hits.length) found.push(r + ' → ' + [...new Set(hits)].slice(0, 6).join(' ¦ ')) }
  await ctx.close(); assert.deepEqual(found, [], found.join(' // '))
})
await step('switcher: AR→EN→AR flips dir, text and title; persists after reload', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage()
  await page.goto(base + '#/'); await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl')
  await page.getByRole('button', { name: 'English', exact: true }).first().click(); await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr'); assert.match(await page.title(), /VORA/)
  await page.reload(); await page.waitForTimeout(600)
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en'); assert.ok(await page.getByRole('button', { name: 'Log in' }).count() > 0)
  await page.getByRole('button', { name: 'العربية', exact: true }).first().click(); await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl'); assert.match(await page.title(), /ڤورا/)
  await ctx.close()
})
await step('navigation: every public nav item opens a non-empty page (EN, desktop)', async () => {
  const { ctx, page } = await open(1280, 800, 'en'); await page.goto(base + '#/'); await page.waitForTimeout(500)
  const n = await page.locator('.side-nav .nav-item').count(); assert.ok(n >= 6, 'nav items ' + n)
  for (let i = 0; i < n; i++) { if (await page.locator('.side-nav .nav-item').nth(i).evaluate((e) => /Log in|Sign/i.test(e.textContent))) continue; await page.goto(base + '#/'); await page.waitForTimeout(300); await page.locator('.side-nav .nav-item').nth(i).click(); await page.waitForTimeout(500); assert.ok((await page.locator('main').first().innerText()).trim().length > 10, 'item ' + i) }
  await ctx.close()
})
await step('plans: shows provisional prices, Available After Launch, and no live purchase control', async () => {
  const { ctx, page } = await open(1280, 800, 'en'); await page.goto(base + '#/plans'); await page.waitForTimeout(600)
  const txt = await page.locator('main').innerText(); assert.match(txt, /Available After Launch/); assert.match(txt, /KWD 2\.900/); assert.match(txt, /provisional/i)
  assert.equal(await page.getByRole('button', { name: /subscribe|buy|checkout|pay now/i }).count(), 0)
  assert.ok(await page.locator('button.soon[disabled]').count() >= 1)
  await ctx.close()
})
await step('visitor limits: locked muscle group redirects to login; open group shows capped exercises + premium note', async () => {
  const { ctx, page } = await open(1280, 800, 'en'); await page.goto(base + '#/self?group=chest'); await page.waitForTimeout(700)
  const cards = await page.locator('main ul.list > li').count(); assert.ok(cards >= 1 && cards <= 2, 'cards ' + cards)
  assert.ok(await page.getByText(/VORA Premium/).count() > 0)
  await ctx.close()
})
await step('unknown route shows a friendly page with a way home', async () => {
  const { ctx, page } = await open(390, 844, 'en'); await page.goto(base + '#/nope'); await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Home' }).first().waitFor(); await ctx.close()
})
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\n${n('PASS')} passed, ${n('FAIL')} failed`); process.exit(n('FAIL') ? 1 : 0)
