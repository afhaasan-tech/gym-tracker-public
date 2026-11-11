// Owner / Emergency dashboard live test. Admin access needs a MULTI-FACTOR (TOTP) session, so the admin half is interactive:
//   TEST_CREDS=<creds.json> node tests/admin-live.e2e.mjs <baseUrl>
// Half 1 (automatic, account index 9): a plain member has no owner UI and the server refuses every owner function.
// Half 2 (only on a TTY): asks for the admin e-mail, password and a current authenticator code (all hidden / never stored),
//   then checks MFA gate -> dashboard tabs -> coaches/services/bookings/audit render for the signed-in admin.
import { chromium } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import readline from 'node:readline'
import { cred } from './_creds.mjs'

const base = (process.argv[2] || 'https://gym-tracker-afhaasan.vercel.app').replace(/\/?$/, '/')
const SUPABASE_URL = 'https://zbqdmebrxqshcsozamwg.supabase.co', KEY = 'sb_publishable_9R6-GR8-_i78c3cnCgQCgQ_CKm7irzZ'
const results = []
const step = async (name, fn) => { try { await fn(); results.push('PASS'); console.log('PASS', name) } catch (e) { results.push('FAIL'); console.log('FAIL', name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 200)) } }
const skip = (name) => { results.push('SKIP'); console.log('SKIP', name, '(interactive; needs the admin password and an authenticator code)') }
const ask = (q, hidden = false) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true }); if (hidden) rl._writeToOutput = (t) => { if (t.includes(q)) process.stdout.write(t) }; rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); res(a.trim()) }) })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
const newPage = async () => (await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage())
const open = (p, hash) => p.goto(base + '#' + hash)

const U = cred(9), p = await newPage()
await step('plain member: no owner entry, /owner shows "not authorised", and no MFA prompt', async () => {
  await p.goto(base + '#/login?next=%2Fowner'); await p.getByLabel('الإيميل', { exact: true }).fill(U.email); await p.getByLabel('الرقم السري', { exact: true }).fill(U.password); await p.getByRole('button', { name: 'دخول', exact: true }).click()
  await p.getByText('غير مصرّح').first().waitFor({ timeout: 20000 }); assert.equal(await p.getByText('التحقق الثنائي مطلوب').count(), 0)
  assert.equal(await p.getByRole('navigation', { name: 'أقسام التطبيق' }).getByRole('button', { name: 'لوحة المالك' }).count(), 0)
})
await step('server refuses every owner/admin function and table to a member (and the audit log is empty for them)', async () => {
  const c = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } }); assert.ifError((await c.auth.signInWithPassword(U)).error)
  for (const [f, a] of [['owner_list_users'], ['owner_get_settings'], ['owner_platform_stats'], ['admin_list_coaches'], ['owner_list_invitations'], ['owner_clear_emergency_admin'], ['owner_invite_coach', { p_email: 'q@w.ee', p_name: 'Qq Ww' }], ['owner_set_emergency_admin', { p_user: (await c.auth.getUser()).data.user.id }], ['owner_review_service', { p_service: '00000000-0000-0000-0000-000000000000', p_decision: 'published' }], ['admin_cancel_booking', { p_booking: '00000000-0000-0000-0000-000000000000', p_reason: 'x' }]]) assert.ok((await c.rpc(f, a)).error, f)
  assert.equal((await c.from('audit_log').select('id')).data.length, 0); assert.ok((await c.from('admins').select('*')).error)
  assert.equal((await c.rpc('my_admin_status')).data.role, null)
})
if (process.stdin.isTTY) {
  const email = await ask('Admin email: '), password = await ask('Admin password (hidden): ', true), a = await newPage()
  await step('admin login shows the MFA gate or (with a verified TOTP) the dashboard; dashboard only after the code is accepted', async () => {
    await a.goto(base + '#/login?next=%2Fowner'); await a.getByLabel('الإيميل', { exact: true }).fill(email); await a.getByLabel('الرقم السري', { exact: true }).fill(password); await a.getByRole('button', { name: 'دخول', exact: true }).click()
    await a.getByRole('heading', { name: 'التحقق الثنائي مطلوب' }).waitFor({ timeout: 20000 }); assert.equal(await a.getByRole('heading', { name: 'لوحة المالك' }).count(), 0)
    const code = await ask('Current authenticator code (hidden): ', true); await a.getByLabel('رمز التحقق').fill(code); await a.getByRole('button', { name: 'تحقّق', exact: true }).click()
    await a.getByRole('heading', { name: 'لوحة المالك' }).waitFor({ timeout: 20000 })
  })
  await step('super admin tabs render (coaches, services, users & roles, bookings, settings, audit)', async () => {
    for (const [label, marker] of [['طلبات المدربين', 'دعوة مدرب جديد'], ['اعتماد الخدمات', 'بانتظار الاعتماد'], ['المستخدمون والصلاحيات', 'المالك الرئيسي'], ['الحجوزات', 'كل الحجوزات تجريبية'], ['إعدادات المنصة', 'كتالوج الرياضات']]) { await a.getByRole('button', { name: label, exact: true }).click(); await a.getByText(marker).first().waitFor({ timeout: 15000 }) }
    await a.getByText('سجل التدقيق').first().waitFor()
  })
} else { skip('admin MFA gate and dashboard'); skip('super admin tabs') }
await browser.close()
const n = (s) => results.filter((r) => r === s).length
console.log(`\n${n('PASS')} passed, ${n('FAIL')} failed, ${n('SKIP')} skipped`)
process.exit(n('FAIL') ? 1 : 0)
