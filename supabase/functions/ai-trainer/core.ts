// Orchestration for the ONE VORA AI Personal Trainer. Pure: every side effect is injected, so it is unit-testable without a network
// or a database. Order: trusted session -> validation + sanitising -> deterministic medical refusal -> ACCESS (subscriber | trial | none)
// -> subscriber: exact-cost confirmation, idempotent replay, atomic credit reservation, charge only after a VALID answer, release on
//    every failure / trial: no credits, one server-counted message of the single trial conversation, refunded on failure
// -> provider (live only behind the DB budget gate) -> schema validation -> server-side entitlements (never trust the model).
// Message and media contents are never logged here; media is never stored.
import { type Environment, type Lang, type MediaKind, type Persona, systemPrompt, type Tone, type Turn, userEnvelope } from './prompts.ts'
import { canHandle, costMicro, estimateMicro, GEMINI_MEDIA_MODEL, type Media, type Provider } from './providers.ts'
import { clean, detectInjection, MEDICAL_REFUSAL, medicalCheck, URGENT_REPLY, urgentCheck } from './sanitize.ts'
import { type Lockable, validateOutput } from './schemas.ts'

export type Operation = { key: string; credits: number; enabled: boolean }
export type Route = { provider: string; model: string; max_output_tokens: number; fallback_provider?: string | null; fallback_model?: string | null }
export type Job = { id?: string; status: 'running' | 'done' | 'failed'; response_text?: string | null; operation_key: string }
export type Access = { tier: 'subscriber' | 'coins' | 'trial' | 'none'; nutrition: boolean; plan_key?: string | null; trial?: { remaining?: number } | null }
export type TrialResult = { allowed: boolean; remaining?: number; reason?: string }
export class CreditError extends Error { constructor(public code: string) { super(code) } }

export interface Deps {
  mode: 'mock' | 'live'                       // from env AI_MODE; anything else = mock
  getOperation(key: string): Promise<Operation | null>
  getRoute(key: string): Promise<Route | null>
  rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }>
  findJob(userId: string, idem: string): Promise<Job | null>
  createJob(j: { userId: string; idem: string; operation: string; persona: Persona; language: Lang; request: string; conversationId: string; tier: 'trial' | 'subscriber' | 'coins'; mediaKinds: MediaKind[] }): Promise<{ created: boolean }>
  attachReservation(userId: string, idem: string, reservationId: string): Promise<void>
  reserve(userId: string, operation: string, idem: string): Promise<{ reservationId: string; credits: number }>   // throws CreditError
  settle(reservationId: string, userId: string): Promise<void>
  release(reservationId: string, userId: string, reason: string): Promise<void>
  finishJob(userId: string, idem: string, patch: Record<string, unknown>): Promise<void>
  budgetAuthorize(estimateMicro: number): Promise<boolean>
  budgetSettle(estimateMicro: number, actualMicro: number): Promise<void>
  provider(name: string): Provider | null     // null = not configured (no key, or not live)
  trusted(): Promise<boolean>                 // is_trusted_session() evaluated by the database with the caller's own JWT
  access(userId: string): Promise<Access>     // trainer_access(); throws when the database cannot answer
  trialConsume(userId: string, conversationId: string): Promise<TrialResult>
  trialRefund(userId: string): Promise<void>
  timeoutMs?: number
}
export type Out = { status: number; body: Record<string, unknown> }

const IDEM = /^[A-Za-z0-9_-]{8,80}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PERSONAS = ['rashid', 'sarah'], LANGS = ['ar', 'en'], TONES = ['friendly', 'direct', 'playful'], ENVS = ['gym', 'home']
const ALLOWED = new Set(['conversation_id', 'message', 'attachments', 'history', 'environment', 'persona', 'tone', 'language', 'idempotency_key', 'confirm_credits'])
const MB = 1024 * 1024
export const MEDIA_RULES: Record<MediaKind, { maxBytes: number; mime: readonly string[] }> = {
  image: { maxBytes: 4 * MB, mime: ['image/jpeg', 'image/png', 'image/webp'] },
  audio: { maxBytes: 5 * MB, mime: ['audio/wav', 'audio/x-wav', 'audio/aac', 'audio/mpeg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/webm'] },
  video: { maxBytes: 12 * MB, mime: ['video/mp4', 'video/quicktime', 'video/webm'] },
}
export const OPERATION: Record<'text' | MediaKind, string> = { text: 'trainer_message', image: 'trainer_image', audio: 'trainer_audio', video: 'trainer_video' }
const optEnum = (v: unknown, allowed: string[], dflt: string): string | null => (v === undefined ? dflt : typeof v === 'string' && allowed.includes(v) ? v : null)

