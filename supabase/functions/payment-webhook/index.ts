import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { FAIL_RESULTS, fetchStatus, json, notificationUrl, serviceClient, verifyWebhook } from './upayments.ts'

// UPayments -> VORA. Deployed with verify_jwt = false (the provider has no Supabase JWT); authenticity comes from the HMAC signature.
// The webhook body is only a HINT: the outcome that is applied always comes from a fresh server-to-server lookup.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const raw = await req.text()
  if (raw.length > 20000) return json(413, { error: 'too_large' })

  const v = await verifyWebhook(raw, req.headers, notificationUrl())
  if (!v.ok) { console.warn('webhook rejected:', v.reason); return json(401, { error: 'invalid_signature', reason: v.reason }) }

  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return json(400, { error: 'invalid_json' }) }
  const hintOrder = String(body.requested_order_id ?? body.order_id ?? '')
  const track = body.track_id ? String(body.track_id) : null
  const db = serviceClient()

  // find OUR attempt: its id was sent to the provider as order.id / reference
  let attempt: any = null
  if (/^[0-9a-f-]{36}$/i.test(hintOrder)) attempt = (await db.from('payment_attempts').select('*').eq('id', hintOrder).maybeSingle()).data
  if (!attempt && track) attempt = (await db.from('payment_attempts').select('*').eq('provider_track_id', track).maybeSingle()).data
  if (!attempt) { console.warn('webhook for unknown attempt', hintOrder, track); return json(404, { error: 'unknown_attempt' }) }

  let verified
  try { verified = await fetchStatus({ trackId: track, sessionId: track ? null : attempt.provider_session_id }) }
  catch (e) { console.error('provider lookup failed', (e as Error).message); return json(502, { error: 'verification_unavailable' }) }   // provider retries; nothing is applied
  if (!verified.found) {
    await db.rpc('payment_log', { p_attempt: attempt.id, p_booking: attempt.booking_id, p_source: 'webhook', p_result: String(body.result ?? ''), p_outcome: 'rejected_unverifiable', p_details: { track } })
    return json(422, { error: 'unverifiable' })
  }
  if (verified.reference !== attempt.id) {
    await db.rpc('payment_log', { p_attempt: attempt.id, p_booking: attempt.booking_id, p_source: 'webhook', p_result: verified.result, p_outcome: 'rejected_reference_mismatch', p_details: { got: verified.reference } })
    return json(422, { error: 'reference_mismatch' })
  }
  if (verified.result !== 'CAPTURED' && !FAIL_RESULTS.includes(verified.result)) {
    await db.rpc('payment_log', { p_attempt: attempt.id, p_booking: attempt.booking_id, p_source: 'webhook', p_result: verified.result, p_outcome: 'ignored_non_terminal', p_details: {} })
    return json(200, { outcome: 'ignored_non_terminal' })
  }
  const { data, error } = await db.rpc('payment_apply', {
    p_attempt: attempt.id, p_result: verified.result, p_amount: verified.amount, p_currency: verified.currency,
    p_track: verified.trackId ?? track, p_response: { result: verified.result, track_id: verified.trackId ?? track }, p_source: 'webhook',
  })
  if (error) { console.error('payment_apply failed', error.message); return json(500, { error: 'server_error' }) }
  return json(200, data)
})
