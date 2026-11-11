// Static check: every Arabic string passed to t() has an English entry. Run: node tests/i18n-coverage.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p] })
const dictSrc = ['src/i18n/en.ts', 'src/i18n/en-extra.ts'].map((f) => readFileSync(f, 'utf8')).join('\n')
const keys = new Set([...dictSrc.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1\s*:/g)].map((m) => m[2].replace(/\\(['"`])/g, '$1')))
const missing = new Set()
for (const f of walk('src').filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.includes('i18n/'))) {
  const s = readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bt\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) { const k = m[2].replace(/\\(['"`])/g, '$1'); if (/[؀-ۿ]/.test(k) && !keys.has(k)) missing.add(k) }
}
console.log([...missing].map((k) => JSON.stringify(k)).join('\n')); console.log(`\n${missing.size} missing`)
process.exit(missing.size ? 1 : 0)