type Input = { conversationId: string; message: string; attachment: Media | null; history: Turn[]; environment: Environment; persona: Persona; tone: Tone; language: Lang; idem: string; confirm: number }
type Parsed = { ok: true; input: Input } | { ok: false; status: number; error: string }
const invalid: Parsed = { ok: false, status: 400, error: 'invalid_input' }
const wrongType: Parsed = { ok: false, status: 400, error: 'attachment_type_not_supported' }

/** The first bytes must look like the declared image type (a renamed file is refused before anything is reserved or sent anywhere). */
function imageMagicOk(mime: string, b64: string): boolean {
  let head: string
  try { head = atob(b64.slice(0, 16)) } catch { return false }
  const c = (i: number) => head.charCodeAt(i)
  if (mime === 'image/jpeg') return c(0) === 0xff && c(1) === 0xd8 && c(2) === 0xff
  if (mime === 'image/png') return c(0) === 0x89 && head.slice(1, 4) === 'PNG'
  return head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP'
}
function parseAttachment(a: unknown): { ok: true; media: Media } | { ok: false; status: number; error: string } {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return invalid as never
  const keys = Object.keys(a)
  if (keys.length !== 3 || !['kind', 'mime_type', 'data_base64'].every((k) => keys.includes(k))) return invalid as never
  const { kind, mime_type, data_base64 } = a as Record<string, unknown>
  if (typeof kind !== 'string' || typeof mime_type !== 'string' || typeof data_base64 !== 'string') return invalid as never
  const rule = (MEDIA_RULES as Record<string, { maxBytes: number; mime: readonly string[] }>)[kind]
  const mime = mime_type.trim().toLowerCase()
  if (!Object.hasOwn(MEDIA_RULES, kind) || !rule.mime.includes(mime)) return wrongType as never
  const len = data_base64.length
  if (len === 0) return invalid as never
  const bytes = Math.floor(len / 4) * 3 - (data_base64.endsWith('==') ? 2 : data_base64.endsWith('=') ? 1 : 0)
  if (bytes > rule.maxBytes) return { ok: false, status: 413, error: 'attachment_too_large' }
  if (len % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data_base64)) return invalid as never
  if (kind === 'image' && !imageMagicOk(mime, data_base64)) return wrongType as never
  return { ok: true, media: { kind: kind as MediaKind, mimeType: mime, dataBase64: data_base64, bytes } }
}

