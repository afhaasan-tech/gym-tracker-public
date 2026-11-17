// Orchestration for the three agents (coach, nutritionist, support). Pure: every side effect is injected, so it is unit-testable
// without a network or a database. Same guarantees as ai-coach: trusted session first, exact-cost confirmation, idempotent replay,
// atomic credit reservation, charge only after a VALID answer exists, release on every failure, live providers only behind the DB budget gate.
// Message contents are never logged here.
import { type Environment, type Lang, type Persona, systemPrompt, type Tone, type Turn, userEnvelope } from './prompts.ts'
import { costMicro, estimateMicro, type Provider } from './providers.ts'
import { clean, detectInjection, MEDICAL_REFUSAL, medicalCheck } from './sanitize.ts'
import { type AgentRole, type CoachOutput, type NutritionistOutput, ROLES, type SupportOutput, TICKET_CATEGORIES, TICKET_PRIORITIES, validateOutput } from './schemas.ts'

export type Operation = { key: string; credits: number; enabled: boolean }
export type Route = { provider: string; model: string; max_output_tokens: number; fallback_provider?: string | null; fallback_model?: string | null }
export type Job = { id?: string; status: 'running' | 'done' | 'failed'; response_text?: string | null; operation_key: string }
export type TicketInput = { ref: string; category: string; priority: string; summary: string; transcript: Turn[] }
export class CreditError extends Error { constructor(public code: string) { super(code) } }

export interface Deps {
  mode: 'mock' | 'live'                       // from env AI_MODE; anything else = mock
  getOperation(key: string): Promise<Operation | null>
  getRoute(key: string): Promise<Route | null>
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }>
  findJob(userId: string, idem: string): Promise<Job | null>
  createJob(j: { userId: string; idem: string; operation: string; role: AgentRole; persona: Persona; language: Lang; request: string }): Promise<{ created: boolean }>
  attachReservation(userId: string, idem: string, reservationId: string): Promise<void>
  reserve(userId: string, operation: string, idem: string): Promise<{ reservationId: string; credits: number }>   // throws CreditError
  settle(reservationId: string, userId: string): Promise<void>
  release(reservationId: string, userId: string, reason: string): Promise<void>
  finishJob(userId: string, idem: string, patch: Record<string, unknown>): Promise<void>
  budgetAuthorize(estimateMicro: number): Promise<boolean>
  budgetSettle(estimateMicro: number, actualMicro: number): Promise<void>
  provider(name: string): Provider | null
  trusted(): Promise<boolean>                 // is_trusted_session() evaluated by the database with the caller's own JWT
  createTicket(userId: string, t: TicketInput): Promise<string>   // returns created_at (ISO); throws on failure
  randomRef?(): string
  timeoutMs?: number
}
export type Out = { status: number; body: Record<string, unknown> }

const IDEM = /^[A-Za-z0-9_-]{8,80}$/
const PERSONAS = ['rashid', 'sarah'], LANGS = ['ar', 'en'], TONES = ['friendly', 'direct', 'playful'], ENVS = ['gym', 'home']
const ALLOWED = new Set(['agent_role', 'message', 'history', 'quick_action', 'environment', 'context', 'persona', 'tone', 'language', 'idempotency_key', 'confirm_credits'])
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'      // no I, L, O, 0, 1
export function ticketRef(): string {
  const b = crypto.getRandomValues(new Uint8Array(12)); let s = ''
  for (const x of b) { if (x < 248 && s.length < 6) s += REF_ALPHABET[x % 31] }      // 248 = 8 * 31: unbiased
  while (s.length < 6) s += REF_ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % 31]
  return 'VR-' + s
}
const bad = (): Out => ({ status: 400, body: { error: 'invalid_input' } })
const optEnum = (v: unknown, allowed: string[], dflt: string): string | null => (v === undefined ? dflt : typeof v === 'string' && allowed.includes(v) ? v : null)

