// Storage + AI rate-limit integration tests against the real project.
// Run: node --env-file=.env tests/extras.test.mjs <creds.json> [storage|ratelimit|all]
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const [A, B] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const which = process.argv[3] || 'all'
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const client = () => createClient(URL, KEY, { auth: { persistSession: false } })
let n = 0; const ok = (m) => console.log(`PASS ${++n}. ${m}`)
const login = async (u) => { const c = client(); const r = await c.auth.signInWithPassword(u); assert.ifError(r.error); return { c, id: r.data.user.id, token: r.data.session.access_token } }
// 1x1 PNG
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const a = await login(A), b = await login(B)

if (which === 'storage' || which === 'all') {
  const path = `${a.id}/test-${Date.now()}.png`
  let r = await a.c.storage.from('progress-photos').upload(path, png, { contentType: 'image/png' }); assert.ifError(r.error); ok('A uploads a PNG into own folder')
  r = await a.c.storage.from('progress-photos').createSignedUrl(path, 60); assert.ifError(r.error)
  const got = await fetch(r.data.signedUrl); assert.equal(got.status, 200); ok('A gets a signed URL and the image downloads (HTTP 200)')
  r = await b.c.storage.from('progress-photos').createSignedUrl(path, 60); assert.ok(r.error || !r.data?.signedUrl); ok('B cannot get a signed URL for A\'s photo')
  r = await b.c.storage.from('progress-photos').download(path); assert.ok(r.error); ok('B cannot download A\'s photo')
  r = await b.c.storage.from('progress-photos').upload(`${a.id}/forged-${Date.now()}.png`, png, { contentType: 'image/png' }); assert.ok(r.error); ok('B cannot upload into A\'s folder: ' + r.error.message)
  r = await b.c.storage.from('progress-photos').remove([path]); assert.ok(!r.data || r.data.length === 0); ok('B cannot delete A\'s photo')
  r = await a.c.storage.from('progress-photos').upload(`${a.id}/note-${Date.now()}.txt`, Buffer.from('hello'), { contentType: 'text/plain' }); assert.ok(r.error); ok('non-image upload rejected by bucket: ' + r.error.message)
  r = await a.c.storage.from('progress-photos').upload(`${a.id}/big-${Date.now()}.png`, Buffer.alloc(5 * 1024 * 1024 + 1024, 1), { contentType: 'image/png' }); assert.ok(r.error); ok('image over 5 MB rejected by bucket: ' + r.error.message)
  r = await a.c.from('workouts').insert({ exercise: 'bad photo', sets: 1, reps: 1, weight: 1, photo_url: `${b.id}/x.png` }); assert.ok(r.error); ok('workout cannot reference another user\'s photo path (check constraint)')
  r = await a.c.from('workouts').insert({ exercise: 'with photo', sets: 3, reps: 5, weight: 20, photo_url: path, summary: 'My own edited summary' }).select().single(); assert.ifError(r.error)
  assert.equal(r.data.photo_url, path); assert.equal(r.data.summary, 'My own edited summary'); ok('workout saved with photo_url and user-edited summary')
  r = await b.c.from('workouts').select('*').eq('id', r.data.id); assert.equal(r.data.length, 0); ok('B cannot see A\'s workout (photo/summary) rows')
  await a.c.from('workouts').delete().eq('user_id', a.id); await a.c.storage.from('progress-photos').remove([path]); ok('cleanup own test data')
}

if (which === 'ratelimit' || which === 'all') {
  const call = (u, fn, body = {}) => fetch(`${URL}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${u.token}` }, body: JSON.stringify(body) })
  let r = await fetch(`${URL}/functions/v1/ai-summary`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(r.status, 401); ok('no login -> 401')
  const body = { exercise: 'Bench press', sets: 3, reps: 8, weight: 60 }
  const seq = [['ai-summary', body], ['ai-analysis', {}], ['ai-summary', body], ['ai-analysis', {}], ['ai-summary', body]]
  const statuses = []
  for (const [fn, bd] of seq) { const res = await call(b, fn, bd); statuses.push(res.status); await res.text() }
  console.log('   first five statuses (mixed functions):', statuses.join(', '))
  assert.ok(statuses.every((s) => s !== 429)); ok('requests 1-5 (shared across both functions) are not rate limited')
  const sixth = await call(b, 'ai-analysis', {}); const txt = await sixth.json()
  assert.equal(sixth.status, 429); assert.ok(sixth.headers.get('retry-after')); assert.match(txt.error, /per minute/)
  ok(`6th request -> HTTP 429 with Retry-After ${sixth.headers.get('retry-after')}s: "${txt.error}"`)
  const seventh = await call(b, 'ai-summary', body); assert.equal(seventh.status, 429); ok('7th request also 429')
  const other = await call(a, 'ai-summary', body); assert.notEqual(other.status, 429); ok('a different user is not affected by B\'s limit (status ' + other.status + ')')
}
console.log(`\nALL ${n} CHECKS PASSED`)