/** Strict validation: unknown keys, wrong types or sizes are rejected. Never trust the client. */
export function parseInput(body: Record<string, unknown> | null): Parsed {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid
  for (const k of Object.keys(body)) if (!ALLOWED.has(k)) return invalid
  if (typeof body.conversation_id !== 'string' || !UUID.test(body.conversation_id)) return invalid
  let message = ''
  if (body.message !== undefined) {
    if (typeof body.message !== 'string') return invalid
    message = clean(body.message)
    if (message.length > 1000) return invalid
  }
  let attachment: Media | null = null
  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments) || body.attachments.length > 1) return invalid
    if (body.attachments.length === 1) {
      const p = parseAttachment(body.attachments[0])
      if (!p.ok) return p
      attachment = p.media
    }
  }
  if (!message && !attachment) return invalid
  const history: Turn[] = []
  if (body.history !== undefined) {
    if (!Array.isArray(body.history) || body.history.length > 8) return invalid
    for (const h of body.history) {
      if (!h || typeof h !== 'object' || Array.isArray(h)) return invalid
      const keys = Object.keys(h)
      if (keys.length !== 2 || !keys.includes('role') || !keys.includes('text')) return invalid
      const t = h as { role: unknown; text: unknown }
      if ((t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string') return invalid
      const text = clean(t.text)
      if (text.length < 1 || text.length > 600) return invalid
      history.push({ role: t.role, text })
    }
  }
  const environment = optEnum(body.environment, ENVS, 'gym'), persona = optEnum(body.persona, PERSONAS, 'rashid'), tone = optEnum(body.tone, TONES, 'friendly'), language = optEnum(body.language, LANGS, 'ar')
  if (!environment || !persona || !tone || !language) return invalid
  if (typeof body.idempotency_key !== 'string' || !IDEM.test(body.idempotency_key)) return invalid
  if (body.confirm_credits !== undefined && typeof body.confirm_credits !== 'number') return invalid
  const confirm = typeof body.confirm_credits === 'number' ? body.confirm_credits : NaN
  return { ok: true, input: { conversationId: body.conversation_id.toLowerCase(), message, attachment, history, environment: environment as Environment, persona: persona as Persona, tone: tone as Tone, language: language as Lang, idem: body.idempotency_key, confirm } }
}

const MEDIA_NOTE: Record<Lang, string> = {
  ar: 'وصلنا ملفك لكن ما قدرنا نحلله حالياً، فما راح يتم التعليق على محتواه.',
  en: 'Your file was received but could not be analysed right now, so nothing is said about its contents.',
}
const LOCKED_TEXT: Record<Lang, Record<Lockable, string>> = {
  ar: {
    nutrition: 'إرشادات التغذية والوجبات متوفرة ضمن باقات VORA اللي تشمل التغذية. أقدر أساعدك الحين بالتمارين وطريقة الأداء والاستشفاء.',
    plan: 'الخطط التدريبية الشخصية الكاملة متوفرة مع اشتراك VORA. أقدر أساعدك الحين بتمرين معيّن أو بنصايح عامة للتمرين.',
  },
  en: {
    nutrition: 'Nutrition guidance and meal ideas are part of the VORA plans that include nutrition. Right now I can help you with workouts, technique and recovery.',
    plan: 'Full personalised training plans come with a VORA subscription. Right now I can help you with a single exercise or general training guidance.',
  },
}
const NO_SAFETY = { injury_reported: false, injured_area: null, refused: false, refusal_reason: null, urgent: false }
const accessOut = (a: Access | null, trialRemaining: number | null) => (a ? { tier: a.tier, nutrition: a.tier === 'subscriber' && a.nutrition === true, trial_remaining: trialRemaining } : null)
const trialLeft = (a: Access | null) => (a && a.tier === 'trial' && typeof a.trial?.remaining === 'number' ? a.trial.remaining : null)

/** Fixed answer written by the server (no provider, nothing charged, no trial message used). */
function fixedReply(requestId: string, inp: Input, text: { chat_reply: string; voice_script: string }, safety: Record<string, unknown>, access: Access | null, note: string | null = null): Out {
  const received = inp.attachment ? [inp.attachment.kind] : []
  return { status: 200, body: { request_id: requestId, conversation_id: inp.conversationId, chat_reply: text.chat_reply, voice_script: text.voice_script, off_topic: false, safety: { ...NO_SAFETY, ...safety }, workout_card: null, workout_plan: null, meal_card: null, locked: [], media: { received, analyzed: [], note }, credits_charged: 0, mock: false, replay: false, access: accessOut(access, trialLeft(access)) } }
}

export async function handleTrainer(d: Deps, userId: string, body: Record<string, unknown> | null): Promise<Out> {
  // ---- 0. a valid JWT is not enough: the session must be one of the user's active, device-verified sessions
  if (!(await d.trusted())) return { status: 403, body: { error: 'device_not_trusted' } }

  // ---- 1. validate, then screen every user-controlled string (nothing is reserved, consumed or charged before this point)
  const parsed = parseInput(body)
  if (!parsed.ok) return { status: parsed.status, body: { error: parsed.error } }
  const inp = parsed.input
  if ([inp.message, ...inp.history.map((h) => h.text)].some((t) => detectInjection(t))) return { status: 400, body: { error: 'input_rejected' } }
  const requestId = crypto.randomUUID()
  const kind = inp.attachment?.kind ?? null

  // ---- 2. deterministic medical pre-flight: no provider, no credits, no trial message
  const medical = medicalCheck(inp.message)
  if (medical === 'hard') {
    const lim = await d.rateLimit(`ai-min:${userId}`, 12, 60)
    if (!lim.allowed) return { status: 429, body: { error: 'rate_limited', retry_after: lim.retryAfter } }
    let acc: Access | null = null
    try { acc = await d.access(userId) } catch { /* the refusal does not depend on it */ }
    return fixedReply(requestId, inp, MEDICAL_REFUSAL[inp.language], { refused: true, refusal_reason: 'medical_substances' }, acc)
  }

  // ---- 3. ACCESS: subscriber | the one free trial conversation | none
  let access: Access
  try { access = await d.access(userId) } catch { return { status: 503, body: { error: 'provider_unavailable' } } }
  // a member who cannot use the trainer still gets a safety answer (never a paywall) when the message looks like an emergency
  const urgent = urgentCheck(inp.message)
  const noAccess = async (error: string): Promise<Out> => {
    if (!urgent) return { status: 402, body: { error, subscription_required: true } }
    const lim = await d.rateLimit(`ai-min:${userId}`, 12, 60)
    if (!lim.allowed) return { status: 429, body: { error: 'rate_limited', retry_after: lim.retryAfter } }
    return fixedReply(requestId, inp, URGENT_REPLY[inp.language], { urgent: true }, { ...access, tier: 'none' })
  }
  if (access.tier !== 'subscriber' && access.tier !== 'trial' && access.tier !== 'coins') return noAccess('subscription_required')
  const tier = access.tier
  // subscribers and pay-as-you-go members pay VORA Coins per request; only the subscription unlocks plans and nutrition
  const pays = tier !== 'trial'
  const nutrition = tier === 'subscriber' && access.nutrition === true

  const operation = OPERATION[kind ?? 'text']
  const op = await d.getOperation(operation)
  const route = op && op.enabled ? await d.getRoute(operation) : null
  if (!op || !op.enabled || !route) return { status: 503, body: { error: 'provider_unavailable' } }

  // ---- 4. subscribers confirm the exact server-side cost; the trial has no credits and no confirmation
  if (pays && inp.confirm !== op.credits) return { status: 409, body: { error: 'confirmation_required', credits: op.credits, operation } }

  // ---- 5. replay / in-flight protection (a retry or double click never calls the provider, charges or uses a trial message twice)
  const existing = await d.findJob(userId, inp.idem)
  if (existing) return replay(existing, operation)

  // ---- 6. abuse limits
  for (const [bucket, limit, win] of [[`ai-min:${userId}`, 12, 60], [`ai-day:${userId}`, 300, 86400]] as Array<[string, number, number]>) {
    const r = await d.rateLimit(bucket, limit, win)
    if (!r.allowed) return { status: 429, body: { error: 'rate_limited', retry_after: r.retryAfter } }
  }

  // ---- 7. pay: reserve credits (subscriber) or take one message of the trial conversation (both atomic in the database)
  let reservationId: string | null = null, trialRemaining: number | null = null
  if (pays) {
    let reservation: { reservationId: string; credits: number }
    try { reservation = await d.reserve(userId, operation, inp.idem) }
    catch (e) {
      const code = e instanceof CreditError ? e.code : ''
      if (code === 'PC001') return { status: 402, body: { error: 'insufficient_credits', credits: op.credits } }
      if (code === 'PC004') return { status: 409, body: { error: 'idempotency_key_reused' } }
      return { status: 503, body: { error: 'provider_unavailable' } }
    }
    if (reservation.credits !== op.credits) { await d.release(reservation.reservationId, userId, 'price_changed'); return { status: 409, body: { error: 'confirmation_required', credits: reservation.credits, operation } } }
    reservationId = reservation.reservationId
  } else {
    let t: TrialResult
    try { t = await d.trialConsume(userId, inp.conversationId) } catch { return { status: 503, body: { error: 'provider_unavailable' } } }
    if (!t.allowed) return noAccess('trial_ended')
    trialRemaining = typeof t.remaining === 'number' ? t.remaining : 0
  }
  /** gives back what step 7 took: nothing is ever kept for a request that produced no usable answer */
  const undo = async (reason: string) => {
    if (reservationId) await d.release(reservationId, userId, reason)
    else { await d.trialRefund(userId); if (trialRemaining !== null) trialRemaining += 1 }
  }
  const made = await d.createJob({ userId, idem: inp.idem, operation, persona: inp.persona, language: inp.language, request: inp.message, conversationId: inp.conversationId, tier, mediaKinds: kind ? [kind] : [] })
  if (!made.created) { await undo('duplicate_request'); const j = await d.findJob(userId, inp.idem); return j ? replay(j, operation) : { status: 409, body: { error: 'in_progress' } } }
  if (reservationId) await d.attachReservation(userId, inp.idem, reservationId)

  // ---- 8. which provider gets what. Mock mode always uses the mock; live mode fails CLOSED (never a silent mock).
  // Media goes ONLY to a provider that can take that kind. When no routed provider can, Gemini is tried if it is configured (and the
  // budget gate agrees); otherwise the media is NOT sent anywhere: only the written message is answered and media.analyzed stays [].
  type Attempt = { provider: string; model: string; withMedia: boolean }
  const candidates = d.mode === 'live'
    ? [{ provider: route.provider, model: route.model }, ...(route.fallback_provider && route.fallback_model ? [{ provider: route.fallback_provider, model: route.fallback_model }] : [])]
    : [{ provider: 'mock', model: 'mock-model' }]
  let attempts: Attempt[], capabilityGap = false
  if (!kind) attempts = candidates.map((c) => ({ ...c, withMedia: false }))
  else {
    const capable = candidates.filter((c) => canHandle(c.provider, kind))
    if (capable.length) attempts = capable.map((c) => ({ ...c, withMedia: true }))
    else {
      capabilityGap = true; attempts = []
      if (d.mode === 'live' && !candidates.some((c) => c.provider === 'gemini') && d.provider('gemini')) attempts.push({ provider: 'gemini', model: GEMINI_MEDIA_MODEL, withMedia: true })
      if (d.mode !== 'live' || inp.message) attempts.push(...candidates.map((c) => ({ ...c, withMedia: false })))
    }
  }

  const user = userEnvelope({ message: inp.message, history: inp.history, environment: inp.environment, attached: kind })
  let lastErr = 'provider_failed'
  for (const a of attempts) {
    if (a.withMedia && (!kind || !canHandle(a.provider, kind))) continue        // belt and braces: never hand media to a provider that cannot take it
    const prov = d.provider(a.provider)
    if (!prov) { lastErr = 'provider_not_configured'; continue }
    const media = a.withMedia && inp.attachment ? inp.attachment : undefined
    const system = systemPrompt({ persona: inp.persona, tone: inp.tone, language: inp.language, environment: inp.environment, tier, nutrition, medicalFlag: medical === 'flag', attached: kind, mediaProvided: Boolean(media) })
    const isLive = a.provider !== 'mock'
    let est = 0
    if (isLive) {
      try { est = estimateMicro(a.model, system, user, route.max_output_tokens, media) } catch { lastErr = 'unpriced_model'; continue }
      if (!(await d.budgetAuthorize(est))) { lastErr = 'budget_blocked'; continue }
    }
    const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), d.timeoutMs ?? (media && media.kind !== 'image' ? 55000 : 25000))
    try {
      const r = await prov.call({ system, user, model: a.model, maxTokens: route.max_output_tokens, signal: ctl.signal, media, meta: { message: inp.message, language: inp.language, environment: inp.environment, attachmentKind: kind } })
      clearTimeout(timer)
      const cost = isLive ? costMicro(a.model, r.inputTokens, r.outputTokens, media?.kind === 'audio') : 0
      if (isLive) await d.budgetSettle(est, cost)                          // the provider was paid even if the answer is unusable
      const v = validateOutput(r.text ?? '')
      if (!v.ok) { lastErr = 'invalid_output'; continue }                  // the member is never charged for an unusable answer

      // ---- 9. server-side rules on top of the validated answer (the model is never trusted with entitlements or media claims)
      const o = v.data, mock = a.provider === 'mock'
      const safety = { ...o.safety }
      const offTopic = o.off_topic && !safety.urgent
      const noCards = offTopic || safety.urgent || safety.refused
      let workoutCard = noCards ? null : o.workout_card, workoutPlan = noCards ? null : o.workout_plan, mealCard = noCards ? null : o.meal_card
      let chatReply = o.chat_reply, voiceScript = o.voice_script
      const stripped: Lockable[] = []
      if (mealCard && !nutrition) { mealCard = null; stripped.push('nutrition') }
      if (workoutPlan && tier !== 'subscriber') { workoutPlan = null; stripped.push('plan') }
      if (stripped.length) {                                               // the text may describe what was just removed: replace it
        chatReply = (mock ? '[MOCK] ' : '') + LOCKED_TEXT[inp.language][stripped[0]]; voiceScript = LOCKED_TEXT[inp.language][stripped[0]]; workoutCard = null
      }
      const hinted = noCards ? [] : o.withheld.filter((w) => (w === 'nutrition' ? !nutrition : tier !== 'subscriber'))
      const locked = [...new Set<Lockable>([...stripped, ...hinted])]
      const analyzed = media ? [media.kind] : []
      // a paid media operation whose file could not be analysed by a real provider is not charged (the mock simulates the full flow)
      const charge = reservationId !== null && !(kind && !media && !mock)
      if (reservationId) { if (charge) await d.settle(reservationId, userId); else await d.release(reservationId, userId, 'media_not_analyzed') }
      const out: Record<string, unknown> = {
        request_id: requestId, conversation_id: inp.conversationId, chat_reply: chatReply, voice_script: voiceScript, off_topic: offTopic, safety,
        workout_card: workoutCard, workout_plan: workoutPlan, meal_card: mealCard, locked,
        media: { received: kind ? [kind] : [], analyzed, note: kind && !media ? MEDIA_NOTE[inp.language] : null },
        credits_charged: charge ? op.credits : 0, mock, replay: false, access: accessOut({ ...access, nutrition }, trialRemaining),
      }
      await d.finishJob(userId, inp.idem, { status: 'done', response_text: JSON.stringify(out), provider: a.provider, model: a.model, input_tokens: r.inputTokens, output_tokens: r.outputTokens, cost_usd_micro: cost, latency_ms: Date.now() - t0, finished_at: new Date().toISOString() })
      return { status: 200, body: out }
    } catch (_e) {
      clearTimeout(timer)
      if (isLive) await d.budgetSettle(est, 0)                             // nothing proven spent: free the estimate
      lastErr = ctl.signal.aborted ? 'provider_timeout' : 'provider_failed'
    }
  }

  if (capabilityGap && !inp.message && d.mode === 'live') {
    // a file with no written message, and no provider that may take it: say so honestly, charge nothing, use no trial message
    await undo('media_not_analyzed')
    const out = fixedReply(requestId, inp, { chat_reply: MEDIA_NOTE[inp.language], voice_script: MEDIA_NOTE[inp.language] }, {}, { ...access, nutrition }, MEDIA_NOTE[inp.language])
    ;(out.body.access as Record<string, unknown>).trial_remaining = trialRemaining
    await d.finishJob(userId, inp.idem, { status: 'done', response_text: JSON.stringify(out.body), error_code: 'media_not_analyzed', finished_at: new Date().toISOString() })
    return out
  }
  await undo(lastErr)                                                      // confirmed failure: credits / the trial message go back
  await d.finishJob(userId, inp.idem, { status: 'failed', error_code: lastErr, finished_at: new Date().toISOString() })
  return { status: 503, body: { error: 'provider_unavailable' } }
}

function replay(j: Job, operation: string): Out {
  if (j.operation_key !== operation) return { status: 409, body: { error: 'idempotency_key_reused' } }
  if (j.status === 'running') return { status: 409, body: { error: 'in_progress' } }
  if (j.status === 'done') {
    try { const b = JSON.parse(j.response_text ?? ''); if (b && typeof b === 'object') return { status: 200, body: { ...b, replay: true } } } catch { /* fall through */ }
  }
  return { status: 409, body: { error: 'idempotency_key_reused' } }        // failed attempt: nothing was kept; the client must use a new key
}