type Input = { role: AgentRole; message: string; history: Turn[]; quickAction?: string; environment: Environment; environmentGiven: boolean; context: { meal_name?: string; ingredient?: string }; persona: Persona; tone: Tone; language: Lang; idem: string; confirm: number }
/** Strict validation: unknown keys, wrong types or sizes are rejected. Never trust the client. */
export function parseInput(body: Record<string, unknown> | null): Input | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  for (const k of Object.keys(body)) if (!ALLOWED.has(k)) return null
  const role = body.agent_role
  if (typeof role !== 'string' || !(ROLES as readonly string[]).includes(role)) return null
  if (typeof body.message !== 'string') return null
  const message = clean(body.message)
  if (message.length < 1 || message.length > 1000) return null
  const history: Turn[] = []
  if (body.history !== undefined) {
    if (!Array.isArray(body.history) || body.history.length > 8) return null
    for (const h of body.history) {
      if (!h || typeof h !== 'object' || Array.isArray(h)) return null
      const keys = Object.keys(h)
      if (keys.length !== 2 || !keys.includes('role') || !keys.includes('text')) return null
      const t = h as { role: unknown; text: unknown }
      if ((t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string') return null
      const text = clean(t.text)
      if (text.length < 1 || text.length > 600) return null
      history.push({ role: t.role, text })
    }
  }
  let quickAction: string | undefined
  if (body.quick_action !== undefined) {
    if (typeof body.quick_action !== 'string') return null
    quickAction = clean(body.quick_action)
    if (quickAction.length < 1 || quickAction.length > 80) return null
  }
  const context: { meal_name?: string; ingredient?: string } = {}
  if (body.context !== undefined) {
    const c = body.context
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null
    for (const [k, v] of Object.entries(c)) {
      if ((k !== 'meal_name' && k !== 'ingredient') || typeof v !== 'string') return null
      const t = clean(v); if (t.length < 1 || t.length > 120) return null
      context[k as 'meal_name' | 'ingredient'] = t
    }
  }
  const environment = optEnum(body.environment, ENVS, 'gym'), persona = optEnum(body.persona, PERSONAS, 'rashid'), tone = optEnum(body.tone, TONES, 'friendly'), language = optEnum(body.language, LANGS, 'ar')
  if (!environment || !persona || !tone || !language) return null
  if (typeof body.idempotency_key !== 'string' || !IDEM.test(body.idempotency_key)) return null
  if (body.confirm_credits !== undefined && typeof body.confirm_credits !== 'number') return null
  const confirm = typeof body.confirm_credits === 'number' ? body.confirm_credits : NaN
  return { role: role as AgentRole, message, history, quickAction, environment: environment as Environment, environmentGiven: body.environment !== undefined, context, persona: persona as Persona, tone: tone as Tone, language: language as Lang, idem: body.idempotency_key, confirm }
}

const TICKET_TEXT = {
  ar: { message: (ref: string) => `تم فتح تذكرة دعم برقم ${ref}. فريق الدعم بيراجعها ويتواصل معك على إيميل حسابك.`, retention: 'نحتفظ ببيانات التذكرة والمحادثة لمدة 6 أشهر ثم تُحذف.' },
  en: { message: (ref: string) => `Support ticket ${ref} has been opened. The support team will review it and contact you on your account e-mail.`, retention: 'Ticket data and this conversation are kept for 6 months and then deleted.' },
}

export async function handleAgent(d: Deps, userId: string, body: Record<string, unknown> | null): Promise<Out> {
  // ---- 0. a valid JWT is not enough: the session must be one of the user's active, device-verified sessions
  if (!(await d.trusted())) return { status: 403, body: { error: 'device_not_trusted' } }

  // ---- 1. validate, then screen every user-controlled string (nothing is reserved or charged before this point)
  const inp = parseInput(body)
  if (!inp) return bad()
  const userTexts = [inp.message, ...inp.history.map((h) => h.text), inp.quickAction ?? '', inp.context.meal_name ?? '', inp.context.ingredient ?? '']
  if (userTexts.some((t) => detectInjection(t))) return { status: 400, body: { error: 'input_rejected' } }
  const operation = 'agent_' + inp.role
  const requestId = crypto.randomUUID()

  // ---- 2. deterministic medical pre-flight (coach / nutritionist): no provider, no credits
  const medical = inp.role === 'support' ? 'none' : medicalCheck(inp.message)
  if (medical === 'hard') {
    const lim = await d.rateLimit(`ai-min:${userId}`, 12, 60)
    if (!lim.allowed) return { status: 429, body: { error: 'rate_limited', retry_after: lim.retryAfter } }
    const t = MEDICAL_REFUSAL[inp.language]
    const base = { agent_role: inp.role, request_id: requestId, chat_reply: t.chat_reply, voice_script: t.voice_script, credits_charged: 0, mock: false, replay: false, refused: true }
    return {
      status: 200, body: inp.role === 'coach'
        ? { ...base, safety: { injury_reported: false, injured_area: null, refused: true, refusal_reason: 'medical_substances' }, workout_card: null }
        : { ...base, meal_card: null },
    }
  }

  const op = await d.getOperation(operation)
  const route = op && op.enabled ? await d.getRoute(operation) : null
  if (!op || !op.enabled || !route) return { status: 503, body: { error: 'provider_unavailable' } }

  // ---- 3. the member must confirm the exact server-side cost (0 for support)
  if (inp.confirm !== op.credits) return { status: 409, body: { error: 'confirmation_required', agent_role: inp.role, credits: op.credits } }

  // ---- 4. replay / in-flight protection (a retry or double click never calls the provider, charges or opens a ticket twice)
  const existing = await d.findJob(userId, inp.idem)
  if (existing) return replay(existing, operation)

  // ---- 5. abuse limits (the free support chat has its own, tighter buckets)
  const limits: Array<[string, number, number]> = inp.role === 'support'
    ? [[`sup-min:${userId}`, 8, 60], [`sup-day:${userId}`, 80, 86400]]
    : [[`ai-min:${userId}`, 12, 60], [`ai-day:${userId}`, 300, 86400]]
  for (const [bucket, limit, win] of limits) {
    const r = await d.rateLimit(bucket, limit, win)
    if (!r.allowed) return { status: 429, body: { error: 'rate_limited', retry_after: r.retryAfter } }
  }

  // ---- 6. reserve credits (atomic in the database; a 0-credit reservation works with an empty wallet), then record the job
  let reservation: { reservationId: string; credits: number }
  try { reservation = await d.reserve(userId, operation, inp.idem) }
  catch (e) {
    const code = e instanceof CreditError ? e.code : ''
    if (code === 'PC001') return { status: 402, body: { error: 'insufficient_credits', credits: op.credits } }
    if (code === 'PC004') return { status: 409, body: { error: 'idempotency_key_reused' } }
    return { status: 503, body: { error: 'provider_unavailable' } }
  }
  if (reservation.credits !== op.credits) { await d.release(reservation.reservationId, userId, 'price_changed'); return { status: 409, body: { error: 'confirmation_required', agent_role: inp.role, credits: reservation.credits } } }
  const made = await d.createJob({ userId, idem: inp.idem, operation, role: inp.role, persona: inp.persona, language: inp.language, request: inp.message })
  if (!made.created) { const j = await d.findJob(userId, inp.idem); return j ? replay(j, operation) : { status: 409, body: { error: 'in_progress' } } }
  await d.attachReservation(userId, inp.idem, reservation.reservationId)

  // ---- 7. provider: mock mode always uses the mock; live mode fails CLOSED (never a silent mock for paying users)
  const system = systemPrompt({ role: inp.role, persona: inp.persona, tone: inp.tone, language: inp.language, environment: inp.environment, medicalFlag: medical === 'flag' })
  const user = userEnvelope({ message: inp.message, history: inp.history, quickAction: inp.quickAction, environment: inp.role === 'coach' ? inp.environment : undefined, context: inp.context })
  const userTurns = inp.history.filter((h) => h.role === 'user').length
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
      try { est = estimateMicro(a.model, system, user, route.max_output_tokens) } catch { lastErr = 'unpriced_model'; continue }
      if (!(await d.budgetAuthorize(est))) { lastErr = 'budget_blocked'; continue }
    }
    const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), d.timeoutMs ?? 25000)
    try {
      const r = await prov.call({ system, user, model: a.model, maxTokens: route.max_output_tokens, signal: ctl.signal, meta: { role: inp.role, message: inp.message, language: inp.language, environment: inp.environment, userTurns } })
      clearTimeout(timer)
      const cost = isLive ? costMicro(a.model, r.inputTokens, r.outputTokens) : 0
      if (isLive) await d.budgetSettle(est, cost)                          // the provider was paid even if the answer is unusable
      const v = validateOutput(inp.role, r.text ?? '')
      if (!v.ok) { lastErr = 'invalid_output'; continue }                  // the member is never charged for an unusable answer

      await d.settle(reservation.reservationId, userId)                    // charge only after a valid answer exists
      const out: Record<string, unknown> = { agent_role: inp.role, request_id: requestId, chat_reply: v.data.chat_reply, voice_script: v.data.voice_script, credits_charged: op.credits, mock: a.provider === 'mock', replay: false }
      if (inp.role === 'coach') {
        const c = v.data as CoachOutput
        out.safety = c.safety
        out.workout_card = c.safety.refused ? null : c.workout_card
      } else if (inp.role === 'nutritionist') {
        out.meal_card = (v.data as NutritionistOutput).meal_card
      } else {
        Object.assign(out, await supportFields(d, userId, inp, v.data as SupportOutput, userTurns))
      }
      await d.finishJob(userId, inp.idem, { status: 'done', response_text: JSON.stringify(out), provider: a.provider, model: a.model, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd_micro: cost, latency_ms: Date.now() - t0, finished_at: new Date().toISOString() })
      return { status: 200, body: out }
    } catch (_e) {
      clearTimeout(timer)
      if (isLive) await d.budgetSettle(est, 0)                             // nothing proven spent: free the estimate
      lastErr = ctl.signal.aborted ? 'provider_timeout' : 'provider_failed'
    }
  }
  await d.release(reservation.reservationId, userId, lastErr)              // confirmed failure: the credits go back
  await d.finishJob(userId, inp.idem, { status: 'failed', error_code: lastErr, finished_at: new Date().toISOString() })
  return { status: 503, body: { error: 'provider_unavailable' } }
}

