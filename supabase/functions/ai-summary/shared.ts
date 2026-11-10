// Shared helper (identical copy lives in both ai-summary/ and ai-analysis/).
// Handles: CORS, JWT auth, the shared 5-requests-per-minute limit, and the OpenRouter call
// with free-model discovery + fallback. This file never returns canned/mock AI text.
import { createClient, type SupabaseClient, type User } from 'jsr:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(status: number, body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  })
}

export const RATE_LIMIT = 5 // requests
export const RATE_WINDOW_SECONDS = 60

/** Authenticates the caller and consumes one unit of the shared AI quota. Returns a Response on failure. */
export async function authenticateAndLimit(
  req: Request,
): Promise<{ user: User; userClient: SupabaseClient } | Response> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json(401, { error: 'Please log in to use AI features.' })

  const url = Deno.env.get('SUPABASE_URL')!
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) return json(401, { error: 'Your session has expired. Please log in again.' })

  // Service-role client is used ONLY for the rate-limit counter (table has no public policies).
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: rl, error: rlError } = await admin.rpc('consume_ai_request', {
    p_user: data.user.id,
    p_limit: RATE_LIMIT,
  })
  if (rlError || !rl || rl.length === 0) {
    console.error('rate limit check failed', rlError)
    return json(500, { error: 'Could not check the AI usage limit. Please try again.' })
  }
  if (!rl[0].allowed) {
    const wait = rl[0].retry_after_seconds as number
    return json(
      429,
      {
        error: `Too many AI requests. You can make ${RATE_LIMIT} per minute across all AI features. Please wait ${wait} second${wait === 1 ? '' : 's'} and try again.`,
        retry_after_seconds: wait,
        source: 'gym-tracker-rate-limit', // OUR limiter (as opposed to the AI provider's quota)
      },
      { 'Retry-After': String(wait) },
    )
  }
  return { user: data.user, userClient }
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message)
  }
}

// ---------------------------------------------------------------------------------------------
// OpenRouter free-model strategy
// ---------------------------------------------------------------------------------------------
// Preferred order: general-purpose instruct models first, small/niche ones last.
const PREFERRED = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'openrouter/free', // OpenRouter's own free router
  'liquid/lfm-3-1.7b:free',
]
// Never use these for text summaries (vision/video/code/audio specialists).
const EXCLUDE = /(-vl|vision|omni|code|audio|video|note-preview)/i

let cache: { at: number; ids: string[] } | null = null

/** Free text models that exist right now (public catalogue, cached 10 min), preferred ones first. */
async function freeModels(): Promise<string[]> {
  const override = Deno.env.get('OPENROUTER_MODELS')
  if (override) return override.split(',').map((s) => s.trim()).filter(Boolean)
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.ids
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(4000) })
    const { data } = await res.json()
    const live: string[] = (data as { id: string; context_length?: number; architecture?: { output_modalities?: string[] } }[])
      .filter((m) => (m.id.endsWith(':free') || m.id === 'openrouter/free') && !EXCLUDE.test(m.id)
        && (m.context_length ?? 0) >= 32000 && (m.architecture?.output_modalities ?? ['text']).join() === 'text')
      .map((m) => m.id)
    const ordered = [...PREFERRED.filter((id) => live.includes(id)), ...live.filter((id) => !PREFERRED.includes(id))]
    if (ordered.length) { cache = { at: Date.now(), ids: ordered }; return ordered }
  } catch (e) {
    console.error('model catalogue unavailable, using built-in list', String(e))
  }
  return PREFERRED
}

type UpstreamLimit = { scope: 'account-daily' | 'account-minute' | 'model' | 'unknown'; resetAt?: Date; detail: string }

