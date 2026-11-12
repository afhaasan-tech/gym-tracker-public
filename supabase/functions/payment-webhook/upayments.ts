// UPayments SANDBOX client (https://developers.upayments.com). Sandbox only: any other API host is refused.
// Credentials come from Supabase secrets (UPAYMENTS_API_KEY, UPAYMENTS_HMAC_SECRET); they never reach the browser.
export const SANDBOX_BASE = 'https://sandboxapi.upayments.com/api/v1/'

const env = (k: string) => Deno.env.get(k) ?? ''
export function apiBase(): string {
  const b = env('UPAYMENTS_BASE') || SANDBOX_BASE
  if (new URL(b).host !== 'sandboxapi.upayments.com') throw new Error('refusing to use a non-sandbox payment API')
  return b.endsWith('/') ? b : b + '/'
}

const enc = new TextEncoder()
export async function hmacB64(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)))
  let s = ''; for (const b of sig) s += String.fromCharCode(b)
  return btoa(s)
}
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

async function call(method: 'GET' | 'POST', path: string, body?: string): Promise<{ status: number; json: any }> {
  const key = env('UPAYMENTS_API_KEY'), secret = env('UPAYMENTS_HMAC_SECRET')
  if (!key || !secret) throw new Error('payment gateway is not configured')
  const ts = Math.floor(Date.now() / 1000).toString()
  const sigPath = path.split('?')[0].startsWith('get-payment-status') ? path : path   // documented: relative path after /api/v1/
  const signature = await hmacB64(secret, ts + method + sigPath + (body ?? ''))
  const res = await fetch(apiBase() + path, {
    method, body,
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json', 'Content-Type': 'application/json', 'X-Timestamp': ts, 'X-Signature': signature },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()
  let json: any = null; try { json = JSON.parse(text) } catch { /* non-JSON error page */ }
  return { status: res.status, json }
}

/** UPayments limits reference.id to 35 chars, so our 36-char UUID is sent without dashes (32 hex) and mapped back on the way in. */
export const compact = (id: string) => id.replace(/-/g, '')
export const expand = (h: string) => /^[0-9a-f]{32}$/i.test(h) ? `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toLowerCase() : ''

export type Charge = { link: string; sessionId: string | null; raw: unknown }
/** Hosted checkout. amount is KWD, already server-derived; order id/reference = our attempt id (unique, also our idempotency key). */
export async function createCharge(p: { attemptId: string; amountKwd: number; description: string; language: 'ar' | 'en'; returnUrl: string; cancelUrl: string; notificationUrl: string; expiryMinutes: number }): Promise<Charge> {
  const body = JSON.stringify({
    order: { id: compact(p.attemptId), reference: compact(p.attemptId), description: p.description.slice(0, 450), currency: 'KWD', amount: Number(p.amountKwd.toFixed(3)) },
    language: p.language, reference: { id: compact(p.attemptId) },
    customer: { name: 'VORA member' },
    returnUrl: p.returnUrl, cancelUrl: p.cancelUrl, notificationUrl: p.notificationUrl,
    paymentLinkExpiryInMinutes: p.expiryMinutes,
  })
  const r = await call('POST', 'charge', body)
  const link = r.json?.data?.link
  if (!(r.status >= 200 && r.status < 300) || r.json?.status !== true || typeof link !== 'string' || !link.startsWith('https://')) {
    throw new Error('gateway rejected the checkout request (HTTP ' + r.status + ')')
  }
  let sessionId: string | null = null
  try { sessionId = new URL(link).searchParams.get('session_id') } catch { /* ignore */ }
  return { link, sessionId, raw: r.json }
}

export type Verified = { found: boolean; terminal: boolean; result: string; amount: number | null; currency: string; reference: string; trackId: string | null; raw: unknown }
/** Authoritative server-to-server lookup. */
export async function fetchStatus(by: { trackId?: string | null; sessionId?: string | null }): Promise<Verified> {
  const path = by.trackId ? 'get-payment-status/' + encodeURIComponent(by.trackId) : by.sessionId ? 'get-payment-status?session_id=' + encodeURIComponent(by.sessionId) : ''
  if (!path) throw new Error('no provider identifier')
  const r = await call('GET', path)
  const t = r.json?.data?.transaction
  if (!t) return { found: false, terminal: false, result: 'UNKNOWN', amount: null, currency: '', reference: '', trackId: null, raw: r.json }
  const amount = Number(t.total_price ?? t.total_paid_non_kwd)
  return {
    // an unpaid checkout reports result 'NOT CAPTURED' with status 'PENDING' and no track_id: that is NOT a decline
    found: true, terminal: Boolean(t.track_id) || String(t.status ?? '').toLowerCase() === 'done', result: String(t.result ?? 'UNKNOWN').toUpperCase(), amount: Number.isFinite(amount) ? amount : null,
    currency: String(t.currency_type ?? '').toUpperCase(), reference: String(t.reference ?? ''), trackId: t.track_id ? String(t.track_id) : null, raw: r.json,
  }
}

/** Webhook authenticity: X-Timestamp + X-Signature = Base64(HMAC-SHA256(secret, ts + 'POST' + FULL_NOTIFICATION_URL + raw body)). */
export async function verifyWebhook(raw: string, headers: Headers, notificationUrl: string, nowMs = Date.now()): Promise<{ ok: boolean; reason: string }> {
  const secret = env('UPAYMENTS_HMAC_SECRET')
  const sig = headers.get('x-signature') ?? '', ts = headers.get('x-timestamp') ?? ''
  if (!secret) return { ok: false, reason: 'not_configured' }
  if (!sig || !ts) return { ok: false, reason: 'missing_signature' }
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(nowMs / 1000 - tsNum) > 300) return { ok: false, reason: 'stale_timestamp' }
  const expected = await hmacB64(secret, ts + 'POST' + notificationUrl + raw)
  return safeEqual(expected, sig) ? { ok: true, reason: 'ok' } : { ok: false, reason: 'bad_signature' }
}

export const FAIL_RESULTS = ['NOT CAPTURED', 'CANCELED', 'CANCELLED', 'FAILED', 'ERROR', 'DECLINED']

// ---- small shared helpers
import { createClient } from 'jsr:@supabase/supabase-js@2'
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lang',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
export const serviceClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
export const appUrl = () => (Deno.env.get('APP_URL') || 'https://gym-tracker-afhaasan.vercel.app').replace(/\/$/, '')
/** The exact public URL that is sent as notificationUrl and signed over (UPayments signs the FULL notification URL). */
export const notificationUrl = () => (Deno.env.get('SUPABASE_URL')! + '/functions/v1/payment-webhook')

/** Asks the provider about one attempt and applies ONLY a provider-confirmed outcome (or, when allowed and due, expires it). */
export async function resolveAttempt(db: ReturnType<typeof serviceClient>, a: any, source: string, mayExpire: boolean): Promise<string> {
  let st: Verified | null = null
  try { st = (a.provider_track_id || a.provider_session_id) ? await fetchStatus({ trackId: a.provider_track_id, sessionId: a.provider_session_id }) : null } catch (e) { console.error('lookup failed', (e as Error).message); if (mayExpire) return 'unchanged_provider_unreachable' }
  if (st?.found && st.reference === compact(a.id) && (st.result === 'CAPTURED' || (st.terminal && FAIL_RESULTS.includes(st.result)))) {
    const r = await db.rpc('payment_apply', { p_attempt: a.id, p_result: st.result, p_amount: st.amount, p_currency: st.currency, p_track: st.trackId, p_response: { result: st.result }, p_source: source })
    return r.data?.outcome ?? 'error'
  }
  if (mayExpire) {   // provider confirms nothing was captured (unknown / still pending past our expiry): abandon it
    const r = await db.rpc('payment_apply', { p_attempt: a.id, p_result: 'EXPIRED', p_amount: null, p_currency: null, p_track: null, p_response: {}, p_source: source })
    return r.data?.outcome ?? 'error'
  }
  return 'unchanged'
}
