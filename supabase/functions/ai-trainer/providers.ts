// Provider abstraction for the trainer. 'mock' is deterministic, free and never touches the network. 'anthropic' and 'gemini' are
// implemented but can only run when AI_MODE=live, their key secret exists AND the database budget gate authorises the estimated
// cost (see core.ts). Every provider must answer with ONE JSON object (validated in schemas.ts). Keys never leave this file's caller.
// Media is passed through in memory only: it is never logged and never stored.
import type { MediaKind } from './prompts.ts'
import { REDIRECT } from './prompts.ts'
import { GEMINI_RESPONSE_SCHEMA } from './schemas.ts'

export type Media = { kind: MediaKind; mimeType: string; dataBase64: string; bytes: number }
export type ProviderMeta = { message: string; language: 'ar' | 'en'; environment: 'gym' | 'home'; attachmentKind: MediaKind | null }
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
const MUSCLE_WORDS: Array<[string, string[], string, string]> = [
  ['back', ['ظهر', 'back', 'lat'], 'سحب أرضي بالدمبل', 'Dumbbell Row'],
  ['shoulders', ['كتف', 'أكتاف', 'اكتاف', 'shoulder'], 'ضغط أكتاف بالدمبل', 'Dumbbell Shoulder Press'],
  ['biceps', ['بايسبس', 'باي', 'bicep'], 'تبادل دمبل للبايسبس', 'Dumbbell Biceps Curl'],
  ['triceps', ['ترايسبس', 'تراي', 'tricep'], 'تمديد ترايسبس فوق الرأس', 'Overhead Triceps Extension'],
  ['forearms', ['ساعد', 'forearm'], 'ثني الرسغ بالدمبل', 'Dumbbell Wrist Curl'],
  ['hips', ['أرجل', 'ارجل', 'رجل', 'مؤخرة', 'ورك', 'سكوات', 'leg', 'glute', 'hip', 'squat'], 'سكوات بالدمبل', 'Goblet Squat'],
  ['calf', ['سمانة', 'سمانه', 'calf', 'calves'], 'رفع السمانة واقف', 'Standing Calf Raise'],
  ['abs', ['بطن', 'معدة', 'abs', 'core'], 'بلانك', 'Plank'],
  ['chest', ['صدر', 'chest'], 'ضغط صدر بالدمبل', 'Dumbbell Bench Press'],
]
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
  if (has(msg, ['خطة', 'خطه']) || /\bplans?\b/i.test(msg)) {
    const ex = (name: string) => ({ name, sets: 3, reps: '8-12', rest_seconds: 90 })
    return {
      ...base,
      chat_reply: ar ? 'هذي خطة تجريبية من ٣ أيام. ابدأ بأوزان خفيفة وركّز على الأداء الصح.' : 'Here is a mock 3-day plan. Start light and focus on clean form.',
      voice_script: ar ? 'هذي خطة تجريبية من ثلاثة أيام.' : 'Here is a mock three day plan.',
      workout_plan: {
        title: ar ? 'خطة تجريبية ٣ أيام' : 'Mock 3-day plan',
        days: [
          { day_label: ar ? 'اليوم ١' : 'Day 1', focus: ar ? 'دفع: صدر وأكتاف' : 'Push: chest and shoulders', exercises: [ex(ar ? 'ضغط صدر بالدمبل' : 'Dumbbell Bench Press'), ex(ar ? 'ضغط أكتاف' : 'Shoulder Press')] },
          { day_label: ar ? 'اليوم ٢' : 'Day 2', focus: ar ? 'سحب: ظهر وبايسبس' : 'Pull: back and biceps', exercises: [ex(ar ? 'سحب بالدمبل' : 'Dumbbell Row'), ex(ar ? 'تبادل دمبل' : 'Biceps Curl')] },
          { day_label: ar ? 'اليوم ٣' : 'Day 3', focus: ar ? 'أرجل وبطن' : 'Legs and core', exercises: [ex(ar ? 'سكوات' : 'Goblet Squat'), ex(ar ? 'بلانك' : 'Plank')] },
        ],
        notes: ar ? 'خطة تجريبية للاختبار فقط.' : 'Mock plan for testing only.',
      },
    }
  }
  if (has(msg, ['تمرين', 'exercise'])) {
    const hit = MUSCLE_WORDS.find(([, words]) => has(msg, words)) ?? MUSCLE_WORDS[MUSCLE_WORDS.length - 1]
    const home = m.environment === 'home'
    return {
      ...base,
      chat_reply: ar ? `هذا تمرين تجريبي: ${hit[2]}. ركّز على الأداء الصح قبل الوزن.` : `Here is a mock exercise: ${hit[3]}. Focus on clean form before weight.`,
      voice_script: ar ? `جرّب ${hit[2]}، وركّز على الأداء الصح.` : `Try the ${hit[3]} and focus on clean form.`,
      workout_card: {
        exercise_name_ar: hit[2], exercise_name_en: hit[3], target_muscle: hit[0], secondary_muscles: hit[0] === 'chest' ? ['triceps', 'shoulders'] : hit[0] === 'back' ? ['biceps'] : [],
        environment: m.environment, equipment: home ? (ar ? 'دمبل أو قناني ماي' : 'Dumbbells or water bottles') : (ar ? 'دمبل وبنش' : 'Dumbbells and a bench'),
        sets: 3, reps: '10-12', rest_seconds: 75,
        posture_cues: ar ? ['شد بطنك وخل ظهرك مستقيم', 'انزل ببطء وتحكم بالحركة', 'لا تقفل المفصل بقوة فوق'] : ['Brace your core and keep a neutral spine', 'Lower slowly and stay in control', 'Do not lock the joint hard at the top'],
        alternative: { name_ar: home ? (ar ? 'نفس التمرين على جهاز بالنادي' : 'Machine version at the gym') : (ar ? 'نسخة البيت بوزن الجسم' : 'Bodyweight version at home'), reason_ar: ar ? 'بديل إذا ما توفرت المعدات' : 'An option when the equipment is not available' },
      },
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
