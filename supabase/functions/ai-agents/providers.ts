// Provider abstraction for the agents. 'mock' is deterministic, free and never touches the network. 'anthropic' and 'gemini' are
// implemented but can only run when AI_MODE=live, their key secret exists AND the database budget gate authorises the estimated
// cost (see core.ts). Every provider must answer with ONE JSON object (validated in schemas.ts). Keys never leave this file's caller.
import type { AgentRole } from './schemas.ts'

export type ProviderMeta = { role: AgentRole; message: string; language: 'ar' | 'en'; environment: 'gym' | 'home'; userTurns: number }
export type ProviderRequest = { system: string; user: string; model: string; maxTokens: number; signal: AbortSignal; meta: ProviderMeta }
export type ProviderResult = { text: string; inputTokens: number; outputTokens: number }
export interface Provider { name: string; call(r: ProviderRequest): Promise<ProviderResult> }

// USD per 1M tokens == micro-USD per token. Conservative (higher) published rows. Verify before going live.
// A model that is not listed here has no price, so it can never be called (estimateMicro throws -> the attempt is skipped).
export const PRICES: Record<string, { in: number; out: number }> = {
  'claude-haiku-5-5': { in: 0.5, out: 2.5 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
  'mock-model': { in: 0, out: 0 },
}
export const approxTokens = (s: string) => Math.ceil(s.length / 3.2)   // pessimistic for Arabic
export function costMicro(model: string, inTok: number, outTok: number): number {
  const p = PRICES[model]; if (!p) throw new Error('no price for model ' + model)
  return Math.ceil(inTok * p.in + outTok * p.out)
}
/** Upper bound used BEFORE a billable call. */
export const estimateMicro = (model: string, system: string, user: string, maxTokens: number) => costMicro(model, approxTokens(system + user), maxTokens)

// ---------------------------------------------------------------- mock (clearly labelled, schema-valid, no network)
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
function mockCoach(m: ProviderMeta) {
  const ar = m.language === 'ar'
  const injury = has(m.message, ['إصابة', 'اصابة', 'مصاب', 'ألم', 'الم ', 'يعورني', 'injur', 'pain', 'hurt'])
  if (injury) {
    return {
      chat_reply: ar ? '[MOCK] سلامتك! قبل لا أعطيك أي تمرين، وين الإصابة بالضبط؟ وما راح نحمّل على المنطقة المصابة، والأفضل تراجع مختص.' : '[MOCK] Sorry to hear that. Before I suggest anything, where exactly is the injury? We will not load the injured area, and it is best to have it checked.',
      voice_script: ar ? 'سلامتك. وين الإصابة بالضبط؟' : 'Sorry to hear that. Where exactly is the injury?',
      safety: { injury_reported: true, injured_area: null, refused: false, refusal_reason: null }, workout_card: null,
    }
  }
  const safety = { injury_reported: false, injured_area: null, refused: false, refusal_reason: null }
  if (!has(m.message, ['تمرين', 'exercise'])) {
    return { chat_reply: ar ? '[MOCK] هذا رد تجريبي من المدرب للتأكد من عمل النظام. اطلب "تمرين" عشان تطلع لك بطاقة تمرين.' : '[MOCK] This is a mock coach reply used to test the system. Ask for an "exercise" to get a workout card.', voice_script: ar ? 'هذا رد تجريبي من المدرب.' : 'This is a mock coach reply.', safety, workout_card: null }
  }
  const hit = MUSCLE_WORDS.find(([, words]) => has(m.message, words)) ?? MUSCLE_WORDS[MUSCLE_WORDS.length - 1]
  const home = m.environment === 'home'
  return {
    chat_reply: ar ? `[MOCK] هذا تمرين تجريبي: ${hit[2]}. ركّز على الأداء الصح قبل الوزن.` : `[MOCK] Here is a mock exercise: ${hit[3]}. Focus on clean form before weight.`,
    voice_script: ar ? `جرّب ${hit[2]}، وركّز على الأداء الصح.` : `Try the ${hit[3]} and focus on clean form.`,
    safety,
    workout_card: {
      exercise_name_ar: hit[2], exercise_name_en: hit[3], target_muscle: hit[0], secondary_muscles: hit[0] === 'chest' ? ['triceps', 'shoulders'] : hit[0] === 'back' ? ['biceps'] : [],
      environment: m.environment, equipment: home ? (ar ? 'دمبل أو قناني ماي' : 'Dumbbells or water bottles') : (ar ? 'دمبل وبنش' : 'Dumbbells and a bench'),
      sets: 3, reps: '10-12', rest_seconds: 75,
      posture_cues: ar ? ['شد بطنك وخل ظهرك مستقيم', 'انزل ببطء وتحكم بالحركة', 'لا تقفل المفصل بقوة فوق'] : ['Brace your core and keep a neutral spine', 'Lower slowly and stay in control', 'Do not lock the joint hard at the top'],
      alternative: { name_ar: home ? (ar ? 'نفس التمرين على جهاز بالنادي' : 'Machine version at the gym') : (ar ? 'نسخة البيت بوزن الجسم' : 'Bodyweight version at home'), reason_ar: ar ? 'بديل إذا ما توفرت المعدات' : 'An option when the equipment is not available' },
    },
  }
}
function mockNutritionist(m: ProviderMeta) {
  const ar = m.language === 'ar'
  if (!has(m.message, ['وصفة', 'وصفه', 'recipe', 'مجبوس'])) {
    return { chat_reply: ar ? '[MOCK] هذا رد تجريبي من أخصائي التغذية. اطلب "وصفة" عشان تطلع لك بطاقة وجبة. الأرقام دايماً تقديرية.' : '[MOCK] This is a mock nutritionist reply. Ask for a "recipe" to get a meal card. Numbers are always estimates.', voice_script: ar ? 'هذا رد تجريبي من أخصائي التغذية.' : 'This is a mock nutritionist reply.', meal_card: null }
  }
  return {
    chat_reply: ar ? '[MOCK] هذي وصفة تجريبية: مجبوس دجاج عالي البروتين. القيم الغذائية تقديرية مو دقيقة.' : '[MOCK] Here is a mock recipe: high-protein chicken machboos. The nutrition values are estimates, not exact.',
    voice_script: ar ? 'جرّب مجبوس دجاج عالي البروتين، والقيم تقديرية.' : 'Try a high protein chicken machboos. The values are estimates.',
    meal_card: {
      meal_name_ar: ar ? 'مجبوس دجاج عالي البروتين' : 'High-protein chicken machboos', meal_name_en: 'High-protein chicken machboos', servings: 2, prep_minutes: 15, cook_minutes: 40, localized_for: ar ? 'الكويت' : 'Kuwait',
      macros_per_serving: { calories: 560, protein_g: 45, carbs_g: 62, fat_g: 13 },
      macros_with_substitutes: { calories: 480, protein_g: 46, carbs_g: 44, fat_g: 12 },
      ingredients: [
        { name_ar: ar ? 'صدر دجاج بدون جلد' : 'Skinless chicken breast', grams: 350, household_unit: ar ? 'صدرين متوسطين' : '2 medium breasts', substitute: null },
        { name_ar: ar ? 'رز بسمتي' : 'Basmati rice', grams: 150, household_unit: ar ? 'ثلاثة أرباع كوب' : '3/4 cup', substitute: { name_ar: ar ? 'نص رز ونص قرنبيط مبشور' : 'Half rice, half cauliflower rice', store_hint: ar ? 'قسم الخضار المجمدة' : 'Frozen vegetables aisle', grams: 150, household_unit: ar ? 'ثلاثة أرباع كوب' : '3/4 cup', macros_delta_per_serving: { calories: -80, protein_g: 1, carbs_g: -18, fat_g: -1 } } },
        { name_ar: ar ? 'بصل' : 'Onion', grams: 120, household_unit: ar ? 'حبة متوسطة' : '1 medium', substitute: null },
        { name_ar: ar ? 'طماط' : 'Tomato', grams: 150, household_unit: ar ? 'حبتين' : '2 pieces', substitute: null },
        { name_ar: ar ? 'بهارات مجبوس ولومي' : 'Machboos spices and dried lime', grams: 10, household_unit: ar ? 'ملعقة أكل' : '1 tablespoon', substitute: null },
        { name_ar: ar ? 'زيت زيتون' : 'Olive oil', grams: 10, household_unit: ar ? 'ملعقتين صغار' : '2 teaspoons', substitute: null },
      ],
      steps: [
        { text_ar: ar ? 'حمّس البصل بالزيت لين يذبل، وضيف الطماط والبهارات.' : 'Soften the onion in the oil, then add the tomato and spices.', timer_seconds: null },
        { text_ar: ar ? 'ضيف الدجاج وقلّبه، وغطّه بالماي واتركه يستوي.' : 'Add the chicken, stir, cover with water and let it cook.', timer_seconds: 1200 },
        { text_ar: ar ? 'طلّع الدجاج وضيف الرز على المرق واتركه على نار هادية.' : 'Take the chicken out, add the rice to the stock and cook on low heat.', timer_seconds: 1080 },
        { text_ar: ar ? 'قدّم الرز وفوقه الدجاج.' : 'Serve the rice with the chicken on top.', timer_seconds: null },
      ],
    },
  }
}
function mockSupport(m: ProviderMeta) {
  const ar = m.language === 'ar'
  if (has(m.message, ['تذكرة', 'تذكره', 'ticket', 'refund'])) {
    const billing = has(m.message, ['refund', 'استرجاع', 'استرداد', 'دفع', 'payment', 'فلوس'])
    return {
      chat_reply: ar ? '[MOCK] رد تجريبي: ما أقدر أوعدك بشي بخصوص المبالغ، بس راح أفتح لك تذكرة دعم عشان الفريق يراجع الموضوع.' : '[MOCK] Mock reply: I cannot promise anything about amounts, but I will open a support ticket so the team can review it.',
      voice_script: ar ? 'راح أفتح لك تذكرة دعم.' : 'I will open a support ticket for you.',
      resolved: false, create_support_ticket: true,
      ticket_draft: { category: billing ? 'billing' : 'other', priority: 'normal', summary: ar ? 'تذكرة تجريبية: العضو طلب مراجعة من فريق الدعم.' : 'Mock ticket: the member asked the support team to review an issue.' },
      suggested_actions: [],
    }
  }
  const device = has(m.message, ['جهاز', 'أجهزة', 'اجهزة', 'device'])
  return {
    chat_reply: ar ? '[MOCK] رد تجريبي من الدعم: حسابك يشتغل على جهازين موثوقين، والجهاز الثالث يستبدل الأقدم. الدفع عن طريق UPayments (كي نت وبطاقات) وهو حالياً بوضع الاختبار فقط.' : '[MOCK] Mock support reply: your account works on 2 trusted devices and a 3rd device replaces the oldest. Payments go through UPayments (KNET and cards) and are currently in test mode only.',
    voice_script: ar ? 'هذا رد تجريبي من الدعم.' : 'This is a mock support reply.',
    resolved: m.userTurns < 2, create_support_ticket: false, ticket_draft: null,
    suggested_actions: device ? [{ action: 'manage_devices', label_ar: ar ? 'إدارة الأجهزة' : 'Manage devices' }] : [],
  }
}
export const mockProvider: Provider = {
  name: 'mock',
  call(r) {
    const body = r.meta.role === 'coach' ? mockCoach(r.meta) : r.meta.role === 'nutritionist' ? mockNutritionist(r.meta) : mockSupport(r.meta)
    const text = JSON.stringify(body)
    return Promise.resolve({ text, inputTokens: approxTokens(r.system + r.user), outputTokens: approxTokens(text) })
  },
}

// ---------------------------------------------------------------- live adapters (never run in mock mode)
const liveOnly = () => { if (Deno.env.get('AI_MODE') !== 'live') throw new Error('live provider calls are disabled') }

export function anthropicProvider(apiKey: string): Provider {
  return {
    name: 'anthropic',
    async call(r) {
      liveOnly()
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: r.signal,
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: r.model, max_tokens: r.maxTokens, system: r.system, messages: [{ role: 'user', content: r.user + '\n\nAnswer with the single JSON object only.' }] }),
      })
      if (!res.ok) throw new Error('provider_http_' + res.status)
      const j = await res.json()
      const text = Array.isArray(j.content) ? j.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n') : ''
      return { text, inputTokens: Number(j.usage?.input_tokens ?? 0), outputTokens: Number(j.usage?.output_tokens ?? 0) }
    },
  }
}

export function geminiProvider(apiKey: string): Provider {
  return {
    name: 'gemini',
    async call(r) {
      liveOnly()
      if (!/^[a-z0-9][a-z0-9.-]{2,60}$/.test(r.model)) throw new Error('invalid model name')
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${r.model}:generateContent`, {
        method: 'POST', signal: r.signal,
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },     // key in a header, never in the URL
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: r.system }] },
          contents: [{ role: 'user', parts: [{ text: r.user }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: r.maxTokens, temperature: 0.4 },
        }),
      })
      if (!res.ok) throw new Error('provider_http_' + res.status)
      const j = await res.json()
      const parts = j.candidates?.[0]?.content?.parts
      const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text ?? '').join('') : ''
      const u = j.usageMetadata ?? {}
      return { text, inputTokens: Number(u.promptTokenCount ?? 0), outputTokens: Number(u.candidatesTokenCount ?? 0) + Number(u.thoughtsTokenCount ?? 0) }
    },
  }
}
