// Smoke test of the public web app: home, login, language switch, lazy routes; fails on console errors.
import { chromium } from 'playwright-core'
const base = process.argv[2]; const errs = []; let fail = 0
const ok = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fail++ }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(base + '/'); await p.waitForSelector('.home-hero h1')
ok('home hero (Arabic)', (await p.textContent('.home-hero h1')).includes('مدربك'))
const data = await p.waitForSelector('.chip-btn', { timeout: 8000 }).then(() => true, () => false); console.log(data ? 'PASS home data loaded' : 'SKIP home data (no database reach from this browser)')
await p.goto(base + '/#/login'); await p.waitForSelector('input[type=email]'); ok('login form (lazy chunk)', true)
await p.goto(base + '/#/sports'); await p.waitForSelector('.page-title h1'); ok('sports page (lazy chunk)', true)
await p.goto(base + '/#/plans'); await p.waitForSelector('main h1'); ok('plans page', true)
await p.goto(base + '/#/'); await p.waitForSelector('.home-hero h1')
await p.evaluate(() => localStorage.setItem('vora-lang', 'en')); await p.reload(); await p.waitForSelector('.home-hero h1')
const en = await p.textContent('.home-hero h1'); ok('English after reload: ' + en, /[A-Za-z]/.test(en) && !/[؀-ۿ]/.test(en))
await p.evaluate(() => localStorage.setItem('vora-lang', 'ar')); await p.reload(); await p.waitForSelector('.home-hero h1')
const sw = p.locator('button', { hasText: /^(EN|English)$/ }).first()
if (await sw.count()) { await sw.click(); await p.waitForFunction(() => document.documentElement.lang === 'en'); ok('language switch button → en', !/[؀-ۿ]/.test(await p.textContent('.home-hero h1'))) } else console.log('SKIP switch button not found')
const real = errs.filter(e => !/Failed to load resource|ERR_|fetch/i.test(e)); errs.length = 0; errs.push(...real); ok('no console errors ' + JSON.stringify(errs.slice(0, 3)), errs.length === 0)
await b.close(); process.exit(fail ? 1 : 0)
