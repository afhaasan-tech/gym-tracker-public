import { type Lang, type Persona, systemPrompt, type Tone } from './persona.ts'
import { costMicro, estimateMicro, type Provider } from './providers.ts'

export type Operation = { key: string; credits: number; enabled: boolean }
export type Route = { provider: string; model: string; max_output_tokens: number; fallback_provider?: string | null; fallback_model?: string | null }
export type Job = { id?: string; status: 'running' | 'done' | 'failed'; response_text?: string | null; operation_key: string; credits?: number }
export class CreditError extends Error { constructor(public code: string) { super(code) } }

/** Everything the orchestration needs from the outside world, so it can be tested without a network or a database. */
export interface Deps {
  mode: 'mock' | 'live'                       // from env AI_MODE; anything else = mock
  getOperation(key: string): Promise<Operation | null>
  getRoute(key: string): Promise<Route | null>
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }>
  findJob(userId: string, idem: string): Promise<Job | null>
  createJob(j: { userId: string; idem: string; operation: string; persona: Persona; language: Lang; request: string }): Promise<{ created: boolean }>
  attachReservation(userId: string, idem: string, reservationId: string): Promise<void>
  reserve(userId: string, operation: string, idem: string): Promise<{ reservationId: string; credits: number }>   // throws CreditError
  settle(reservationId: string, userId: string): Promise<void>
  release(reservationId: string, userId: string, reason: string): Promise<void>
  finishJob(userId: string, idem: string, patch: Record<string, unknown>): Promise<void>
  budgetAuthorize(estimateMicro: number): Promise<boolean>
  budgetSettle(estimateMicro: number, actualMicro: number): Promise<void>
  provider(name: string): Provider | null
  trusted(): Promise<boolean>                 // is_trusted_session() evaluated by the database with the caller's own JWT
  timeoutMs?: number
}
export type Out = { status: number; body: Record<string, unknown> }
const UUIDISH = /^[A-Za-z0-9_-]{8,80}$/
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
const PERSONAS = ['rashid', 'sarah'], LANGS = ['ar', 'en'], TONES = ['friendly', 'direct', 'playful']

