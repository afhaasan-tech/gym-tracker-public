import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { type Deps, handleDevice } from './core.ts'
import { sendMail } from './mailer.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const b64 = (s: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return json(401, { error: 'login_required' })
  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: u, error } = await userClient.auth.getUser(token)          // fails for revoked / expired sessions
  if (error || !u?.user) return json(401, { error: 'login_required' })
  if (!u.user.email_confirmed_at || !u.user.email) return json(403, { error: 'email_not_verified' })
  let sessionId = ''
  try { sessionId = String(b64(token.split('.')[1]).session_id ?? '') } catch { /* invalid */ }
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()

  const deps: Deps = {
    async hash(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('') },
    randomCode() { for (;;) { const b = crypto.getRandomValues(new Uint32Array(1))[0]; if (b < 4_000_000_000) return String(b % 1_000_000).padStart(6, '0') } },   // rejection sampling: uniform
    async deviceStatus(uid, h, sid) { const { data } = await db.rpc('device_status', { p_user: uid, p_device_hash: h, p_session: sid }); return data === 'trusted' ? 'trusted' : 'challenge_required' },
    async createChallenge(uid, h, code) { const { data, error: e } = await db.rpc('device_challenge_create', { p_user: uid, p_device_hash: h, p_code: code }); if (e) throw new Error('challenge_failed'); return data ?? null },
    async verifyChallenge(uid, h, code, sid, label) { const { data } = await db.rpc('device_challenge_verify', { p_user: uid, p_device_hash: h, p_code: code, p_session: sid, p_label: label }); return data === true },
    async revokeDevice(uid, id) { await db.rpc('device_revoke', { p_user: uid, p_device: id }) },
    async listDevices() { const { data } = await userClient.from('trusted_devices').select('id,label,created_at,last_seen_at,revoked_at').order('created_at'); return data ?? [] },
    async isTrusted() { const { data } = await userClient.rpc('is_trusted_session'); return data === true },
    async rateLimit(bucket, limit, win) {
      const b = ip ? [bucket, `${bucket.split(':')[0]}-ip:${ip}`] : [bucket]
      for (const k of b) { const { data } = await db.rpc('rate_limit_hit', { p_bucket: k, p_limit: limit * (k === bucket ? 1 : 3), p_window: `${win} seconds` }); const r = Array.isArray(data) ? data[0] : data; if (!r?.allowed) return false }
      return true
    },
    sendMail: (to, subject, text) => sendMail(db, to, subject, text),
    async revokeOtherSessions() { await db.auth.admin.signOut(token, 'others') },
  }
  const body = await req.json().catch(() => null)
  try { const out = await handleDevice(deps, { userId: u.user.id, email: u.user.email, sessionId }, body); return json(out.status, out.body) }
  catch (e) { console.error('device-auth error', (e as Error).message); return json(500, { error: 'server_error' }) }
})
