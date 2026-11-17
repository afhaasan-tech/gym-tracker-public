// Provider abstraction for the trainer. 'mock' is deterministic, free and never touches the network. 'anthropic' and 'gemini' are
// implemented but can only run when AI_MODE=live, their key secret exists AND the database budget gate authorises the estimated
// cost (see core.ts). Every provider must answer with ONE JSON object (validated in schemas.ts). Keys never leave this file's caller.
// Media is passed through in memory only: it is never logged and never stored.
import { inferMuscles, type LibraryExercise } from './library.ts'
import type { MediaKind, Tier } from './prompts.ts'
import { REDIRECT } from './prompts.ts'
import { GEMINI_RESPONSE_SCHEMA } from './schemas.ts'

export type Media = { kind: MediaKind; mimeType: string; dataBase64: string; bytes: number }
/** tier + candidates are only read by the mock (a live model gets them through the system prompt): the library exercises the server offers. */
export type ProviderMeta = { message: string; language: 'ar' | 'en'; environment: 'gym' | 'home'; attachmentKind: MediaKind | null; tier?: Tier; candidates?: LibraryExercise[] }
export type ProviderRequest = { system: string; user: string; model: string; maxTokens: number; signal: AbortSignal; media?: Media; meta: ProviderMeta }
export type ProviderResult = { text: string; inputTokens: number; outputTokens: number }
export interface Provider { name: string; call(r: ProviderRequest): Promise<ProviderResult> }

// ---------------------------------------------------------------- what each provider can be given
export type Capability = 'text' | MediaKind
export const CAPABILITIES: Record<string, readonly Capability[]> = {
  mock: ['text'],
  anthropic: ['text', 'image'],
  gemini: ['text', 'image', 'audio', 'video'],
}
export const canHandle = (provider: string, kind: Capability): boolean => (CAPABILITIES[provider] ?? []).includes(kind)
/** The model used when media has to be handed to Gemini because the routed provider cannot take it. */
export const GEMINI_MEDIA_MODEL = 'gemini-2.5-flash'

// USD per 1M tokens == micro-USD per token. Conservative (higher) published rows. Verify before going live.
// A model that is not listed here has no price, so it can never be called (estimateMicro throws -> the attempt is skipped).
export const PRICES: Record<string, { in: number; out: number; audioIn?: number }> = {
  'claude-haiku-5-5': { in: 0.5, out: 2.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5, audioIn: 1 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4, audioIn: 0.3 },
  'mock-model': { in: 0, out: 0 },
}
export const approxTokens = (s: string) => Math.ceil(s.length / 3.2)   // pessimistic for Arabic
export function costMicro(model: string, inTok: number, outTok: number, audio = false): number {
  const p = PRICES[model]; if (!p) throw new Error('no price for model ' + model)
  return Math.ceil(inTok * (audio ? (p.audioIn ?? p.in) : p.in) + outTok * p.out)      // audio request: every input token at the audio rate (never under-counts)
}
/** Pessimistic input-token count for an attachment (used only for the pre-call budget estimate). */
export function mediaTokens(m: Media): number {
  if (m.kind === 'image') return 2000                                    // one image, after the provider's own downscaling
  if (m.kind === 'audio') return Math.ceil((m.bytes / 2000) * 32)        // 32 tokens/s, assuming a very low 16 kbit/s bitrate
  return Math.ceil((m.bytes / 25000) * 300)                              // ~300 tokens/s (frames + audio), assuming >= 200 kbit/s
}
/** Upper bound used BEFORE a billable call. */
export function estimateMicro(model: string, system: string, user: string, maxTokens: number, media?: Media): number {
  const base = costMicro(model, approxTokens(system + user), maxTokens)
  if (!media) return base
  const p = PRICES[model]
  return base + Math.ceil(mediaTokens(media) * (media.kind === 'audio' ? (p.audioIn ?? p.in) : p.in))
}

// ---------------------------------------------------------------- mock (clearly labelled, schema-valid, no network, never "sees" media)
const has = (s: string, words: string[]) => { const t = s.toLowerCase(); return words.some((w) => t.includes(w)) }
const MUSCLE_NAME: Record<string, [string, string]> = {
  back: ['الظهر', 'back'], chest: ['الصدر', 'chest'], shoulders: ['الأكتاف', 'shoulders'], biceps: ['البايسبس', 'biceps'], triceps: ['الترايسبس', 'triceps'],
  forearms: ['الساعد', 'forearms'], hips: ['الأرجل والأرداف', 'legs and glutes'], calf: ['السمانة', 'calves'], abs: ['البطن', 'core'],
}
const NO_LIBRARY_MATCH = { ar: 'ما في تمرين مناسب لهالطلب بمكتبة VORA حالياً.', en: 'There is no matching exercise in the VORA library for this request right now.' }
const NO_MEDIA = { ar: 'وصلني ملفك، بس بالوضع التجريبي ما أقدر أفتح أو أحلل الصور والصوت والفيديو، فما راح أعلّق على محتواه.', en: 'I received your file, but in mock mode I cannot open or inspect images, audio or video, so I will not comment on what it contains.' }

