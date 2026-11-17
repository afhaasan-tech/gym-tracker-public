// Input hygiene for the trainer. Everything here is deterministic and runs BEFORE any credit is reserved or any provider is called.
// 1. clean(): strips control, zero-width and bidi-override characters.
// 2. detectInjection(): prompt-injection / XSS / SQL-injection patterns (English + Arabic) -> the request is rejected (400, nothing charged).
// 3. medicalCheck(): steroids / hormones / SARMs ... with dosing or buying intent -> fixed refusal without a provider call.
// 4. urgentCheck(): self-harm / medical-emergency wording. Used ONLY so that a member without AI access gets a safety answer instead of a paywall.

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\u061C\uFEFF]/g
export const clean = (s: string): string => s.normalize('NFC').replace(CONTROL, '').replace(INVISIBLE, '').trim()

/** Text that came back from a model: same cleaning, and no angle brackets (the apps render plain text only). */
export const cleanOutput = (s: string): string => clean(s).replace(/[<>]/g, '')

/** Folds Arabic spelling variants so that one pattern matches the common ways of typing a word. */
export const normAr = (s: string): string =>
  s.toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')      // tashkeel + tatweel
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')

const INJECTION: Array<[string, RegExp]> = [
  // ---- prompt injection (English)
  ['prompt_injection', /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your|the|system)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|guidelines?|restrictions?)\b/i],
  ['prompt_injection', /\b(reveal|show|print|repeat|leak|output|tell me)\b[^.\n]{0,30}\b(system|hidden|initial|secret|developer)\b[^.\n]{0,15}\b(prompt|instructions?|message|rules?)\b/i],
  ['prompt_injection', /\b(jailbreak|dan mode|developer mode|god mode|do anything now)\b/i],
  ['prompt_injection', /\b(act|behave|respond|pretend)\b[^.\n]{0,25}\b(unrestricted|uncensored|unfiltered|without (any )?(rules|restrictions|filters|limits))\b/i],
  ['prompt_injection', /\byou are (now|no longer)\b[^.\n]{0,40}\b(ai|assistant|model|bot|chatgpt|gpt|dan|coach)\b/i],
  ['prompt_injection', /<\/?\s*(system|assistant|instructions?|prompt)\s*>|\[\/?\s*(inst|system)\s*\]|<\|[a-z_]+\|>/i],
  ['prompt_injection', /\bnew (system )?(instructions?|rules?)\s*:/i],
  // ---- XSS / markup
  ['xss', /<\s*\/?\s*(script|iframe|object|embed|svg|img|link|meta|style|body|form)\b/i],
  ['xss', /\bjavascript\s*:|\bdata\s*:\s*text\/html|\bon(error|load|click|mouseover|focus)\s*=|document\.(cookie|location)|\bwindow\.location\b/i],
  // ---- SQL injection
  ['sqli', /\bunion\s+(all\s+)?select\b|\bdrop\s+(table|database|schema)\b|\btruncate\s+table\b|\binsert\s+into\s+\w+\s*(\(|values)|\bdelete\s+from\s+\w+\s+where\b|\bupdate\s+\w+\s+set\s+\w+\s*=|\bselect\s+[\w*,\s]+\s+from\s+\w+\s+where\b/i],
  ['sqli', /['"]\s*(or|and)\s+['"]?\w+['"]?\s*=\s*['"]?\w+|\bor\s+1\s*=\s*1\b|;\s*--|'\s*--|\bxp_cmdshell\b|\binformation_schema\b|\bpg_sleep\s*\(|\bwaitfor\s+delay\b/i],
]
// Arabic patterns run on normAr() text (alef/ya/ta-marbuta folded).
const INJECTION_AR: Array<[string, RegExp]> = [
  ['prompt_injection', /(تجاهل|تجاهلي|انس|انسي|انسى|اهمل|تخط|تخطي|الغ|الغي)\s+(كل\s+|جميع\s+|اي\s+)?(ال)?(تعليمات|اوامر|قواعد|قوانين|قيود|ارشادات|برومبت)/],
  ['prompt_injection', /(اكشف|اعرض|اطبع|اظهر|ورني|عطني|اعطني|قول لي|قل لي|كرر)\s+.{0,30}(برومبت|تعليمات النظام|رساله النظام|تعليماتك|التعليمات السريه|التعليمات المخفيه|system prompt)/],
  ['prompt_injection', /(وضع المطور|بدون قيود|بلا قيود|بدون قواعد|من دون قيود|بدون فلتر)/],
  ['prompt_injection', /(انت الان|انت الحين|من الحين انت)\s+.{0,30}(مو مدرب|لست|بدون|غير مقيد|مساعد حر)/],
  ['prompt_injection', /تعليمات جديده\s*:/],
]

/** Returns the kind of attack detected, or null. Never returns or logs the text itself. */
export function detectInjection(text: string): string | null {
  if (!text) return null
  for (const [kind, re] of INJECTION) if (re.test(text)) return kind
  const ar = normAr(text)
  for (const [kind, re] of INJECTION_AR) if (re.test(ar)) return kind
  return null
}

// ---------------------------------------------------------------- medical pre-flight
// Named performance-enhancing drugs: ANY dosing/buying intent next to them is refused.
const SUBSTANCE_EN = /\b(steroids?|anabolics?|anabolic|testosterone|trenbolone|tren|dianabol|dbol|anavar|oxandrolone|winstrol|stanozolol|deca|nandrolone|clenbuterol|clen|hgh|growth hormone|sarms?|ostarine|ligandrol|rad[- ]?140|mk[- ]?677|peptides?|pct|prohormones?|insulin|t3|ephedrine|dnp)\b/i
const SUBSTANCE_AR = /(ستيرويد|سترويد|ستيرود|منشطات|منشط|تستوستيرون|تستسترون|تيستوستيرون|هرمون النمو|هرمون نمو|سارمز|سارمس|كلينبوترول|كلنبترول|ديكا|دايانابول|ديانابول|انافار|وينسترول|ترينبولون|تربتايد|ببتيد|انسولين|ابر عضل|ابر تضخيم|حبوب تضخيم|كورس تضخيم|كورس تنشيف)/
// Generic words: only refused with an explicit dose / inject / buy intent ("how much" alone is not enough).
const GENERIC_EN = /\b(hormones?|hormonal)\b/i
const GENERIC_AR = /(هرمون|هرمونات)/
const INTENT_EN = /\b(dos(e|es|age|ing)|how (much|many)|mgs?|ml|iu|milligrams?|cycle|stack|inject(ion|ing|s)?|pin|buy|purchase|order|where (can i|to|do i) (get|buy|find)|source|supplier|dealer|price|cost|per (day|week)|a (day|week)|should i take|can i take|start taking)\b/i
const INTENT_AR = /(جرعه|جرعات|كم (ملغ|ملي|مل|حبه|ابره|مره|وحده|غرام|جرام)|كم اخذ|كم اخد|اخذ كم|كم استخدم|استخدم كم|كورس|دوره|اشتري|اشتريه|شراء|اشراء|وين القي|وين القا|وين احصل|من وين|اطلب|اطلبه|سعر|بكم|احقن|حقن|ابره|ابر|ملغ|ابدا اخذ|ابدي اخذ|ابدا فيه|كيف اخذ|شلون اخذ|كيف استخدم|شلون استخدم)/
const STRONG_INTENT_EN = /\b(dos(e|es|age|ing)|mgs?|ml|iu|inject(ion|ing|s)?|buy|purchase|order|where (can i|to|do i) (get|buy|find)|cycle|supplier|dealer)\b/i
const STRONG_INTENT_AR = /(جرعه|جرعات|ملغ|احقن|حقن|ابره|ابر|اشتري|شراء|وين القي|وين احصل|من وين|كورس)/

export type MedicalLevel = 'none' | 'flag' | 'hard'
/** 'hard' = refuse without calling a provider; 'flag' = a substance/hormone is mentioned, the prompt gets an extra caution. */
export function medicalCheck(text: string): MedicalLevel {
  if (!text) return 'none'
  const ar = normAr(text)
  const named = SUBSTANCE_EN.test(text) || SUBSTANCE_AR.test(ar)
  const generic = GENERIC_EN.test(text) || GENERIC_AR.test(ar)
  if (!named && !generic) return 'none'
  if (named && (INTENT_EN.test(text) || INTENT_AR.test(ar))) return 'hard'
  if (STRONG_INTENT_EN.test(text) || STRONG_INTENT_AR.test(ar)) return 'hard'
  return 'flag'
}

export const MEDICAL_REFUSAL = {
  ar: {
    chat_reply: 'أعتذر منك، ما أقدر أساعد في جرعات أو مصادر الهرمونات أو المنشطات أو أي مواد مشابهة. هذي أمور طبية ولازم يكون قرارها ومتابعتها مع طبيب مختص. أقدر أساعدك بخطة تمرين وتغذية آمنة توصلك لهدفك بدونها، تحب نبدأ؟',
    voice_script: 'أعتذر، ما أقدر أساعد في جرعات أو مصادر الهرمونات والمنشطات. راجع طبيب مختص، وأنا حاضر أساعدك بالتمرين والتغذية.',
  },
  en: {
    chat_reply: 'I am sorry, I cannot help with doses or sources for hormones, steroids or similar substances. That is a medical matter and must be decided and monitored by a qualified doctor. I can help you with a safe training and nutrition plan to reach your goal without them. Shall we start?',
    voice_script: 'Sorry, I cannot help with doses or sources for hormones or steroids. Please see a qualified doctor. I am happy to help with training and nutrition.',
  },
} as const

// ---------------------------------------------------------------- urgent safety (deterministic net for members WITHOUT AI access)
const URGENT_EN = /\b(suicid(e|al)|kill myself|end my life|want to die|self[- ]harm|hurt myself|chest pain|pain in my chest|short(ness)? of breath|heart attack|can'?t breathe|cannot breathe|overdos(e|ed)|being abused)\b/i
const URGENT_AR = /(ابي اموت|ابغي اموت|اريد اموت|ودي اموت|انتحر|انتحار|اذي نفسي|ااذي نفسي|اقتل نفسي|الم بالصدر|الم في الصدر|الم بصدري|وجع بالصدر|الم قوي بصدري|الم قوي بالصدر|ضيق تنفس|ضيق نفس|ضيقه تنفس|جلطه|ما اقدر اتنفس|مو قادر اتنفس|جرعه زايده)/
export function urgentCheck(text: string): boolean {
  if (!text) return false
  return URGENT_EN.test(text) || URGENT_AR.test(normAr(text))
}
export const URGENT_REPLY = {
  ar: {
    chat_reply: 'سلامتك أهم شي. إذا حاس بخطر على نفسك أو عندك عارض صحي طارئ، اتصل على الطوارئ 112 الحين أو روح أقرب مستشفى، وكلّم أحد قريب منك تثق فيه. أنا مدرب لياقة وما أقدر أساعد بهالشي، بس لا تتأخر تطلب المساعدة من مختص.',
    voice_script: 'سلامتك أهم شي. اتصل على الطوارئ الحين أو روح أقرب مستشفى، وكلّم أحد تثق فيه.',
  },
  en: {
    chat_reply: 'Your safety comes first. If you feel you may be in danger or this is a medical emergency, please call your local emergency number (112 in Kuwait) now or go to the nearest hospital, and reach out to someone you trust. I am a fitness coach and cannot help with this, but please do not wait to get help from a professional.',
    voice_script: 'Your safety comes first. Please call emergency services now or go to the nearest hospital, and reach out to someone you trust.',
  },
} as const
