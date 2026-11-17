// Measures real load of a URL in headless Chromium (cold cache), 3 runs, prints medians.
import { chromium } from 'playwright-core'
const url = process.argv[2]; const runs = 3; const out = []
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
for (let i = 0; i < runs; i++) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
  const p = await ctx.newPage()
  let bytes = 0, js = 0, reqs = 0, api = 0
  p.on('response', async r => { try { reqs++; const len = Number(r.headers()['content-length'] || 0); bytes += len; if (/\.js(\?|$)/.test(r.url())) js += len; if (/supabase\.co/.test(r.url())) api++ } catch {} })
  const t0 = Date.now()
  await p.goto(url, { waitUntil: 'load' })
  await p.waitForLoadState('networkidle').catch(() => {})
  const idle = Date.now() - t0
  const m = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, fcp: fcp ? fcp.startTime : null } })
  out.push({ ...m, idle, reqs, api, kb: Math.round(bytes / 1024), jsKb: Math.round(js / 1024) })
  await ctx.close()
}
await b.close()
const med = k => out.map(o => o[k]).sort((a, b) => a - b)[1]
console.log(JSON.stringify(out)); console.log('MEDIAN', Object.fromEntries(Object.keys(out[0]).map(k => [k, Math.round(med(k))])))