function mockBody(m: ProviderMeta): Record<string, unknown> {
  const ar = m.language === 'ar', msg = m.message
  const safety = { injury_reported: false, injured_area: null, refused: false, refusal_reason: null, urgent: false }
  const base = { off_topic: false, safety, workout_card: null, workout_plan: null, meal_card: null, withheld: [] }
  if (has(msg, ['أبي أموت', 'ابي اموت', 'suicide', 'chest pain', 'ألم بالصدر', 'الم بالصدر'])) {
    return { ...base, safety: { ...safety, urgent: true }, chat_reply: ar ? 'سلامتك أهم شي. اتصل على الطوارئ 112 الحين أو روح أقرب مستشفى، وكلّم أحد قريب منك تثق فيه.' : 'Your safety comes first. Please call emergency services (112) now or go to the nearest hospital, and reach out to someone you trust.', voice_script: ar ? 'سلامتك أهم شي. اتصل على الطوارئ الحين.' : 'Your safety comes first. Please call emergency services now.' }
  }
  if (has(msg, ['capital of', 'python code', 'president', 'عاصمة', 'عاصمه', 'برمج'])) {
    return { ...base, off_topic: true, chat_reply: REDIRECT[m.language], voice_script: REDIRECT[m.language] }
  }
  if (has(msg, ['إصابة', 'اصابة', 'مصاب', 'يعورني', 'injur', 'pain', 'hurt'])) {
    return { ...base, safety: { ...safety, injury_reported: true }, chat_reply: ar ? 'سلامتك! قبل لا أعطيك أي تمرين، وين الإصابة بالضبط؟ وما راح نحمّل على المنطقة المصابة، والأفضل تراجع مختص.' : 'Sorry to hear that. Before I suggest anything, where exactly is the injury? We will not load the injured area, and it is best to have it checked.', voice_script: ar ? 'سلامتك. وين الإصابة بالضبط؟' : 'Sorry to hear that. Where exactly is the injury?' }
  }
  if (has(msg, ['وصفة', 'وصفه', 'recipe', 'أكل', 'اكل']) || /\bmeals?\b/i.test(msg)) {
    return {
      ...base,
      chat_reply: ar ? 'هذي وصفة تجريبية: مجبوس دجاج عالي البروتين. القيم الغذائية تقديرية مو دقيقة.' : 'Here is a mock recipe: high-protein chicken machboos. The nutrition values are estimates, not exact.',
      voice_script: ar ? 'جرّب مجبوس دجاج عالي البروتين، والقيم تقديرية.' : 'Try a high protein chicken machboos. The values are estimates.',
      meal_card: {
        meal_name_ar: ar ? 'مجبوس دجاج عالي البروتين' : 'High-protein chicken machboos', meal_name_en: 'High-protein chicken machboos', servings: 2, prep_minutes: 15, cook_minutes: 40, localized_for: ar ? 'الكويت' : 'Kuwait',
        macros_per_serving: { calories: 560, protein_g: 45, carbs_g: 62, fat_g: 13 },
        macros_with_substitutes: { calories: 480, protein_g: 46, carbs_g: 44, fat_g: 12 },
        ingredients: [
          { name_ar: ar ? 'صدر دجاج بدون جلد' : 'Skinless chicken breast', grams: 350, household_unit: ar ? 'صدرين متوسطين' : '2 medium breasts', substitute: null },
          { name_ar: ar ? 'رز بسمتي' : 'Basmati rice', grams: 150, household_unit: ar ? 'ثلاثة أرباع كوب' : '3/4 cup', substitute: { name_ar: ar ? 'نص رز ونص قرنبيط مبشور' : 'Half rice, half cauliflower rice', store_hint: ar ? 'قسم الخضار المجمدة' : 'Frozen vegetables aisle', grams: 150, household_unit: ar ? 'ثلاثة أرباع كوب' : '3/4 cup', macros_delta_per_serving: { calories: -80, protein_g: 1, carbs_g: -18, fat_g: -1 } } },
          { name_ar: ar ? 'بصل وطماط وبهارات مجبوس' : 'Onion, tomato and machboos spices', grams: 280, household_unit: ar ? 'حبة بصل وحبتين طماط' : '1 onion, 2 tomatoes', substitute: null },
        ],
        steps: [
          { text_ar: ar ? 'حمّس البصل لين يذبل، وضيف الطماط والبهارات.' : 'Soften the onion, then add the tomato and spices.', timer_seconds: null },
          { text_ar: ar ? 'ضيف الدجاج وغطّه بالماي واتركه يستوي.' : 'Add the chicken, cover with water and let it cook.', timer_seconds: 1200 },
          { text_ar: ar ? 'طلّع الدجاج وضيف الرز على المرق على نار هادية، وقدّمه.' : 'Take the chicken out, cook the rice in the stock on low heat, then serve.', timer_seconds: 1080 },
        ],
      },
    }
  }
  // Everything below follows the server's rules: only a subscriber gets a card or a plan, and only with exercises picked (always the
  // same way) from the candidates the server offered. The mock never makes an exercise up.
  const subscriber = m.tier === 'subscriber', lib = m.candidates ?? []
  const ref = (e: LibraryExercise) => ({ exercise_id: e.id, sets: e.default_sets, reps: e.default_reps, rest_seconds: e.rest_seconds, note: '' })
  if (has(msg, ['خطة', 'خطه']) || /\bplans?\b/i.test(msg)) {
    if (!subscriber) {
      return { ...base, withheld: ['plan'], chat_reply: ar ? 'كبداية عامة: مرّن كل عضلة مرتين بالأسبوع وخل بينهم يوم راحة، وزيد الحمل شوي شوي.' : 'As a general start: train each muscle group twice a week with a rest day in between, and add load gradually.', voice_script: ar ? 'مرّن كل عضلة مرتين بالأسبوع وزيد الحمل شوي شوي.' : 'Train each muscle group twice a week and add load gradually.' }
    }
    if (!lib.length) return { ...base, chat_reply: NO_LIBRARY_MATCH[m.language], voice_script: NO_LIBRARY_MATCH[m.language] }
    const perDay = lib.length >= 6 ? 2 : 1, dayCount = Math.min(3, Math.ceil(lib.length / perDay))
    const days = Array.from({ length: dayCount }, (_, i) => {
      const picks = lib.slice(i * perDay, i * perDay + perDay)
      return { day_label: ar ? `اليوم ${i + 1}` : `Day ${i + 1}`, focus: picks.map((e) => MUSCLE_NAME[e.primary_muscle][ar ? 0 : 1]).filter((x, j, all) => all.indexOf(x) === j).join(ar ? ' و' : ' and '), exercises: picks.map(ref) }
    })
    return {
      ...base,
      chat_reply: ar ? `هذي خطة تجريبية من ${dayCount} أيام من مكتبة VORA. ابدأ بأوزان خفيفة وركّز على الأداء الصح.` : `Here is a mock ${dayCount}-day plan from the VORA library. Start light and focus on clean form.`,
      voice_script: ar ? 'هذي خطة تجريبية من مكتبة فورا.' : 'Here is a mock plan from the VORA library.',
      workout_plan: { title: ar ? `خطة تجريبية ${dayCount} أيام` : `Mock ${dayCount}-day plan`, days, notes: ar ? 'خطة تجريبية للاختبار فقط.' : 'Mock plan for testing only.' },
    }
  }
  if (has(msg, ['تمرين', 'exercise'])) {
    const muscles = inferMuscles(msg)
    if (!subscriber) {
      const name = muscles.length ? MUSCLE_NAME[muscles[0]][ar ? 0 : 1] : null
      return {
        ...base, withheld: ['library'],
        chat_reply: ar ? `${name ? `لتمرين ${name}` : 'لأي تمرين'}: اختار وزن تتحكم فيه، وسوّ ٢ إلى ٣ جولات من ٨ إلى ١٢ عدة بأداء صح، ووقّف إذا حسّيت بألم حاد.` : `${name ? `For your ${name}` : 'For any exercise'}: pick a load you can control, do 2 to 3 sets of 8 to 12 clean reps, and stop if you feel sharp pain.`,
        voice_script: ar ? 'اختار وزن تتحكم فيه وسوّ جولتين إلى ثلاث بأداء صح.' : 'Pick a load you can control and do two to three clean sets.',
      }
    }
    const hit = lib.find((e) => muscles.includes(e.primary_muscle)) ?? lib[0]
    if (!hit) return { ...base, chat_reply: NO_LIBRARY_MATCH[m.language], voice_script: NO_LIBRARY_MATCH[m.language] }
    return {
      ...base,
      chat_reply: ar ? `هذا تمرين تجريبي من مكتبة VORA: ${hit.name_ar}. ركّز على الأداء الصح قبل الوزن.` : `Here is a mock exercise from the VORA library: ${hit.name_en}. Focus on clean form before weight.`,
      voice_script: ar ? `جرّب ${hit.name_ar}، وركّز على الأداء الصح.` : `Try the ${hit.name_en} and focus on clean form.`,
      workout_card: ref(hit),
    }
  }
  if (!msg) return { ...base, chat_reply: '', voice_script: '' }
  return { ...base, chat_reply: ar ? 'هذا رد تجريبي من المدرب للتأكد من عمل النظام. اطلب "تمرين" أو "خطة" أو "وصفة".' : 'This is a mock trainer reply used to test the system. Ask for an "exercise", a "plan" or a "recipe".', voice_script: ar ? 'هذا رد تجريبي من المدرب.' : 'This is a mock trainer reply.' }
}
export const mockProvider: Provider = {
  name: 'mock',
  call(r) {
    const body = mockBody(r.meta)
    // the mock never inspects media, whatever it was (or was not) given: it says so first, in every reply that came with a file
    const note = r.meta.attachmentKind ? NO_MEDIA[r.meta.language] : ''
    body.chat_reply = ['[MOCK]', note, body.chat_reply as string].filter(Boolean).join(' ')
    if (note && !body.voice_script) body.voice_script = note
    const text = JSON.stringify(body)
    return Promise.resolve({ text, inputTokens: approxTokens(r.system + r.user), outputTokens: approxTokens(text) })
  },
}

