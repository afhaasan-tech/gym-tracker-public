import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { appUrl, corsHeaders, createCharge, json, notificationUrl, resolveAttempt, serviceClient } from './upayments.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The browser sends ONLY { booking_id }. Amount, currency and status are never read from the request.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'login_required' })
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const { data: u, error: uerr } = await userClient.auth.getUser()
  if (uerr || !u?.user) return json(401, { error: 'login_required' })
  const user = u.user
  if (!user.email_confirmed_at) return json(403, { error: 'email_not_verified' })

  const body = await req.json().catch(() => null)
  const bookingId = typeof body?.booking_id === 'string' ? body.booking_id : ''
  if (!UUID.test(bookingId)) return json(400, { error: 'booking_id_required' })
  const db = serviceClient()

  // payment_start: locks the booking, checks owner / status / price, and creates at most ONE open attempt (DB-enforced).
  const start = async () => db.rpc('payment_start', { p_booking: bookingId, p_user: user.id })
  let { data, error } = await start()
  if (error?.code === 'PA004') {
    // an older checkout is past its expiry: ask the provider before allowing a new one (it may have been paid)
    const { data: stale } = await db.from('payment_attempts').select('*').eq('booking_id', bookingId).in('status', ['created', 'checkout_ready']).lt('expires_at', new Date().toISOString())
    for (const a of stale ?? []) await resolveAttempt(db, a, 'reconcile', true)
    ;({ data, error } = await start())
  }
  if (error) {
    const map: Record<string, [number, string]> = { PA001: [404, 'booking_not_found'], PA002: [422, 'not_payable'], PA003: [409, 'already_paid'], PA004: [409, 'verifying_previous_payment'] }
    const m = map[error.code ?? '']
    if (m) return json(m[0], { error: m[1] })
    console.error('payment_start failed', error.code, error.message)
    return json(500, { error: 'server_error' })
  }
  const row = Array.isArray(data) ? data[0] : data
  const attemptId: string = row.o_attempt_id
  const amount = Number(row.o_amount)

  if (row.o_reused) {
    // repeated click / second tab: return the same hosted checkout, never create another one
    let url: string | null = row.o_checkout_url
    for (let i = 0; i < 16 && !url; i++) {
      await sleep(500)
      const { data: a } = await db.from('payment_attempts').select('checkout_url,status').eq('id', attemptId).maybeSingle()
      url = a?.checkout_url ?? null
      if (a && !['created', 'checkout_ready'].includes(a.status)) break
    }
    if (!url) return json(409, { error: 'checkout_in_progress' })
    return json(200, { checkout_url: url, attempt_id: attemptId, amount_kwd: amount, currency: 'KWD', reused: true })
  }

  try {
    const lang = (req.headers.get('x-lang') === 'en') ? 'en' : 'ar'
    const back = appUrl() + '/#/pay/return/' + bookingId
    const ch = await createCharge({
      attemptId, amountKwd: amount, description: 'VORA booking ' + bookingId.slice(0, 8), language: lang,
      returnUrl: back, cancelUrl: back, notificationUrl: notificationUrl(), expiryMinutes: 15,
    })
    const { error: e2 } = await db.rpc('payment_set_checkout', { p_attempt: attemptId, p_session: ch.sessionId, p_url: ch.link, p_response: { status: true, session_id: ch.sessionId } })
    if (e2) throw new Error('could not record checkout: ' + e2.message)
    return json(200, { checkout_url: ch.link, attempt_id: attemptId, amount_kwd: amount, currency: 'KWD', reused: false })
  } catch (e) {
    console.error('checkout creation failed', (e as Error).message)
    await db.rpc('payment_fail_creation', { p_attempt: attemptId, p_reason: (e as Error).message })
    return json(502, { error: 'gateway_unavailable' })
  }
})
