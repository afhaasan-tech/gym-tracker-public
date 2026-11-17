// Entitlement matrix end to end against a LOCAL Supabase stack only (real Postgres + auth + PostgREST + the Edge Functions,
// mock AI provider, mock mailbox). Free / VORA Coins / Monthly / Yearly, premium library protection, trial reset attempts.
//   LOCAL_URL=http://127.0.0.1:54399 LOCAL_ANON=<anon key> LOCAL_SERVICE=<service key> node tests/entitlements-local.e2e.mjs
// The operator role (reading the e-mailed code, activating a paid period, granting purchased coins) is played through psql
// on the local database: PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322.
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'

const URL_ = process.env.LOCAL_URL, KEY = process.env.LOCAL_ANON, SERVICE = process.env.LOCAL_SERVICE
assert.ok(URL_ && /^http:\/\/(127\.0\.0\.1|localhost):/.test(URL_) && KEY && SERVICE, 'local stack only')
const sql = (q) => execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-q', '-At', '-c', q], { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim()
let pass = 0, fail = 0
const step = async (id, name, fn) => { try { await fn(); pass++; console.log('PASS', id, name) } catch (e) { fail++; console.log('FAIL', id, name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 300)) } }
const call = async (name, token, body) => { const r = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) } }
async function member(label) {
  const email = `${label}-${Date.now()}@example.com`, password = 'Pw-' + randomBytes(9).toString('base64url') + 'a1'
  const r = await fetch(URL_ + '/auth/v1/admin/users', { method: 'POST', headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) })
  assert.equal(r.status, 200, 'create user'); const id = (await r.json()).id
  return { email, password, id, ...(await login({ email, password })) }
}
async function login(c) {
  const x = createClient(URL_, KEY, { auth: { persistSession: false } })
  const { data, error } = await x.auth.signInWithPassword(c); assert.ifError(error)
  return { c: x, token: data.session.access_token }
}
async function trust(m, secret = randomBytes(32).toString('base64url')) {
  const sent = await call('device-auth', m.token, { action: 'send_code', device_secret: secret, language: 'en' }); assert.equal(sent.status, 200, JSON.stringify(sent.json))
  const code = sql(`select substring(body from '[0-9]{6}') from public.dev_mock_outbox where to_email='${m.email}' order by id desc limit 1`)
  const v = await call('device-auth', m.token, { action: 'verify_code', device_secret: secret, code, label: 'e2e' }); assert.equal(v.status, 200, JSON.stringify(v.json))
  return secret
}
/** One trainer request; a rate-limited request (12 per minute) creates and charges nothing, so it is simply retried later. */
async function ask(m, body) {
  const full = { idempotency_key: 'e2e-' + randomUUID(), language: 'ar', ...body }
  for (let i = 0; ; i++) { const r = await call('ai-trainer', m.token, full); if (r.status !== 429 || i >= 4) return r; await new Promise((x) => setTimeout(x, (Number(r.json?.retry_after ?? 20) + 1) * 1000)) }
}
const access = async (m) => { const { data, error } = await m.c.rpc('my_trainer_access'); assert.ifError(error); return data }
const libraryIds = new Set(sql('select id from public.exercise_library where enabled').split('\n'))

const anon = createClient(URL_, KEY, { auth: { persistSession: false } })
await step('E01', 'basic muscle information is open to everyone (9 muscles, ar + en)', async () => {
  const { data, error } = await anon.rpc('public_muscles'); assert.ifError(error)
  assert.equal(data.length, 9); for (const m of data) assert.ok(m.name_ar && m.name_en && m.location_ar && m.function_en && m.summary_ar)
})
await step('E02', 'premium library is closed to visitors: RPCs refused and the table is not readable', async () => {
  assert.ok((await anon.rpc('premium_exercises')).error, 'rpc list'); assert.ok((await anon.rpc('premium_exercise', { p_id: 'push-up' })).error, 'rpc one')
  const t = await anon.from('exercise_library').select('id').limit(1); assert.ok(t.error || (t.data ?? []).length === 0, 'table')
})