// ---------------------------------------------------------------- live adapters (never run in mock mode)
const liveOnly = () => { if (Deno.env.get('AI_MODE') !== 'live') throw new Error('live provider calls are disabled') }
const JSON_ONLY = '\n\nAnswer with the single JSON object only.'

export function anthropicProvider(apiKey: string): Provider {
  return {
    name: 'anthropic',
    async call(r) {
      liveOnly()
      if (r.media && r.media.kind !== 'image') throw new Error('unsupported_media')           // capability matrix: text + image only
      const content: unknown[] = []
      if (r.media) content.push({ type: 'image', source: { type: 'base64', media_type: r.media.mimeType, data: r.media.dataBase64 } })
      content.push({ type: 'text', text: r.user + JSON_ONLY })
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: r.signal,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        // no sampling parameters and no prefill (rejected by current models); low effort keeps thinking inside max_tokens
        body: JSON.stringify({ model: r.model, max_tokens: r.maxTokens, system: r.system, output_config: { effort: 'low' }, messages: [{ role: 'user', content }] }),
      })
      if (!res.ok) throw new Error('provider_http_' + res.status)
      const j = await res.json()
      if (j.stop_reason === 'refusal') throw new Error('provider_refusal')
      const text = Array.isArray(j.content) ? j.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n') : ''
      return { text, inputTokens: Number(j.usage?.input_tokens ?? 0), outputTokens: Number(j.usage?.output_tokens ?? 0) }
    },
  }
}

