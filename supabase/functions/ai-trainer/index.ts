import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { type Access, CreditError, type Deps, handleTrainer, type TrialResult } from './core.ts'
import { anthropicProvider, geminiProvider, mockProvider, type Provider } from './providers.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MAX_BODY = 17 * 1024 * 1024       // 12 MB of video as base64 (16 MB) + the JSON around it

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const auth = req.headers.get('Authorization')
  if (!auth) return json(401, { error: 'login_required' })
  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data: u, error: uerr } = await userClient.auth.getUser()
  if (uerr || !u?.user) return json(401, { error: 'login_required' })
  if (!u.user.email_confirmed_at) return json(403, { error: 'email_not_verified' })
  const user = u.user
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Live providers exist only when AI_MODE=live AND their key secret is set; even then core.ts asks the database budget gate first.
  const mode = Deno.env.get('AI_MODE') === 'live' ? 'live' : 'mock'
  const providers: Record<string, Provider> = { mock: mockProvider }
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY'); if (mode === 'live' && anthropicKey) providers.anthropic = anthropicProvider(anthropicKey)
  const geminiKey = Deno.env.get('GEMINI_API_KEY'); if (mode === 'live' && geminiKey) providers.gemini = geminiProvider(geminiKey)

  const deps: Deps = {
    mode,
    async getOperation(k) { const { data } = await db.from('ai_operations').select('key,credits,enabled').eq('key', k).maybeSingle(); return data },
    async getRoute(k) { const { data } = await db.from('ai_routes').select('provider,model,max_output_tokens,fallback_provider,fallback_model').eq('operation_key', k).maybeSingle(); return data },
    async rateLimit(bucket, limit, windowSeconds) { const { data } = await db.rpc('rate_limit_hit', { p_bucket: bucket, p_limit: limit, p_window: `${windowSeconds} seconds` }); const r = Array.isArray(data) ? data[0] : data; return { allowed: Boolean(r?.allowed), retryAfter: Number(r?.retry_after ?? 60) } },
    async findJob(userId, idem) { const { data } = await db.from('ai_jobs').select('id,status,response_text,operation_key').eq('user_id', userId).eq('idempotency_key', idem).maybeSingle(); return data },
    // only the written message is recorded with the job (as for every AI job); media is never stored, only its kind
    async createJob(j) { const { error } = await db.from('ai_jobs').insert({ user_id: j.userId, idempotency_key: j.idem, operation_key: j.operation, persona: j.persona, language: j.language, request_text: j.request, conversation_id: j.conversationId, tier: j.tier, media_kinds: j.mediaKinds }); return { created: !error } },
    async attachReservation(userId, idem, rid) { await db.from('ai_jobs').update({ reservation_id: rid }).eq('user_id', userId).eq('idempotency_key', idem) },
    async reserve(userId, operation, idem) {
      const { data, error } = await db.rpc('credit_reserve', { p_user: userId, p_operation: operation, p_idem: idem })
      if (error) throw new CreditError(error.code ?? 'X')
      const r = Array.isArray(data) ? data[0] : data; return { reservationId: r.o_reservation_id, credits: r.o_credits }
    },
    async settle(rid, userId) { await db.rpc('credit_settle', { p_reservation: rid, p_user: userId }) },
    async release(rid, userId, reason) { await db.rpc('credit_release', { p_reservation: rid, p_user: userId, p_reason: reason }) },
    async finishJob(userId, idem, patch) { await db.from('ai_jobs').update(patch).eq('user_id', userId).eq('idempotency_key', idem) },
    async budgetAuthorize(e) { const { data } = await db.rpc('ai_budget_authorize', { p_estimate: e }); return data === true },
    async budgetSettle(e, a) { await db.rpc('ai_budget_settle', { p_estimate: e, p_actual: a }) },
    provider: (n) => providers[n] ?? null,
    async trusted() { const { data } = await userClient.rpc('is_trusted_session'); return data === true },
    async access(userId) { const { data, error } = await db.rpc('trainer_access', { p_user: userId }); if (error || !data || typeof data.tier !== 'string') throw new Error('access_unavailable'); return data as Access },
    async trialConsume(userId, conversationId) { const { data, error } = await db.rpc('trainer_trial_consume', { p_user: userId, p_conversation: conversationId }); if (error || !data) throw new Error('trial_unavailable'); return data as TrialResult },
    async trialRefund(userId) { await db.rpc('trainer_trial_refund', { p_user: userId }) },
    // the exercise library is readable by no client role: the candidates come from a service-role function (compact records only)
    async libraryCandidates(muscles, environment, limit) { const { data, error } = await db.rpc('library_candidates', { p_muscles: muscles.length ? muscles : null, p_environment: environment, p_limit: limit }); if (error) throw new Error('library_unavailable'); return data },
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY) return json(413, { error: 'attachment_too_large' })
  const body = await req.json().catch(() => null)
  try { const out = await handleTrainer(deps, user.id, body); return json(out.status, out.body) }
  catch (e) { console.error('ai-trainer error', (e as Error).name); return json(500, { error: 'server_error' }) }   // never the message or media contents
})
