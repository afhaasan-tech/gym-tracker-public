// Provider abstraction. 'mock' is deterministic and free. 'anthropic' is implemented but can only run when AI_MODE=live,
// a key secret exists, AND the database budget gate authorises the estimated cost (see core.ts). Keys never leave this file's caller.
export type ProviderRequest = { system: string; user: string; model: string; maxTokens: number; signal: AbortSignal }
export type ProviderResult = { text: string; inputTokens: number; outputTokens: number }
export interface Provider { name: string; call(r: ProviderRequest): Promise<ProviderResult> }

// USD per 1M tokens == micro-USD per token. Conservative (higher) published rows; see docs/VORA-PROVIDER-RESEARCH.md. Verify before going live.
export const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.5, out: 2.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'mock-model': { in: 0, out: 0 },
}
export const approxTokens = (s: string) => Math.ceil(s.length / 3.2)   // pessimistic for Arabic
export function costMicro(model: string, inTok: number, outTok: number): number {
  const p = PRICES[model]; if (!p) throw new Error('no price for model ' + model)
  return Math.ceil(inTok * p.in + outTok * p.out)
}
/** Upper bound used BEFORE a billable call. */
export const estimateMicro = (model: string, system: string, user: string, maxTokens: number) => costMicro(model, approxTokens(system + user), maxTokens)

export const mockProvider: Provider = {
  name: 'mock',
  call(r) {
    const arabic = /[؀-ۿ]/.test(r.system.slice(0, 600)) && /Kuwaiti/.test(r.system)
    const head = arabic ? '[رد تجريبي – مزوّد وهمي] ' : '[MOCK REPLY – no real AI call] '
    const text = (head + (arabic ? 'هذا رد تجريبي للتأكد من عمل النظام. رسالتك: ' : 'This is a mock reply used to test the system. Your message: ') + r.user.slice(0, 200)).slice(0, r.maxTokens * 3)
    return Promise.resolve({ text, inputTokens: approxTokens(r.system + r.user), outputTokens: approxTokens(text) })
  },
}

export function anthropicProvider(apiKey: string): Provider {
  return {
    name: 'anthropic',
    async call(r) {
      if (Deno.env.get('AI_MODE') !== 'live') throw new Error('live provider calls are disabled')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: r.signal,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: r.model, max_tokens: r.maxTokens, system: r.system, messages: [{ role: 'user', content: r.user }] }),
      })
      if (!res.ok) throw new Error('provider_http_' + res.status)
      const j = await res.json()
      const text = Array.isArray(j.content) ? j.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n') : ''
      return { text, inputTokens: Number(j.usage?.input_tokens ?? 0), outputTokens: Number(j.usage?.output_tokens ?? 0) }
    },
  }
}