const GEMINI_MIME: Record<string, string> = { 'audio/m4a': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'audio/x-wav': 'audio/wav', 'audio/mpeg': 'audio/mp3' }
export function geminiProvider(apiKey: string): Provider {
  return {
    name: 'gemini',
    async call(r) {
      liveOnly()
      if (!/^[a-z0-9][a-z0-9.-]{2,60}$/.test(r.model)) throw new Error('invalid model name')
      const parts: unknown[] = []
      if (r.media) parts.push({ inlineData: { mimeType: GEMINI_MIME[r.media.mimeType] ?? r.media.mimeType, data: r.media.dataBase64 } })
      parts.push({ text: r.user })
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent`, {
        method: 'POST', signal: r.signal,
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },     // key in a header, never in the URL
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: r.system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: GEMINI_RESPONSE_SCHEMA, maxOutputTokens: r.maxTokens, temperature: 0.4 },
        }),
      })
      if (!res.ok) throw new Error('provider_http_' + res.status)
      const j = await res.json()
      const out = j.candidates?.[0]?.content?.parts
      const text = Array.isArray(out) ? out.map((p: { text?: string }) => p.text ?? '').join('') : ''
      const u = j.usageMetadata ?? {}
      return { text, inputTokens: Number(u.promptTokenCount ?? 0), outputTokens: Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0) }
    },
  }
}
