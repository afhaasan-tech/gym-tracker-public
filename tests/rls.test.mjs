// Integration test against the real Supabase project. Run: node --env-file=.env tests/rls.test.mjs <creds.json>
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const [A, B] = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const client = () => createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
let n = 0; const ok = (m) => console.log(`PASS ${++n}. ${m}`)

const anon = client()
let r = await anon.from('workouts').select('*')
assert.equal(r.data?.length ?? 0, 0); ok('anonymous (logged-out) client sees 0 rows')
r = await anon.from('workouts').insert({ exercise: 'x', sets: 1, reps: 1, weight: 1 })
assert.ok(r.error); ok('anonymous insert rejected: ' + r.error.message)

const a = client(), b = client()
const sa = await a.auth.signInWithPassword({ email: A.email, password: A.password }); assert.ifError(sa.error)
const sb = await b.auth.signInWithPassword({ email: B.email, password: B.password }); assert.ifError(sb.error)
ok('both accounts log in with email/password')
const idA = sa.data.user.id, idB = sb.data.user.id; assert.notEqual(idA, idB)

r = await a.from('workouts').insert({ exercise: 'A bench', sets: 3, reps: 8, weight: 60 }).select().single(); assert.ifError(r.error)
assert.equal(r.data.user_id, idA); const aRow = r.data.id; ok('A inserts without sending user_id; DB assigns A\'s id automatically')
r = await b.from('workouts').insert({ exercise: 'B squat', sets: 5, reps: 5, weight: 100 }).select().single(); assert.ifError(r.error)
assert.equal(r.data.user_id, idB); const bRow = r.data.id; ok('B inserts; row owned by B')

r = await a.from('workouts').select('*'); assert.ifError(r.error)
assert.deepEqual(r.data.map((x) => x.id), [aRow]); ok('A sees only A\'s row')
r = await b.from('workouts').select('*'); assert.deepEqual(r.data.map((x) => x.id), [bRow]); ok('B sees only B\'s row')
r = await b.from('workouts').select('*').eq('id', aRow); assert.equal(r.data.length, 0); ok('B cannot fetch A\'s row by id')

r = await b.from('workouts').insert({ user_id: idA, exercise: 'forged', sets: 1, reps: 1, weight: 1 })
assert.ok(r.error); assert.equal(r.error.code, '42501'); ok('B inserting with A\'s user_id is rejected (RLS 42501): ' + r.error.message)
r = await b.from('workouts').insert({ user_id: '00000000-0000-0000-0000-000000000000', exercise: 'forged', sets: 1, reps: 1, weight: 1 })
assert.ok(r.error); ok('insert with arbitrary fake user_id rejected')
r = await a.from('workouts').select('*'); assert.equal(r.data.length, 1); ok('no forged row leaked into A\'s data')

r = await b.from('workouts').delete().eq('id', aRow).select(); assert.equal(r.data.length, 0); ok('B deleting A\'s row affects 0 rows')
r = await a.from('workouts').select('*').eq('id', aRow); assert.equal(r.data.length, 1); ok('A\'s row still exists')
r = await a.from('workouts').delete().eq('id', aRow).select(); assert.equal(r.data.length, 1); ok('A can delete own row')
r = await b.from('workouts').delete().eq('id', bRow).select(); assert.equal(r.data.length, 1); ok('B can delete own row')

r = await a.from('workouts').update({ user_id: idB }).eq('id', aRow).select(); assert.ok(r.error || r.data.length === 0); ok('UPDATE not permitted (no policy)')
await a.auth.signOut(); r = await a.from('workouts').select('*'); assert.equal(r.data?.length ?? 0, 0); ok('after logout A sees nothing')
console.log(`\nALL ${n} CHECKS PASSED`)
