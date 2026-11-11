import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, fetchStatus, FAIL_RESULTS, json, safeEqual, serviceClient } from './upayments.ts'

// Two callers, both server-verified against the provider:
//  1) scheduler (x-cron-secret): resolves every OVERDUE open checkout -> captured / failed / expired.
//  2) a signed-in member (JWT, { booking_id }): refreshes THEIR OWN booking after returning from checkout (never expires early).
async function resolve(db: ReturnType<typeof serviceClient>, a: any, source: string, mayExpire: boolean) {
  let st = null
  try { st = (a.provider_track_id || a.provider_session_id) ? await fetchStatus({ trackId: a.provider_track_id, sessionId: a.provider_session_id }) : null } catch (e) { console.error('lookup failed', (e as Error).message) }
  if (st?.found && st.reference === a.id && (st.result === 'CAPTURED' || FAIL_RESULTS.includes(st.result))) {
    const r = await db.rpc('payment_apply', { p_attempt: a.id, p_result: st.result, p_amount: st.amount, p_currency: st.currency, p_track: st.trackId, p_response: { result: st.result }, p_source: source })
    return r.data?.outcome ?? 'error'
  }
  if (mayExpire && !st?.found || (mayExpire && st && !['CAPTURED', ...FAIL_RESULTS].includes(st.result))) {
    const r = await db.rpc('payment_apply', { p_attempt: a.id, p_result: 'EXPIRED', p_amount: null, p_currency: null, p_track: null, p_response: {}, p_source: source })
    return r.data?.outcome ?? 'error'
  }
  return 'unchanged'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const db = serviceClient()
  const secret = Deno.env.get('PAYMENT_CRON_SECRET') ?? ''
  const given = req.headers.get('x-cron-secret') ?? ''
  const isCron = secret.length >= 24 && given.length > 0 && safeEqual(given, secret)
  const body = await req.json().catch(() => ({}))

  if (isCron) {
    if (typeof body?.internal_booking === 'string') {   // used by initiate-payment before allowing a new attempt
      const { data: list } = await db.from('payment_attempts').select('*').eq('booking_id', body.internal_booking).in('status', ['created', 'checkout_ready']).lt('expires_at', new Date().toISOString())
      const out = []; for (const a of list ?? []) out.push(await resolve(db, a, 'reconcile', true))
      return json(200, { resolved: out })
    }
    const { data: list, error } = await db.rpc('payment_overdue', { p_limit: 20 })
    if (error) return json(500, { error: 'server_error' })
    const out: Record<string, string> = {}
    for (const a of list ?? []) out[a.id] = await resolve(db, a, 'reconcile', true)
    return json(200, { processed: Object.keys(out).length, outcomes: out })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'unauthorized' })
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: u } = await userClient.auth.getUser()
  if (!u?.user) return json(401, { error: 'unauthorized' })
  const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : ''
  const { data: mine } = await userClient.from('bookings').select('id,payment_status').eq('id', bookingId).maybeSingle()   // RLS: own bookings only
  if (!mine) return json(404, { error: 'booking_not_found' })
  const { data: list } = await db.from('payment_attempts').select('*').eq('booking_id', bookingId).in('status', ['created', 'checkout_ready', 'expired', 'failed']).order('created_at', { ascending: false }).limit(3)
  const outcomes = []
  for (const a of list ?? []) if (a.provider_session_id || a.provider_track_id) outcomes.push(await resolve(db, a, 'reconcile', false))
  const { data: fresh } = await userClient.from('bookings').select('payment_status').eq('id', bookingId).maybeSingle()
  return json(200, { payment_status: fresh?.payment_status ?? mine.payment_status, outcomes })
})