/** A ticket is opened when the agent asks for one, or when the member is still not helped after two earlier turns. */
async function supportFields(d: Deps, userId: string, inp: Input, s: SupportOutput, userTurns: number): Promise<Record<string, unknown>> {
  const escalate = !s.resolved && userTurns >= 2
  const wants = s.create_support_ticket || escalate
  const f: Record<string, unknown> = { resolved: wants ? false : s.resolved, create_support_ticket: wants, support_ticket_card: null, suggested_actions: s.suggested_actions }
  if (!wants) return f
  const draft = s.ticket_draft
  const category = draft && (TICKET_CATEGORIES as readonly string[]).includes(draft.category) ? draft.category : 'other'
  const priority = draft && (TICKET_PRIORITIES as readonly string[]).includes(draft.priority) ? draft.priority : 'normal'
  const summary = (draft?.summary || inp.message).slice(0, 1000)
  const transcript: Turn[] = [...inp.history, { role: 'user', text: inp.message }, { role: 'assistant', text: s.chat_reply.slice(0, 600) }]
  try {
    const lim = await d.rateLimit(`ticket-day:${userId}`, 5, 86400)
    if (!lim.allowed) throw new Error('ticket_rate_limited')
    let ref = '', createdAt = ''
    for (let i = 0; i < 2 && !createdAt; i++) {                            // one retry covers a (very unlikely) reference collision
      ref = (d.randomRef ?? ticketRef)()
      try { createdAt = await d.createTicket(userId, { ref, category, priority, summary, transcript }) } catch (e) { if (i === 1) throw e }
    }
    if (!createdAt) throw new Error('ticket_failed')
    const t = TICKET_TEXT[inp.language]
    f.support_ticket_card = { ticket_ref: ref, category, priority, status: 'open', summary, created_at: createdAt, message_ar: t.message(ref), retention_note_ar: t.retention }
  } catch (_e) {
    f.ticket_failed = true
  }
  return f
}

function replay(j: Job, operation: string): Out {
  if (j.operation_key !== operation) return { status: 409, body: { error: 'idempotency_key_reused' } }
  if (j.status === 'running') return { status: 409, body: { error: 'in_progress' } }
  if (j.status === 'done') {
    try { const b = JSON.parse(j.response_text ?? ''); if (b && typeof b === 'object') return { status: 200, body: { ...b, replay: true } } } catch { /* fall through */ }
  }
  return { status: 409, body: { error: 'idempotency_key_reused' } }        // failed attempt: credits were released; the client must use a new key
}
