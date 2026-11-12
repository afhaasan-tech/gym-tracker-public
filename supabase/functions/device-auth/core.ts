// Trusted-device flow orchestration. Pure (all I/O injected) so it can be tested without a network.
// Security rules: the 6-digit code is generated here with a CSPRNG, stored only as a keyed hash in the database, sent ONLY by e-mail and
// never returned to the caller; every failure answer is generic; only a trusted session may list/revoke devices.
export interface Deps {
  hash(secret: string): Promise<string>                                         // sha256 hex of the client-held device secret
  randomCode(): string                                                          // 6 digits, uniform
  deviceStatus(userId: string, deviceHash: string, sessionId: string): Promise<'trusted' | 'challenge_required'>
  createChallenge(userId: string, deviceHash: string, code: string): Promise<string | null>
  verifyChallenge(userId: string, deviceHash: string, code: string, sessionId: string, label: string): Promise<boolean>
  revokeDevice(userId: string, deviceId: string): Promise<void>
  listDevices(): Promise<unknown[]>
  isTrusted(): Promise<boolean>
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<boolean>   // true = allowed
  sendMail(to: string, subject: string, text: string): Promise<void>
  revokeOtherSessions(): Promise<void>
}
export type Ctx = { userId: string; email: string; sessionId: string }
export type Out = { status: number; body: Record<string, unknown> }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SAFE_SECRET = /^[A-Za-z0-9_-]{32,128}$/

export function mailText(code: string, lang: 'ar' | 'en'): { subject: string; text: string } {
  return lang === 'ar'
    ? { subject: 'رمز تأكيد الجهاز – ڤورا', text: `رمز التأكيد: ${code}\nصالح لمدة 10 دقائق. إذا ما كنت أنت اللي حاول يسجل دخول، تجاهل الرسالة وغيّر كلمة السر.\nلا تشارك هذا الرمز مع أي شخص.` }
    : { subject: 'Your VORA device verification code', text: `Your verification code: ${code}\nIt is valid for 10 minutes. If this was not you, ignore this e-mail and change your password.\nNever share this code with anyone.` }
}

export async function handleDevice(d: Deps, c: Ctx, body: Record<string, unknown> | null): Promise<Out> {
  if (!UUID.test(c.sessionId) || !UUID.test(c.userId)) return { status: 401, body: { error: 'invalid_session' } }
  const action = typeof body?.action === 'string' ? body.action : ''
  const secret = typeof body?.device_secret === 'string' ? body.device_secret : ''
  const needsSecret = ['status', 'send_code', 'verify_code'].includes(action)
  if (needsSecret && !SAFE_SECRET.test(secret)) return { status: 400, body: { error: 'invalid_device' } }
  const deviceHash = needsSecret ? await d.hash(secret) : ''

  if (action === 'status') {
    const s = await d.deviceStatus(c.userId, deviceHash, c.sessionId)
    if (s === 'trusted') await d.revokeOtherSessions()                       // single active session
    return { status: 200, body: { state: s } }
  }
  if (action === 'send_code') {
    if (!(await d.rateLimit(`dev-send:${c.userId}`, 3, 600)) || !(await d.rateLimit(`dev-send-day:${c.userId}`, 10, 86400))) return { status: 429, body: { error: 'too_many_requests' } }
    const code = d.randomCode()
    const id = await d.createChallenge(c.userId, deviceHash, code)
    if (!id) return { status: 429, body: { error: 'too_many_requests' } }
    const lang = body?.language === 'en' ? 'en' : 'ar'
    const m = mailText(code, lang)
    try { await d.sendMail(c.email, m.subject, m.text) } catch { return { status: 503, body: { error: 'mail_unavailable' } } }
    return { status: 200, body: { sent: true, expires_in: 600 } }             // NEVER the code
  }
  if (action === 'verify_code') {
    if (!(await d.rateLimit(`dev-verify:${c.userId}`, 10, 600))) return { status: 429, body: { error: 'too_many_requests' } }
    const code = typeof body?.code === 'string' ? body.code.trim() : ''
    if (!/^[0-9]{6}$/.test(code)) return { status: 400, body: { error: 'invalid_code_format' } }
    const label = typeof body?.label === 'string' ? body.label.slice(0, 60) : ''
    const ok = await d.verifyChallenge(c.userId, deviceHash, code, c.sessionId, label)
    if (!ok) return { status: 401, body: { error: 'invalid_or_expired_code' } }  // same answer for wrong / expired / used / burned
    await d.revokeOtherSessions()
    return { status: 200, body: { state: 'trusted' } }
  }
  if (action === 'list_devices' || action === 'revoke_device') {
    if (!(await d.isTrusted())) return { status: 403, body: { error: 'device_not_trusted' } }
    if (action === 'list_devices') return { status: 200, body: { devices: await d.listDevices() } }
    const id = typeof body?.device_id === 'string' ? body.device_id : ''
    if (!UUID.test(id)) return { status: 400, body: { error: 'invalid_device_id' } }
    await d.revokeDevice(c.userId, id)                                        // scoped to the caller's own user id in SQL
    return { status: 200, body: { revoked: true } }
  }
  return { status: 400, body: { error: 'unknown_action' } }
}
