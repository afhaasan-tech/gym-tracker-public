// Live browser test of the public marketplace frontend + role flows (real site, real Supabase, no mocks).
// Usage: TEST_CREDS=<creds.json> node tests/market-live.e2e.mjs <baseUrl> <phase>
//   phase "public": discovery without login, journeys, search, nav, booking wizard + login return + guardian consent, muscle explorer, gating (accounts 4,5)
//   phase "coach1": invited member claims coach access, edits profile, proposes a specialization (account 6; needs an open invitation for that e-mail)
//   phase "coach2": ACTIVE coach creates a service and submits it for approval (account 6)
//   phase "coach3": coach adds a slot; a member books it; the coach sees the booking (and only that) and confirms; member sees it confirmed (accounts 6, 7)
// Owner/emergency approvals between phases are done by the Super Admin (or, in tests, through the real owner_* RPCs under an aal2 admin claim).
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { cred } from './_creds.mjs'

const base = (process.argv[2] || 'https://gym-tracker-afhaasan.vercel.app').replace(/\/?$/, '/')
const phase = process.argv[3] || 'public'
const SUPABASE_URL = 'https://zbqdmebrxqshcsozamwg.supabase.co', KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ'
const results = []
const step = async (name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', name) } catch (e) { results.push('FAIL'); console.log('FAIL', name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 200)) } }
const client = () => createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } })
const signed = async (acc) => { const c = client(); const { error } = await c.auth.signInWithPassword(acc); assert.ifError(error); return c }
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const newPage = async (vp = { width: 1280, height: 900 }) => (await (await browser.newContext({ viewport: vp })).newPage())
const open = (p, hash) => p.goto(base + '#' + hash)
const h1 = (p, name) => p.getByRole('heading', { name, level: 1 })
async function login(p, acc, next = '/') {
  await open(p, '/login?next=' + encodeURIComponent(next))
  await p.getByLabel('الإيميل', { exact: true }).fill(acc.email); await p.getByLabel('الرقم السري', { exact: true }).fill(acc.password)
  await p.getByRole('button', { name: 'دخول', exact: true }).click()
}
const BANNED = /التشريح|تشريح|أطلس/