// ------------------------------------------------------------------ FREE
const free = await member('free'); const conv = randomUUID()
await step('F01', 'free member on a trusted device: tier trial, library flag false, library RPC refused, table unreadable', async () => {
  await trust(free); const a = await access(free)
  assert.equal(a.tier, 'trial'); assert.equal(a.library, false); assert.ok(a.trial.max_messages >= 1, 'the limit is disclosed')
  const r = await free.c.rpc('premium_exercises', { p_muscle: 'chest' }); assert.ok(r.error && /subscription_required/.test(r.error.message), JSON.stringify(r.error))
  const t = await free.c.from('exercise_library').select('id').limit(1); assert.ok(t.error || (t.data ?? []).length === 0)
})
await step('F02', 'free AI answer: short, no cards, nothing charged, dismissible upgrade hint, remaining messages disclosed', async () => {
  const r = await ask(free, { conversation_id: conv, message: 'شنو أفضل تمرين للصدر؟' }); assert.equal(r.status, 200, JSON.stringify(r.json)); const b = r.json
  assert.ok(b.chat_reply.length > 0 && b.chat_reply.length <= 340, 'short reply: ' + b.chat_reply.length)
  assert.equal(b.workout_card, null); assert.equal(b.workout_plan, null); assert.equal(b.meal_card, null); assert.equal(b.credits_charged, 0)
  assert.ok(b.upgrade && typeof b.upgrade.reason === 'string', 'upgrade hint'); assert.equal(typeof b.access.trial_remaining, 'number')
})
await step('F03', 'free: a plan request and a nutrition request are not delivered (locked), still answered politely', async () => {
  let b = (await ask(free, { conversation_id: conv, message: 'أبي خطة تمارين أسبوعية كاملة' })).json; assert.equal(b.workout_plan, null); assert.ok(b.locked.includes('plan'), JSON.stringify(b.locked)); assert.equal(b.upgrade?.reason, 'plan')
  b = (await ask(free, { conversation_id: conv, message: 'أبي وصفة أكل صحي' })).json; assert.equal(b.meal_card, null); assert.ok(b.locked.includes('nutrition')); assert.ok(b.chat_reply.length > 0)
})
await step('F04', 'free: urgent safety message gets a safety answer without an upgrade hint', async () => {
  const b = (await ask(free, { conversation_id: conv, message: 'أحس ألم بالصدر قوي وأنا أتمرن' })).json
  assert.ok(b.safety?.urgent === true || b.safety?.refused === true, JSON.stringify(b.safety)); assert.equal(b.upgrade ?? null, null)
})
await step('F05', 'the trial cannot be reset: a new conversation id, a new login session and a new device are all refused', async () => {
  assert.equal((await ask(free, { conversation_id: randomUUID(), message: 'تمرين ظهر؟' })).status, 402, 'new conversation')
  const again = { ...free, ...(await login(free)) }; await trust(again)        // "reinstall": fresh session + fresh device secret
  const r = await ask(again, { conversation_id: randomUUID(), message: 'تمرين ظهر؟' }); assert.equal(r.status, 402); assert.equal(r.json.error, 'trial_ended')
  assert.equal(sql(`select count(*) from public.trainer_trials where user_id='${free.id}'`), '1', 'one trial row per account, ever')
})
await step('F06', 'after the last trial message: 402 everywhere, tier none, purchase options needed', async () => {
  for (let i = 0; i < 12; i++) { const r = await ask(free, { conversation_id: conv, message: 'نصيحة سريعة للإحماء؟' }); if (r.status === 402) break }
  const r = await ask(free, { conversation_id: conv, message: 'سؤال بعد' }); assert.equal(r.status, 402); assert.equal(r.json.subscription_required, true)
  assert.equal((await access(free)).tier, 'none')
})

// ------------------------------------------------------------------ VORA COINS (purchased coins, no subscription)
await step('C01', 'promo credits alone do not reopen the trainer; purchased coins do (tier coins), library stays closed', async () => {
  assert.equal((await access(free)).tier, 'none', 'the free account still holds its promotional credits')
  sql(`select public.credit_grant('${free.id}', 'purchased', 120, 'purchase', 'e2e-buy-${Date.now()}', 'e2e purchased coins')`)
  const a = await access(free); assert.equal(a.tier, 'coins'); assert.equal(a.library, false)
  assert.ok((await free.c.rpc('premium_exercises')).error, 'library refused for coin-only members')
})
await step('C02', 'coins: the exact price is shown first (409), then charged once; short answer; no plan, no nutrition, no library card', async () => {
  const before = Number(sql(`select coalesce(sum(amount),0) from public.credit_ledger where user_id='${free.id}'`))
  let r = await ask(free, { conversation_id: conv, message: 'شلون أستخدم جهاز السحب العلوي؟', confirm_credits: -1 }); assert.equal(r.status, 409); assert.equal(r.json.credits, 50)
  r = await ask(free, { conversation_id: conv, message: 'شلون أستخدم جهاز السحب العلوي؟', confirm_credits: 50 }); assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.equal(r.json.credits_charged, 50); assert.equal(r.json.workout_card, null); assert.ok(r.json.chat_reply.length <= 340)
  assert.equal(Number(sql(`select coalesce(sum(amount),0) from public.credit_ledger where user_id='${free.id}'`)), before - 50, 'ledger moved by exactly 50')
  const p = (await ask(free, { conversation_id: conv, message: 'أبي خطة أسبوعية كاملة', confirm_credits: 50 })).json; assert.equal(p.workout_plan, null); assert.ok(p.locked.includes('plan'))
})

