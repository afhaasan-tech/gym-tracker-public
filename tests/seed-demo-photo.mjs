// Creates one demo workout with a real progress photo (for the Storage submission screenshot).
// Usage: node --env-file=.env tests/seed-demo-photo.mjs <creds.json>
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const [A] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const file = join(tmpdir(), 'progress-demo.png')
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const p = await b.newPage({ viewport: { width: 800, height: 600 } })
await p.setContent(`<body style="margin:0;width:800px;height:600px;background:linear-gradient(135deg,#0E1013,#2b3a12 60%,#C6F135);display:flex;align-items:center;justify-content:center;font:700 64px Inter,system-ui,sans-serif;color:#F2F4F7"><div style="text-align:center">Progress Photo<div style="font-size:28px;font-weight:500;margin-top:12px;color:#C6F135">Week 1 · Gym Tracker</div></div></body>`)
await p.screenshot({ path: file }); await b.close()
const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const { data, error } = await c.auth.signInWithPassword(A); if (error) throw error
const path = `${data.user.id}/progress-demo.png`
const up = await c.storage.from('progress-photos').upload(path, readFileSync(file), { contentType: 'image/png', upsert: true }); if (up.error) throw up.error
const ins = await c.from('workouts').insert({ exercise: 'Progress photo demo', sets: 3, reps: 10, weight: 50, photo_url: path, summary: 'Week 1 progress photo.' }); if (ins.error) throw ins.error
console.log('uploaded', path)
