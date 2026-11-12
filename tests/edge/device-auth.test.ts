// deno test --allow-env tests/edge/device-auth.test.ts
import { type Deps, handleDevice, mailText } from '../../supabase/functions/device-auth/core.ts'
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`) }
const U = '11111111-1111-4111-8111-111111111111', S = '22222222-2222-4222-8222-222222222222', SECRET = 'A'.repeat(40)
function mk(o: { trusted?: boolean; status?: 'trusted' | 'challenge_required'; verify?: boolean; allow?: boolean; challenge?: string | null; mailFails?: boolean } = {}) {
  const log = { mails: [] as string[], revoked: 0, revokedDevices: [] as string[], created: [] as string[], rate: [] as string[] }
  const d: Deps = {
    hash: (s) => Promise.resolve('h:' + s.length), randomCode: () => '042917',
    deviceStatus: () => Promise.resolve(o.status ?? 'challenge_required'),
    createChallenge: (_u, _h, code) => { log.created.push(code); return Promise.resolve(o.challenge === undefined ? 'cid' : o.challenge) },
    verifyChallenge: () => Promise.resolve(o.verify ?? false),
    revokeDevice: (_u, id) => { log.revokedDevices.push(id); return Promise.resolve() },
    listDevices: () => Promise.resolve([{ id: 'x', label: 'iPhone' }]),
    isTrusted: () => Promise.resolve(o.trusted ?? false),
    rateLimit: (b) => { log.rate.push(b); return Promise.resolve(o.allow ?? true) },
    sendMail: (to, _s, t) => { if (o.mailFails) return Promise.reject(new Error('smtp down')); log.mails.push(to + '|' + t); return Promise.resolve() },
    revokeOtherSessions: () => { log.revoked++; return Promise.resolve() },
  }
  return { d, log, ctx: { userId: U, email: 'u@example.test', sessionId: S } }
}
Deno.test('unknown device => challenge_required, other sessions untouched', async () => {
  const { d, log, ctx } = mk(); const r = await handleDevice(d, ctx, { action: 'status', device_secret: SECRET }); eq(r, { status: 200, body: { state: 'challenge_required' } }, 'status'); eq(log.revoked, 0, 'no revoke')
})
Deno.test('trusted device => trusted AND all other sessions are signed out (single active session)', async () => {
  const { d, log, ctx } = mk({ status: 'trusted' }); const r = await handleDevice(d, ctx, { action: 'status', device_secret: SECRET }); eq(r.body.state, 'trusted', 'trusted'); eq(log.revoked, 1, 'others revoked')
})
Deno.test('send_code: code goes ONLY into the e-mail, never into the response', async () => {
  const { d, log, ctx } = mk(); const r = await handleDevice(d, ctx, { action: 'send_code', device_secret: SECRET, language: 'en' })
  eq(r.status, 200, 'sent'); if (JSON.stringify(r.body).includes('042917')) throw new Error('code leaked in response')
  eq(log.mails.length, 1, 'one mail'); if (!log.mails[0].includes('042917')) throw new Error('mail lacks the code'); eq(log.mails[0].startsWith('u@example.test|'), true, 'sent to the verified address')
})
Deno.test('send_code is rate limited at the app layer and by the database; mail failure is a safe 503', async () => {
  eq((await handleDevice(mk({ allow: false }).d, mk().ctx, { action: 'send_code', device_secret: SECRET })).status, 429, 'app limiter')
  eq((await handleDevice(mk({ challenge: null }).d, mk().ctx, { action: 'send_code', device_secret: SECRET })).status, 429, 'db limiter (NULL)')
  const m = mk({ mailFails: true }); const r = await handleDevice(m.d, m.ctx, { action: 'send_code', device_secret: SECRET }); eq(r.status, 503, 'mail down'); if (JSON.stringify(r.body).includes('smtp')) throw new Error('internal error leaked')
})
Deno.test('verify_code: success revokes other sessions; every failure is the SAME generic 401', async () => {
  const ok = mk({ verify: true }); const r = await handleDevice(ok.d, ok.ctx, { action: 'verify_code', device_secret: SECRET, code: '042917', label: 'Safari' }); eq(r.body.state, 'trusted', 'trusted'); eq(ok.log.revoked, 1, 'others revoked')
  const bad = mk({ verify: false }); const f = await handleDevice(bad.d, bad.ctx, { action: 'verify_code', device_secret: SECRET, code: '000000' }); eq(f, { status: 401, body: { error: 'invalid_or_expired_code' } }, 'generic'); eq(bad.log.revoked, 0, 'no revoke on failure')
  for (const c of ['12345', '1234567', 'abcdef', '', undefined]) eq((await handleDevice(bad.d, bad.ctx, { action: 'verify_code', device_secret: SECRET, code: c })).status, 400, 'format ' + c)
})
Deno.test('verify attempts are rate limited per user', async () => { const m = mk({ allow: false, verify: true }); eq((await handleDevice(m.d, m.ctx, { action: 'verify_code', device_secret: SECRET, code: '042917' })).status, 429, 'limited') })
Deno.test('device secret must be a long random token (no short/odd values)', async () => {
  const { d, ctx } = mk(); for (const s of ['', 'short', 'x'.repeat(200), 'bad chars !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', 5, null]) eq((await handleDevice(d, ctx, { action: 'status', device_secret: s })).status, 400, 'secret ' + String(s).slice(0, 8))
})
Deno.test('list/revoke require a TRUSTED session', async () => {
  const u = mk({ trusted: false }); eq((await handleDevice(u.d, u.ctx, { action: 'list_devices' })).status, 403, 'list untrusted'); eq((await handleDevice(u.d, u.ctx, { action: 'revoke_device', device_id: '33333333-3333-4333-8333-333333333333' })).status, 403, 'revoke untrusted'); eq(u.log.revokedDevices.length, 0, 'nothing revoked')
  const t = mk({ trusted: true }); eq((await handleDevice(t.d, t.ctx, { action: 'list_devices' })).status, 200, 'list trusted'); eq((await handleDevice(t.d, t.ctx, { action: 'revoke_device', device_id: '33333333-3333-4333-8333-333333333333' })).status, 200, 'revoke trusted'); eq(t.log.revokedDevices.length, 1, 'revoked')
  eq((await handleDevice(t.d, t.ctx, { action: 'revoke_device', device_id: 'not-a-uuid' })).status, 400, 'bad id')
})
Deno.test('invalid session id / unknown action', async () => {
  const { d, ctx } = mk(); eq((await handleDevice(d, { ...ctx, sessionId: 'nope' }, { action: 'status', device_secret: SECRET })).status, 401, 'bad session'); eq((await handleDevice(d, ctx, { action: 'drop_tables' })).status, 400, 'unknown'); eq((await handleDevice(d, ctx, null)).status, 400, 'null')
})
Deno.test('mail text: both languages, code present, no marketing, warns about sharing', () => {
  for (const l of ['ar', 'en'] as const) { const m = mailText('123456', l); if (!m.text.includes('123456') || !m.subject) throw new Error('mail ' + l) }
  if (!mailText('1', 'en').text.includes('Never share')) throw new Error('no warning')
})