export async function handleCoach(d: Deps, userId: string, body: Record<string, unknown> | null): Promise<Out> {
  // ---- 0. a valid JWT is not enough: the session must be the user's single active, device-verified session
  if (!(await d.trusted())) return { status: 403, body: { error: 'device_not_trusted' } }
  // ---- 1. validate (never trust the browser)
  const operation = typeof body?.operation === 'string' ? body.operation : ''
  const message = typeof body?.message === 'string' ? clean(body.message) : ''
  const persona = (typeof body?.persona === 'string' ? body.persona : 'rashid') as Persona
  const language = (typeof body?.language === 'string' ? body.language : 'ar') as Lang
  const tone = (typeof body?.tone === 'string' ? body.tone : 'friendly') as Tone
  const idem = typeof body?.idempotency_key === 'string' ? body.idempotency_key : ''
  const confirm = typeof body?.confirm_credits === 'number' ? body.confirm_credits : NaN
  if (!message || message.length > 2000) return { status: 400, body: { error: 'invalid_message' } }
  if (!PERSONAS.includes(persona) || !LANGS.includes(language) || !TONES.includes(tone)) return { status: 400, body: { error: 'invalid_options' } }
  if (!UUIDISH.test(idem)) return { status: 400, body: { error: 'invalid_idempotency_key' } }
  const op = await d.getOperation(operation)
  if (!op || !op.enabled) return { status: 400, body: { error: 'unknown_operation' } }
  const route = await d.getRoute(operation)
  if (!route) return { status: 503, body: { error: 'ai_unavailable' } }

  // ---- 2. the member must confirm the exact server-side cost
  if (confirm !== op.credits) return { status: 409, body: { error: 'confirmation_required', operation, credits: op.credits } }

  // ---- 3. replay / in-flight protection (a retry or double click never calls the provider twice)
  const existing = await d.findJob(userId, idem)
  if (existing) return replay(existing, op.credits)

  // ---- 4. abuse limits
  for (const [bucket, limit, win] of [[`ai-min:${userId}`, 12, 60], [`ai-day:${userId}`, 300, 86400]] as const) {
    const r = await d.rateLimit(bucket, limit, win)
    if (!r.allowed) return { status: 429, body: { error: 'rate_limited', retry_after: r.retryAfter } }
  }

  // ---- 5. reserve credits (atomic in the database), then record the job
  let reservation: { reservationId: string; credits: number }
  try { reservation = await d.reserve(userId, operation, idem) }
  catch (e) {
    const code = e instanceof CreditError ? e.code : ''
    if (code === 'PC001') return { status: 402, body: { error: 'insufficient_credits', credits: op.credits } }
    if (code === 'PC003') return { status: 400, body: { error: 'unknown_operation' } }
    if (code === 'PC004') return { status: 409, body: { error: 'idempotency_key_reused' } }
    return { status: 500, body: { error: 'server_error' } }
  }
  if (reservation.credits !== op.credits) { await d.release(reservation.reservationId, userId, 'price_changed'); return { status: 409, body: { error: 'confirmation_required', operation, credits: reservation.credits } } }
  const made = await d.createJob({ userId, idem, operation, persona, language, request: message })
  if (!made.created) { const j = await d.findJob(userId, idem); return j ? replay(j, op.credits) : { status: 409, body: { error: 'in_progress' } } }
  await d.attachReservation(userId, idem, reservation.reservationId)

  const fail = async (code: string, status: number, reason: string): Promise<Out> => {
    await d.release(reservation.reservationId, userId, reason)           // confirmed failure: the credits go back
    await d.finishJob(userId, idem, { status: 'failed', error_code: code, finished_at: new Date().toISOString() })
    return { status, body: { error: code } }
  }

  // ---- 6. choose provider: mock mode always uses the mock; live mode fails CLOSED (never a silent mock for paid users)
  const system = systemPrompt(persona, tone, language, operation)
  const attempts: Array<{ provider: string; model: string }> = d.mode === 'live'
    ? [{ provider: route.provider, model: route.model }, ...(route.fallback_provider && route.fallback_model ? [{ provider: route.fallback_provider, model: route.fallback_model }] : [])]
    : [{ provider: 'mock', model: 'mock-model' }]
  let lastErr = 'provider_failed'
  for (const a of attempts) {
    const prov = d.provider(a.provider)
    if (!prov) { lastErr = 'provider_not_configured'; continue }
    const isLive = a.provider !== 'mock'
    let est = 0
    if (isLive) {
      try { est = estimateMicro(a.model, system, message, route.max_output_tokens) } catch { lastErr = 'unpriced_model'; continue }
      if (!(await d.budgetAuthorize(est))) { lastErr = 'budget_blocked'; continue }
    }
    const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), d.timeoutMs ?? 25000)
    try {
      const r = await prov.call({ system, user: message, model: a.model, maxTokens: route.max_output_tokens, signal: ctl.signal })
      clearTimeout(timer)
      const text = r.text.trim()
      if (!text) { if (isLive) await d.budgetSettle(est, costMicro(a.model, r.inputTokens, r.outputTokens)); lastErr = 'empty_response'; continue }
      const cost = isLive ? costMicro(a.model, r.inputTokens, r.outputTokens) : 0
      if (isLive) await d.budgetSettle(est, cost)
      await d.settle(reservation.reservationId, userId)                  // charge only after the answer exists
      await d.finishJob(userId, idem, { status: 'done', response_text: text, provider: a.provider, model: a.model, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd_micro: cost, latency_ms: Date.now() - t0, finished_at: new Date().toISOString() })
      return { status: 200, body: { text, credits_charged: op.credits, mock: a.provider === 'mock', replay: false } }
    } catch (e) {
      clearTimeout(timer)
      if (isLive) await d.budgetSettle(est, 0)                           // nothing proven spent: free the estimate
      lastErr = ctl.signal.aborted ? 'provider_timeout' : 'provider_failed'
      void e
    }
  }
  return fail(lastErr === 'budget_blocked' ? 'ai_unavailable' : lastErr === 'provider_timeout' ? 'ai_timeout' : 'ai_unavailable', lastErr === 'provider_timeout' ? 504 : 503, lastErr)
}

function replay(j: Job, credits: number): Out {
  if (j.status === 'done') return { status: 200, body: { text: j.response_text, credits_charged: credits, replay: true } }
  if (j.status === 'running') return { status: 409, body: { error: 'in_progress' } }
  return { status: 409, body: { error: 'previous_attempt_failed' } }       // credits were released; the client must use a new key
}