// ------------------------------------------------------------------ MONTHLY
const mon = await member('monthly')
await step('M01', 'monthly subscriber: tier subscriber, period monthly, library opens only on a trusted device', async () => {
  sql(`select public.subscription_activate('${mon.id}', 'monthly', now() + interval '30 days', false, 'e2e-mon-${Date.now()}')`)
  assert.ok((await mon.c.rpc('premium_exercises')).error, 'untrusted session is refused even for a subscriber')
  await trust(mon); const a = await access(mon); assert.equal(a.tier, 'subscriber'); assert.equal(a.period, 'monthly'); assert.equal(a.library, true); assert.equal(a.nutrition, true)
  const { data, error } = await mon.c.rpc('premium_exercises', { p_muscle: 'chest', p_environment: 'gym' }); assert.ifError(error)
  assert.ok(data.length >= 3); const e = data[0]
  for (const k of ['name_ar', 'name_en', 'instructions_ar', 'cues_en', 'mistakes_ar', 'safety_en', 'alternatives', 'sources', 'difficulty', 'equipment_ar']) assert.ok(e[k] !== undefined && e[k] !== null, k)
  assert.ok(data.every((x) => x.primary_muscle === 'chest' && x.environments.includes('gym')))
})
await step('M02', 'trainer recommends an exercise taken from the real library (id exists in the database, text equals the record)', async () => {
  const r = await ask(mon, { conversation_id: randomUUID(), message: 'عطني تمرين صدر', confirm_credits: 50, environment: 'gym' }); assert.equal(r.status, 200, JSON.stringify(r.json))
  const c = r.json.workout_card; assert.ok(c, 'card'); assert.equal(c.source, 'library'); assert.ok(libraryIds.has(c.exercise_id), c.exercise_id)
  assert.equal(c.exercise_name_ar, sql(`select name_ar from public.exercise_library where id='${c.exercise_id}'`)); assert.equal(r.json.upgrade ?? null, null)
})
await step('M03', 'personalised plan: every exercise in every day comes from the library', async () => {
  const r = await ask(mon, { conversation_id: randomUUID(), message: 'أبي خطة تمارين أسبوعية', confirm_credits: 50 }); assert.equal(r.status, 200, JSON.stringify(r.json))
  const p = r.json.workout_plan; assert.ok(p && p.days.length >= 1, 'plan'); for (const d of p.days) for (const x of d.exercises) assert.ok(libraryIds.has(x.exercise_id), x.exercise_id)
})
await step('M04', 'subscriber nutrition is included (meal card)', async () => {
  const r = await ask(mon, { conversation_id: randomUUID(), message: 'عطني وصفة أكل صحي بعد التمرين', confirm_credits: 50 }); assert.equal(r.status, 200); assert.ok(r.json.meal_card, 'meal card')
})
await step('M05', 'when the monthly period ends the library and the trainer close again', async () => {
  sql(`update public.subscriptions set current_period_end = now() - interval '1 minute' where user_id='${mon.id}'`); sql('select public.subscriptions_expire_due()')
  const a = await access(mon); assert.notEqual(a.tier, 'subscriber'); assert.equal(a.library, false)
  assert.ok((await mon.c.rpc('premium_exercises')).error, 'library closed after expiry')
})

// ------------------------------------------------------------------ YEARLY
const yr = await member('yearly')
await step('Y01', 'yearly subscriber: same library and coaching, period yearly', async () => {
  sql(`select public.subscription_activate('${yr.id}', 'yearly', now() + interval '365 days', false, 'e2e-yr-${Date.now()}')`)
  await trust(yr); const a = await access(yr); assert.equal(a.tier, 'subscriber'); assert.equal(a.period, 'yearly'); assert.equal(a.library, true)
  const all = await yr.c.rpc('premium_exercises'); assert.ifError(all.error); assert.equal(all.data.length, libraryIds.size, 'the whole library')
  const one = await yr.c.rpc('premium_exercise', { p_id: all.data[0].id }); assert.ifError(one.error); assert.equal(one.data.id, all.data[0].id)
  const r = await ask(yr, { conversation_id: randomUUID(), message: 'عطني تمرين ظهر بالبيت', confirm_credits: 50, environment: 'home' }); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.ok(libraryIds.has(r.json.workout_card?.exercise_id))
})
console.log(`ENTITLEMENTS local: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0)
