import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json, resolveAttempt, serviceClient } from './upayments.ts'

// Safe to call by anyone: outcomes come ONLY from the provider's own answer (or from time passing on an already-overdue checkout).
//  { sweep: true }        scheduler: resolves overdue open checkouts. Throttled inside the database (payment_sweep_gate) so
//                         spamming it cannot exhaust the provider's rate limit.
//  { booking_id } + JWT   a signed-in member refreshes THEIR OWN booking after returning from checkout (never expires early).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const db = serviceClient()
  const body = await req.json().catch(() => ({}))

  if (body?.sweep === true) {
    const { data: allowed } = await db.rpc('payment_sweep_gate')
    if (!allowed) return json(200, { skipped: 'throttled' })
    const { data: list, error } = await db.rpc('payment_overdue', { p_limit: 15 })
    if (error) return json(500, { error: 'server_error' })
    const outcomes: Record<string, string> = {}
    for (const a of list ?? []) outcomes[a.id] = await resolveAttempt(db, a, 'reconcile', true)
    return json(200, { processed: Object.keys(outcomes).length, outcomes })
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
  for (const a of list ?? []) if (a.provider_session_id || a.provider_track_id) outcomes.push(await resolveAttempt(db, a, 'reconcile', false))
  const { data: fresh } = await userClient.from('bookings').select('payment_status').eq('id', bookingId).maybeSingle()
  return json(200, { payment_status: fresh?.payment_status ?? mine.payment_status, outcomes })
})
