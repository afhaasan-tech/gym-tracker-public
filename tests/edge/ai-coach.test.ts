// deno test --allow-env tests/edge/ai-coach.test.ts : orchestration logic with in-memory fakes (no network, no database, no keys).
import { CreditError, type Deps, handleCoach, type Job } from '../../supabase/functions/ai-coach/core.ts'
import { anthropicProvider, costMicro, mockProvider, type Provider } from '../../supabase/functions/ai-coach/providers.ts'
import { systemPrompt } from '../../supabase/functions/ai-coach/persona.ts'

const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`) }
function world(over: Partial<Deps> = {}, opts: { balance?: number; mode?: 'mock' | 'live'; provider?: Provider; budget?: boolean; trusted?: boolean } = {}) {
  const s = { balance: opts.balance ?? 2500, jobs: new Map<string, Job>(), reservations: new Map<string, { credits: number; status: string }>(), calls: 0, rate: 0, budgetAuth: 0, budgetSettle: [] as number[][] }
  const op = { key: 'quick_question', credits: 50, enabled: true }
  const prov: Provider = opts.provider ?? mockProvider
  const wrapped: Provider = { name: prov.name, call: (r) => { s.calls++; return prov.call(r) } }
  const d: Deps = {
    mode: opts.mode ?? 'mock',
    getOperation: (k) => Promise.resolve(k === 'quick_question' ? op : k === 'full_workout_plan' ? { key: k, credits: 1500, enabled: true } : null),
    getRoute: () => Promise.resolve({ provider: 'anthropic', model: 'claude-haiku-5-5', max_output_tokens: 500 }),
    rateLimit: () => { s.rate++; return Promise.resolve({ allowed: s.rate <= 12, retryAfter: 30 }) },
    findJob: (_u, i) => Promise.resolve(s.jobs.get(i) ?? null),
    createJob: (j) => { if (s.jobs.has(j.idem)) return Promise.resolve({ created: false }); s.jobs.set(j.idem, { status: 'running', operation_key: j.operation }); return Promise.resolve({ created: true }) },
    attachReservation: () => Promise.resolve(),
    reserve: (_u, o, i) => {
      const cost = o === 'full_workout_plan' ? 1500 : 50
      if (s.balance < cost) throw new CreditError('PC001')
      s.balance -= cost; const id = 'res-' + i; s.reservations.set(id, { credits: cost, status: 'reserved' }); return Promise.resolve({ reservationId: id, credits: cost })
    },
    settle: (id) => { s.reservations.get(id)!.status = 'settled'; return Promise.resolve() },
    release: (id) => { const r = s.reservations.get(id)!; if (r.status === 'reserved') { r.status = 'released'; s.balance += r.credits } return Promise.resolve() },
    finishJob: (_u, i, p) => { const j = s.jobs.get(i)!; Object.assign(j, p); return Promise.resolve() },
    budgetAuthorize: () => { s.budgetAuth++; return Promise.resolve(opts.budget ?? false) },
    budgetSettle: (e, a) => { s.budgetSettle.push([e, a]); return Promise.resolve() },
    trusted: () => Promise.resolve(opts.trusted ?? true),
    provider: (n) => (n === 'mock' ? { name: 'mock', call: wrapped.call } : n === 'anthropic' ? wrapped : null),
    ...over,
  }
  return { s, d }
}
const req = (o: Record<string, unknown> = {}) => ({ operation: 'quick_question', message: 'شنو آكل قبل التمرين؟', persona: 'rashid', language: 'ar', tone: 'friendly', idempotency_key: 'key-00000001', confirm_credits: 50, ...o })

Deno.test('requires the exact confirmed cost, then answers and charges once', async () => {
  const { s, d } = world()
  let r = await handleCoach(d, 'u1', req({ confirm_credits: undefined })); eq(r.status, 409, 'no confirmation'); eq((r.body as { credits: number }).credits, 50, 'shows the server price')
  r = await handleCoach(d, 'u1', req({ confirm_credits: 1 })); eq(r.status, 409, 'tampered price refused'); eq(s.balance, 2500, 'nothing held')
  r = await handleCoach(d, 'u1', req()); eq(r.status, 200, 'answer'); eq(s.balance, 2450, 'charged 50'); eq(s.reservations.get('res-key-00000001')!.status, 'settled', 'settled')
  eq((r.body as { mock: boolean }).mock, true, 'flagged as mock')
})
Deno.test('retry and double click with the same key never call the provider or charge twice', async () => {
  const { s, d } = world()
  await handleCoach(d, 'u1', req()); const again = await handleCoach(d, 'u1', req())
  eq(again.status, 200, 'replay'); eq((again.body as { replay: boolean }).replay, true, 'replay flag'); eq(s.calls, 1, 'one provider call'); eq(s.balance, 2450, 'one charge')
})
Deno.test('insufficient credits: 402 and nothing is held or called', async () => {
  const { s, d } = world({}, { balance: 10 }); const r = await handleCoach(d, 'u1', req())
  eq(r.status, 402, 'insufficient'); eq(s.balance, 10, 'balance intact'); eq(s.calls, 0, 'no provider call')
})
Deno.test('provider failure releases the credits and records a failed job', async () => {
  const bad: Provider = { name: 'mock', call: () => Promise.reject(new Error('boom')) }
  const { s, d } = world({}, { provider: bad }); const r = await handleCoach(d, 'u1', req())
  eq(r.status, 503, 'safe error'); eq(s.balance, 2500, 'credits back'); eq(s.jobs.get('key-00000001')!.status, 'failed', 'job failed')
  eq(JSON.stringify(r.body).includes('boom'), false, 'no internal error text leaks')
  const retry = await handleCoach(d, 'u1', req()); eq(retry.status, 409, 'same key after failure needs a new key'); eq((retry.body as { error: string }).error, 'previous_attempt_failed', 'explained')
})
Deno.test('empty provider answer is a failure (no charge)', async () => {
  const empty: Provider = { name: 'mock', call: () => Promise.resolve({ text: '  ', inputTokens: 1, outputTokens: 0 }) }
  const { s, d } = world({}, { provider: empty }); const r = await handleCoach(d, 'u1', req()); eq(r.status, 503, 'fails'); eq(s.balance, 2500, 'credits back')
})
Deno.test('timeout releases credits (504)', async () => {
  const slow: Provider = { name: 'mock', call: (r) => new Promise((_res, rej) => r.signal.addEventListener('abort', () => rej(new Error('aborted')))) }
  const { s, d } = world({ timeoutMs: 20 }, { provider: slow }); const r = await handleCoach(d, 'u1', req()); eq(r.status, 504, 'timeout'); eq(s.balance, 2500, 'credits back')
})
Deno.test('rate limit stops the 13th request in a minute before any credit is held', async () => {
  const { s, d } = world(); let last = 0
  for (let i = 0; i < 7; i++) { last = (await handleCoach(d, 'u1', req({ idempotency_key: 'k-aaaaaaa' + i }))).status }   // 2 buckets per call => 14 hits
  eq(last, 429, 'limited'); eq(s.balance, 2500 - 50 * 6, 'only the allowed ones were charged')
})
Deno.test('input validation', async () => {
  const { d } = world()
  for (const bad of [{ message: '' }, { message: 'x'.repeat(2001) }, { persona: 'bob' }, { language: 'fr' }, { tone: 'rude' }, { idempotency_key: 'short' }, { operation: 'nope' }]) eq((await handleCoach(d, 'u1', req(bad))).status, 400, JSON.stringify(bad).slice(0, 30))
  eq((await handleCoach(d, 'u1', null)).status, 400, 'null body')
})
Deno.test('mock mode never touches a live provider or the budget', async () => {
  const { s, d } = world({}, { mode: 'mock', budget: true }); await handleCoach(d, 'u1', req()); eq(s.budgetAuth, 0, 'budget untouched')
})
Deno.test('live mode fails CLOSED when the budget gate refuses (no silent mock, credits returned)', async () => {
  const { s, d } = world({}, { mode: 'live', budget: false }); const r = await handleCoach(d, 'u1', req())
  eq(r.status, 503, 'unavailable'); eq(s.calls, 0, 'no provider call'); eq(s.balance, 2500, 'credits back'); eq(s.budgetAuth, 1, 'gate consulted')
})
Deno.test('live mode with budget approval records real cost and settles the estimate', async () => {
  const fake: Provider = { name: 'anthropic', call: () => Promise.resolve({ text: 'تمام', inputTokens: 1000, outputTokens: 200 }) }
  const { s, d } = world({}, { mode: 'live', budget: true, provider: fake }); const r = await handleCoach(d, 'u1', req())
  eq(r.status, 200, 'ok'); eq((r.body as { mock: boolean }).mock, false, 'not mock'); eq(s.budgetSettle.length, 1, 'budget settled')
  eq(s.budgetSettle[0][1], costMicro('claude-haiku-5-5', 1000, 200), 'actual cost = tokens x price'); eq(s.balance, 2450, 'charged')
})
Deno.test('anthropic provider refuses to run unless AI_MODE=live (no accidental billable call)', async () => {
  Deno.env.delete('AI_MODE'); let threw = false
  try { await anthropicProvider('sk-ant-test').call({ system: 's', user: 'u', model: 'claude-haiku-5-5', maxTokens: 10, signal: new AbortController().signal }) } catch (e) { threw = /disabled/.test((e as Error).message) }
  eq(threw, true, 'blocked before any network call')
})
Deno.test('personas: safety rules, Kuwaiti style and independence from gender are in every prompt', () => {
  for (const p of ['rashid', 'sarah'] as const) for (const l of ['ar', 'en'] as const) {
    const s = systemPrompt(p, 'friendly', l, 'full_workout_plan')
    for (const must of ['not a doctor', 'extreme calorie restriction', 'under 18', 'allergens', 'Do not invent restaurant']) if (!s.includes(must)) throw new Error(`${p}/${l} missing: ${must}`)
    if (l === 'ar' && !s.includes('Kuwaiti Arabic')) throw new Error('missing Kuwaiti style')
    if (/\b(man|woman|male|female)\b/i.test(s)) throw new Error('prompt must not hard-code gender rules')
  }
})

Deno.test('an untrusted session (valid JWT, wrong/unverified device or superseded session) gets 403 before anything else happens', async () => {
  const { s, d } = world({}, { trusted: false })
  const r = await handleCoach(d, 'u1', req()); eq(r.status, 403, 'blocked'); eq((r.body as { error: string }).error, 'device_not_trusted', 'reason')
  eq(s.calls, 0, 'no provider call'); eq(s.balance, 2500, 'no credits held'); eq(s.rate, 0, 'not even rate-limit state is touched'); eq(s.jobs.size, 0, 'no job')
  const bad = await handleCoach(d, 'u1', req({ confirm_credits: 1 })); eq(bad.status, 403, 'also before price checks (no price oracle for untrusted sessions)')
})