/** Reads OpenRouter's 429 body/headers so we can tell account quota from a single busy model. */
function classify429(bodyText: string, headers: Headers): UpstreamLimit {
  let msg = '', meta: Record<string, string> = {}
  try {
    const j = JSON.parse(bodyText)
    msg = String(j?.error?.message ?? '')
    meta = j?.error?.metadata?.headers ?? {}
  } catch { msg = bodyText.slice(0, 200) }
  const get = (k: string) => headers.get(k) ?? meta[k] ?? meta[k.toLowerCase()]
  const reset = Number(get('X-RateLimit-Reset'))
  const resetAt = reset > 1e9 ? new Date(reset > 1e12 ? reset : reset * 1000) : undefined
  const detail = `${msg} | limit=${get('X-RateLimit-Limit') ?? '?'} remaining=${get('X-RateLimit-Remaining') ?? '?'} reset=${resetAt?.toISOString() ?? '?'}`
  if (/per-day|free-models-per-day|daily/i.test(msg)) return { scope: 'account-daily', resetAt, detail }
  if (/per-min|free-models-per-min/i.test(msg)) return { scope: 'account-minute', resetAt, detail }
  if (/temporarily rate-limited upstream|provider|upstream/i.test(msg)) return { scope: 'model', resetAt, detail }
  return { scope: 'unknown', resetAt, detail }
}

/** Diagnostics only (logs, never returned to users, key never logged): is this key on OpenRouter's free tier? */
async function logKeyStatus(key: string) {
  try {
    const r = await fetch('https://openrouter.ai/api/v1/key', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(4000) })
    const d = (await r.json())?.data ?? {}
    console.error(`openrouter key status http=${r.status} is_free_tier=${d.is_free_tier} limit=${d.limit} limit_remaining=${d.limit_remaining} usage=${d.usage} usage_daily=${d.usage_daily}`)
  } catch (e) { console.error('openrouter key status unavailable', String(e)) }
}

/** Calls OpenRouter FREE models only (ids must end in ":free" or be openrouter/free). The key only exists in Supabase Secrets. */
export async function askModel(system: string, user: string): Promise<{ text: string; model: string }> {
  const key = Deno.env.get('OPENROUTER_API_KEY')
  if (!key) throw new HttpError(503, 'AI is not configured on the server yet (missing OPENROUTER_API_KEY).')
  const deadline = Date.now() + 100_000
  const models = (await freeModels()).filter((m) => m.endsWith(':free') || m === 'openrouter/free') // never a paid model
  let accountLimit: UpstreamLimit | null = null
  let sawBusy = false

  for (const model of models.slice(0, 5)) {
    if (Date.now() > deadline) break
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Gym Tracker' },
        body: JSON.stringify({
          model,
          max_tokens: 1500, // reasoning models spend tokens thinking before they answer
          reasoning: { effort: 'low' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
        signal: AbortSignal.timeout(Math.min(30_000, Math.max(5_000, deadline - Date.now()))),
      })
      if (res.status === 429) {
        const c = classify429(await res.text(), res.headers)
        console.error(`openrouter 429 model=${model} scope=${c.scope} ${c.detail}`)
        if (c.scope === 'account-daily' || c.scope === 'account-minute') { accountLimit = c; await logKeyStatus(key); break } // shared by ALL free models
        sawBusy = true
        continue
      }
      if (!res.ok) { console.error(`openrouter http ${res.status} model=${model} body=${(await res.text()).slice(0, 200)}`); sawBusy = true; continue }
      const out = await res.json()
      const msg = out?.choices?.[0]?.message
      const raw = typeof msg?.content === 'string' ? msg.content
        : Array.isArray(msg?.content) ? msg.content.map((p: { text?: string }) => p?.text ?? '').join('') : ''
      const text = raw.trim()
      if (text) return { text, model: out?.model ?? model }
      console.error('empty model answer', model, 'finish:', out?.choices?.[0]?.finish_reason)
      sawBusy = true
    } catch (e) {
      console.error('model call failed', model, String(e))
      sawBusy = true
    }
  }

  if (accountLimit) {
    const when = accountLimit.resetAt ? ` It resets at ${accountLimit.resetAt.toISOString().replace('T', ' ').slice(0, 16)} UTC.` : ''
    const wait = accountLimit.resetAt ? Math.max(1, Math.ceil((accountLimit.resetAt.getTime() - Date.now()) / 1000)) : undefined
    throw new HttpError(503,
      `The free AI quota of the AI provider is used up (${accountLimit.scope === 'account-daily' ? 'daily' : 'per-minute'} limit shared by all free models).${when}`,
      { source: 'provider-quota', retry_after_seconds: wait })
  }
  throw new HttpError(502, sawBusy
    ? 'The free AI models are busy right now. Please try again in a moment.'
    : 'No free AI model is available right now.', { source: 'provider-busy' })
}