if (phase === 'public') {
  const p = await newPage(); const pages = []
  await step('home is public: no login form, identity + search + 6 primary choices', async () => {
    await open(p, '/'); await p.getByRole('heading', { name: /اكتشف رياضتك/ }).waitFor()
    assert.equal(await p.getByLabel('الرقم السري', { exact: true }).count(), 0)
    await p.getByRole('search').first().waitFor()
    for (const c of ['أبي مدرب خاص', 'أبي تدريب جماعي', 'أبي أتمرن بروحي', 'أبي نظام غذائي', 'أبي أحجز جلسة', 'أبي أتصفح الرياضات']) await p.getByRole('button', { name: new RegExp(c) }).first().waitFor()
  })
  const CHOICES = [['أبي مدرب خاص', /journey\/private/, 'أبي مدرب خاص'], ['أبي تدريب جماعي', /journey\/group/, 'أبي تدريب جماعي'], ['أبي أتمرن بروحي', /#\/self/, 'أتمرن بروحي'], ['أبي نظام غذائي', /#\/food/, 'الغذاء'], ['أبي أحجز جلسة', /journey\/book/, 'أبي أحجز جلسة'], ['أبي أتصفح الرياضات', /#\/sports/, 'اكتشف الرياضات']]
  for (const [label, url, title] of CHOICES) await step(`choice «${label}» opens a real page (${title}), not a dead end`, async () => {
    await open(p, '/'); await p.getByRole('button', { name: new RegExp(label) }).first().click(); await p.waitForURL(url); await h1(p, title).waitFor(); pages.push(await p.locator('body').innerText())
  })
  await step('search finds sports and published services by keyword', async () => {
    await open(p, '/'); await p.getByRole('search').first().getByRole('searchbox').fill('يوغا'); await p.getByRole('search').first().getByRole('button', { name: 'ابحث' }).click()
    await p.getByRole('button', { name: 'اليوغا' }).waitFor(); await p.getByText('يوغا للمبتدئات').first().waitFor()
  })
  await step('sports catalog: 28 sports, category filter works, detail page lists published services', async () => {
    await open(p, '/sports'); await p.locator('.sport-card').first().waitFor(); await p.waitForFunction(() => document.querySelectorAll('.sport-card').length === 28, null, { timeout: 8000 })
    await p.getByRole('group', { name: 'تصفية حسب النوع' }).getByRole('button', { name: 'رياضات المضرب' }).click(); await p.waitForFunction(() => document.querySelectorAll('.sport-card').length === 5, null, { timeout: 8000 })
    await open(p, '/sports/yoga'); await h1(p, 'اليوغا').waitFor(); await p.getByText('يوغا للمبتدئات').first().waitFor()
  })
  await step('coaches: demo coach profiles are labelled, filterable, and open a profile with published services', async () => {
    await open(p, '/coaches'); await p.locator('.coach-card').first().waitFor(); assert.equal(await p.locator('.coach-card').count(), 3)
    assert.ok((await p.locator('.chip-demo').count()) >= 3)
    await p.getByLabel('المنطقة').fill('الفروانية'); assert.equal(await p.locator('.coach-card').count(), 1)
    await p.locator('.coach-card').first().click(); await p.getByText('ملف تجريبي').first().waitFor(); await p.getByText('خدمات هذا المدرب').waitFor()
  })
  await step('trainer journey: sport -> private -> in person -> matching services -> booking page', async () => {
    await open(p, '/journey/private'); await p.getByRole('button', { name: 'كرة القدم' }).click(); await p.getByRole('button', { name: 'حضوري' }).click()
    await p.getByText('تدريب كرة قدم فردي').first().waitFor(); await p.getByRole('button', { name: 'التفاصيل والحجز' }).first().click(); await p.getByRole('heading', { name: 'اختر الموعد' }).waitFor()
  })
  await step('food hub: 4 options; plans/consult show an honest empty state; general info browses without login; saving asks for login', async () => {
    await open(p, '/food'); for (const t of ['يومية الأكل', 'وصفات ومعلومات عامة', 'خطة غذائية مخصصة', 'استشارة تغذية']) await p.getByRole('button', { name: new RegExp(t) }).first().waitFor()
    await open(p, '/food/plans'); await p.getByText('ما في خدمات تغذية معتمدة').waitFor()
    await open(p, '/food/info'); await p.locator('.food-item').first().waitFor(); await p.locator('.food-add-button').first().click(); await p.waitForURL(/#\/login/)
  })
  await step('self-guided: muscle group -> free exercises; saving prompts login and keeps the way back', async () => {
    await open(p, '/self'); await p.getByRole('button', { name: /الصدر/ }).click(); await p.getByText('ضغط الصدر').first().waitFor()
    await p.getByRole('button', { name: 'سجّل دخولك لحفظه' }).first().click(); await p.waitForURL(/#\/login\?next=/); assert.match(p.url(), /next=%2Fself%3Fgroup%3Dchest/)
  })
  await step('muscle explorer: 3D body loads, picking a group shows its exercises; wording has no banned terms', async () => {
    await open(p, '/muscles'); await h1(p, 'اختَر عضلتك').waitFor(); await p.locator('canvas').first().waitFor({ timeout: 30000 }); await p.waitForTimeout(3000)
    await p.getByRole('button', { name: 'الظهر', exact: true }).click(); await p.getByText('تمارين هذي المجموعة').waitFor(); await p.getByText(/ظهر/).first().waitFor()
    pages.push(await p.locator('body').innerText())
    for (const t of pages) assert.doesNotMatch(t, BANNED)
  })
  await step('private routes redirect visitors to login (workouts, bookings, profile, coach, owner)', async () => {
    for (const r of ['/workouts', '/bookings', '/profile', '/coach', '/owner']) { await open(p, r); await p.waitForURL(/#\/login\?next=/); }
  })
  await step('public desktop navigation matches the spec', async () => {
    await open(p, '/'); const nav = p.getByRole('navigation', { name: 'أقسام التطبيق' })
    for (const t of ['الرئيسية', 'اكتشف الرياضات', 'المدربون', 'أتمرن بروحي', 'الغذاء', 'اختَر عضلتك', 'تسجيل الدخول / إنشاء حساب']) await nav.getByRole('button', { name: t, exact: true }).waitFor()
  })
  const m = await newPage({ width: 390, height: 844 })
  await step('mobile: bottom navigation (5 items + more), no horizontal overflow on key pages', async () => {
    for (const r of ['/', '/sports', '/coaches', '/food', '/muscles']) { await open(m, r); await m.waitForTimeout(800); assert.ok(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'overflow on ' + r) }
    const bar = m.getByRole('navigation', { name: 'التنقل الرئيسي' }); assert.equal(await bar.getByRole('button').count(), 6)
    await bar.getByRole('button', { name: 'المزيد' }).click(); await m.getByRole('dialog', { name: 'المزيد' }).getByRole('button', { name: 'الغذاء' }).waitFor()
  })
  // ---- booking wizard with login in the middle (members: account 4 and 5)
  const A = cred(4), B = cred(5)
  const w = await newPage(); let svcId
  await step('booking wizard: a visitor picks a slot, logs in at the last step and returns to the SAME selection', async () => {
    svcId = (await client().from('services').select('id').eq('name', 'تدريب كرة صالات جماعي (تجريبي)').single()).data.id
    await open(w, '/book/' + svcId); await w.getByRole('heading', { name: 'اختر الموعد' }).waitFor(); await w.locator('.slot').nth(2).click()
    const chosen = await w.locator('.slot.on span').innerText()
    await w.getByRole('button', { name: /سجّل دخولك لتثبيت الحجز التجريبي/ }).click(); await w.waitForURL(/#\/login\?next=%2Fbook%2F/)
    await w.getByLabel('الإيميل', { exact: true }).fill(A.email); await w.getByLabel('الرقم السري', { exact: true }).fill(A.password); await w.getByRole('button', { name: 'دخول', exact: true }).click()
    await w.waitForURL(new RegExp('#/book/' + svcId)); await w.locator('.slot.on span').waitFor(); assert.equal(await w.locator('.slot.on span').innerText(), chosen)
  })
  await step('minors service needs guardian consent; with consent a DEMO booking is created, price comes from the server, nothing is paid', async () => {
    await w.getByRole('button', { name: 'ثبّت الحجز التجريبي' }).click(); await w.getByText('لازم موافقة ولي الأمر').waitFor()
    await w.getByLabel(/ولي الأمر/).check(); await w.getByRole('button', { name: 'ثبّت الحجز التجريبي' }).click()
    await w.getByRole('heading', { name: 'تم تثبيت الحجز' }).waitFor(); await w.getByText('4.000 د.ك').waitFor(); await w.getByText('الدفع تجريبي').first().waitFor()
    assert.equal(await w.getByRole('button', { name: 'ادفع الآن' }).count(), 1)   // payment is only STARTED by the member's click; nothing is paid
  })
  await step('my bookings lists it with a Pending payment badge and Pay now; DB row has coach, server price, pending/pending', async () => {
    await w.getByRole('button', { name: 'حجوزاتي' }).first().click(); await w.locator('.bookings li', { hasText: 'كرة صالات' }).waitFor(); await w.locator('[data-status="pending"]').first().waitFor()
    const ca = await signed(A); const { data } = await ca.from('bookings').select('*'); assert.equal(data.length, 1)
    assert.equal(Number(data[0].price_kwd), 4); assert.equal(data[0].payment_status, 'pending'); assert.equal(data[0].booking_status, 'pending'); assert.ok(data[0].coach_id)
    assert.ok((await ca.from('bookings').update({ payment_status: 'paid' }).eq('id', data[0].id)).error)
    assert.equal(((await ca.from('bookings').update({ booking_status: 'confirmed' }).eq('id', data[0].id).select()).data ?? []).length, 0)
    const cb = await signed(B); assert.equal((await cb.from('bookings').select('*')).data.length, 0)
  })
  await step('member navigation (spec) and no owner/coach entries for a plain member', async () => {
    const nav = w.getByRole('navigation', { name: 'أقسام التطبيق' })
    for (const t of ['الرئيسية', 'تماريني', 'اكتشف الرياضات', 'المدربون', 'الغذاء', 'اختَر عضلتك', 'حجوزاتي', 'حسابي']) await nav.getByRole('button', { name: t, exact: true }).waitFor()
    for (const t of ['لوحة المالك', 'لوحة المدرب']) assert.equal(await nav.getByRole('button', { name: t, exact: true }).count(), 0)
    await open(w, '/owner'); await w.getByText('غير مصرّح').first().waitFor(); await open(w, '/coach'); await w.getByText('للمدربين الذين دعتهم إدارة المنصة').waitFor()
  })
  await step('role escalation from a member session is refused by the server (admins, coach profile, invitations, owner RPCs, roles in metadata)', async () => {
    const ca = await signed(A); const uid = (await ca.auth.getUser()).data.user.id
    assert.ok((await ca.from('admins').insert({ user_id: uid, role: 'super' })).error)
    assert.ok((await ca.from('coach_profiles').insert({ user_id: uid, display_name: 'Self Coach', status: 'active' })).error)
    assert.ok((await ca.from('coach_invitations').insert({ email: 'a@b.cc', display_name: 'Abc' })).error)
    for (const f of ['owner_list_users', 'owner_get_settings', 'owner_clear_emergency_admin']) assert.ok((await ca.rpc(f)).error, f)
    assert.ok((await ca.rpc('owner_invite_coach', { p_email: 'x@y.zz', p_name: 'X Y' })).error); assert.ok((await ca.rpc('claim_coach_invitation')).error)
    assert.equal((await ca.rpc('is_admin')).data, false); assert.equal((await ca.rpc('is_coach')).data, false)
    const upd = await ca.auth.updateUser({ data: { role: 'admin', is_admin: true } }); assert.ifError(upd.error)
    assert.equal((await ca.rpc('is_admin')).data, false); assert.equal((await ca.from('admins').select('*')).data?.length ?? 0, 0)
  })
}

if (phase === 'coach1') {
  const C = cred(6), p = await newPage()
  await step('invited member claims coach access from their profile; the coach area opens as PENDING', async () => {
    await login(p, C, '/profile'); const claim = p.getByRole('button', { name: 'استلم دعوة المدرب' }); const already = await p.getByRole('navigation', { name: 'أقسام التطبيق' }).getByRole('button', { name: 'لوحة المدرب' }).waitFor({ timeout: 6000 }).then(() => true, () => false); if (!already && await claim.waitFor({ timeout: 8000 }).then(() => true, () => false)) { await claim.click(); await p.getByText('حسابك بانتظار تفعيل المالك').waitFor({ timeout: 15000 }) } // re-runnable: an already-claimed invitation just opens the pending area
    await p.getByRole('navigation', { name: 'أقسام التطبيق' }).getByRole('button', { name: 'لوحة المدرب' }).click(); await p.getByText('طلبك بانتظار تفعيل المالك').waitFor()
  })
  await step('pending coach edits own profile and proposes a specialization; cannot publish or add services yet', async () => {
    await p.getByRole('button', { name: 'ملفي' }).click(); await p.waitForFunction(() => document.querySelector('form input[required]')?.value.length > 1); await p.getByLabel('نبذة').fill('مدرب اختبار لمنصة ڤورا'); await p.getByLabel('المناطق (افصل بفاصلة)').fill('حولي'); await p.getByRole('button', { name: 'احفظ الملف' }).click(); await p.getByText('تم حفظ الملف').waitFor()
    await p.getByLabel('اقترح تخصصاً').selectOption({ label: 'اليوغا' }); await p.getByText('أُرسل التخصص لمراجعة المالك').waitFor()
    const c = await signed(C); assert.ok((await c.from('services').insert({ name: 'x', price_kwd: 1 })).error)
    assert.equal((await c.rpc('is_coach')).data, false)
  })
}
if (phase === 'coach2') {
  const C = cred(6), p = await newPage()
  await step('ACTIVE coach: dashboard opens; creates a service draft with an approved specialization and submits it for owner approval', async () => {
    await login(p, C, '/coach/services'); await p.getByRole('heading', { name: 'خدمة جديدة' }).waitFor()
    await p.getByLabel('الاسم', { exact: true }).fill('Test Yoga Session'); await p.getByLabel('الرياضة (من تخصصاتك المعتمدة)').selectOption({ label: 'اليوغا' }); await p.getByLabel('السعر المقترح (د.ك)').fill('6.5')
    await p.getByRole('button', { name: 'أضف كمسودة' }).click(); await p.getByText('تمت إضافة المسودة').waitFor()
    await p.locator('li', { hasText: 'Test Yoga Session' }).getByRole('button', { name: 'أرسل للاعتماد' }).click(); await p.getByText('أُرسلت للاعتماد').waitFor()
    await p.locator('li', { hasText: 'Test Yoga Session' }).getByText('بانتظار اعتماد المالك').waitFor()
  })
  await step('a submitted (unapproved) service is invisible to the public and to other members', async () => {
    const anon = client(); assert.equal((await anon.from('services').select('id').eq('name', 'Test Yoga Session')).data.length, 0)
    const m = await signed(cred(7)); assert.equal((await m.from('services').select('id').eq('name', 'Test Yoga Session')).data.length, 0)
    const c = await signed(C); const r = await c.from('services').update({ status: 'published' }).eq('name', 'Test Yoga Session'); assert.ok(r.error)
  })
}
if (phase === 'coach3') {
  const C = cred(6), M = cred(7), p = await newPage(), q = await newPage()
  await step('coach adds an availability slot to the (owner-approved) service', async () => {
    await login(p, C, '/coach/schedule'); await p.getByLabel('الخدمة').selectOption({ label: 'Test Yoga Session' })
    const d = new Date(Date.now() + 4 * 864e5); const pad = (n) => String(n).padStart(2, '0')
    await p.getByLabel('موعد جديد').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T18:30`); await p.getByRole('button', { name: 'أضف', exact: true }).click(); await p.getByText('أضيف الموعد').waitFor()
  })
  await step('the published service is public; a member books the coach slot through the wizard', async () => {
    const id = (await client().from('services').select('id').eq('name', 'Test Yoga Session').single()).data.id
    await login(q, M, '/book/' + id); await q.locator('.slot').first().waitFor(); await q.locator('.slot').first().click(); await q.getByRole('button', { name: 'ثبّت الحجز التجريبي' }).click(); await q.getByRole('heading', { name: 'تم تثبيت الحجز' }).waitFor()
  })
  await step('coach sees ONLY bookings of own services (with trainee name), confirms; member sees the confirmation; coach cannot touch payment', async () => {
    await open(p, '/coach/bookings'); await p.locator('li', { hasText: 'Test Yoga Session' }).waitFor(); await p.locator('li', { hasText: 'Test Yoga Session' }).getByRole('button', { name: 'أكّد' }).click(); await p.getByText('تم التحديث').waitFor()
    const c = await signed(C); const mine = (await c.from('bookings').select('*')).data; assert.ok(mine.length >= 1 && mine.every((b) => b.coach_id)); assert.ok((await c.from('bookings').update({ payment_status: 'paid' }).eq('id', mine[0].id)).error)
    await open(q, '/bookings'); await q.locator('.bookings li', { hasText: 'Test Yoga' }).getByText('مؤكد').waitFor()
  })
  await step('another member cannot see this coach\'s bookings (isolation)', async () => {
    const other = await signed(cred(8)); assert.equal((await other.from('bookings').select('*')).data.length, 0)
  })
}
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\nPHASE ${phase}: ${n('PASS')} passed, ${n('FAIL')} failed`)
process.exit(n('FAIL') ? 1 : 0)
