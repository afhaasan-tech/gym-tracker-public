// Proves no mock/stubbed AI text can reach real users: scans the DEPLOYED bundle, the app source and the Edge Function source.
// Usage: node tests/no-mock-in-prod.mjs <baseUrl>
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const base = process.argv[2] || 'https://gym-tracker-afhaasan.vercel.app'
const html = await (await fetch(base)).text()
const scripts = [...html.matchAll(/src="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]); assert.ok(scripts.length, 'no bundle found')
for (const s of scripts) {
  const js = await (await fetch(base + s)).text()
  assert.ok(!/MOCK:|mockai|ALLOW_MOCK|page\.route|route\.fulfill/i.test(js), 'mock marker found in deployed bundle ' + s)
  console.log('PASS deployed bundle', s, `(${(js.length / 1024).toFixed(0)} KB) has no mock markers`)
}
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
for (const f of [...walk('src'), ...walk('supabase/functions')]) {
  const t = readFileSync(f, 'utf8').replace(/never returns canned\/mock AI text/, '')
  assert.ok(!/mock|stub|canned|MOCK:/i.test(t), 'mock/stub wording in ' + f)
}
console.log('PASS app source and Edge Function source contain no mock/stub/canned AI text')
// The only mock lives in tests/e2e.test.mjs, behind ALLOW_MOCK_AI=1, and is injected into a tester's browser, never shipped.
