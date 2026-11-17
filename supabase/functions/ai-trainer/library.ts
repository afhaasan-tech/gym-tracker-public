// The VORA exercise library as the trainer sees it. For SUBSCRIBERS the server picks the candidate exercises BEFORE the model is called
// (library_candidates in the database), the model may only point at one of them by id, and every exercise that reaches the app is built
// HERE from the library record: names, muscles, equipment, cues, safety note and alternatives never come from a model.
// Pure and deterministic: no network, no database.
import { cleanOutput, normAr } from './sanitize.ts'
import { MUSCLES } from './schemas.ts'

export type Muscle = typeof MUSCLES[number]
export type Env = 'gym' | 'home'
export type LibraryExercise = {
  id: string; name_ar: string; name_en: string; primary_muscle: Muscle; secondary_muscles: Muscle[]
  equipment_ar: string; equipment_en: string; difficulty: 'beginner' | 'intermediate' | 'advanced'; environments: Env[]
  default_sets: number; default_reps: string; rest_seconds: number
  cues_ar: string[]; cues_en: string[]; safety_ar: string; safety_en: string
  alternatives: Array<{ id: string; name_ar: string; name_en: string }>
}
/** What a model may say about one exercise: which one (by id) and, optionally, how much. Everything else is ignored. */
export type ExerciseRef = { exercise_id: string; sets: number | null; reps: string | null; rest_seconds: number | null; note: string }
export type PlanRef = { title: string; days: Array<{ day_label: string; focus: string; exercises: ExerciseRef[] }>; notes: string }

export const EXERCISE_ID = /^[a-z0-9-]{2,60}$/
const isMuscle = (v: unknown): v is Muscle => typeof v === 'string' && (MUSCLES as readonly string[]).includes(v)
const str = (v: unknown, max: number): string => (typeof v === 'string' ? cleanOutput(v).replace(/\s+/g, ' ').slice(0, max) : '')
const strList = (v: unknown, max: number, each: number): string[] => (Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, max) : [])

/** Defensive read of what library_candidates() returned: anything that is not a complete, well-formed record is dropped. */
export function parseCandidates(raw: unknown): LibraryExercise[] {
  if (!Array.isArray(raw)) return []
  const out: LibraryExercise[] = [], seen = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue
    const o = r as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : ''
    const name_ar = str(o.name_ar, 80), name_en = str(o.name_en, 80)
    const environments = Array.isArray(o.environments) ? o.environments.filter((e): e is Env => e === 'gym' || e === 'home') : []
    const sets = Number(o.default_sets), rest = Number(o.rest_seconds), reps = str(o.default_reps, 24)
    if (!EXERCISE_ID.test(id) || seen.has(id) || !name_ar || !name_en || !isMuscle(o.primary_muscle) || !environments.length) continue
    if (!Number.isInteger(sets) || sets < 1 || sets > 10 || !Number.isInteger(rest) || rest < 0 || rest > 600 || !reps) continue
    if (o.difficulty !== 'beginner' && o.difficulty !== 'intermediate' && o.difficulty !== 'advanced') continue
    seen.add(id)
    out.push({
      id, name_ar, name_en, primary_muscle: o.primary_muscle, secondary_muscles: Array.isArray(o.secondary_muscles) ? o.secondary_muscles.filter(isMuscle).slice(0, 4) : [],
      equipment_ar: str(o.equipment_ar, 80), equipment_en: str(o.equipment_en, 80), difficulty: o.difficulty, environments,
      default_sets: sets, default_reps: reps, rest_seconds: rest,
      cues_ar: strList(o.cues_ar, 5, 200), cues_en: strList(o.cues_en, 5, 200), safety_ar: str(o.safety_ar, 400), safety_en: str(o.safety_en, 400),
      alternatives: (Array.isArray(o.alternatives) ? o.alternatives : []).map((a) => (a && typeof a === 'object' ? a as Record<string, unknown> : {}))
        .map((a) => ({ id: typeof a.id === 'string' ? a.id : '', name_ar: str(a.name_ar, 80), name_en: str(a.name_en, 80) }))
        .filter((a) => EXERCISE_ID.test(a.id) && a.name_ar && a.name_en).slice(0, 4),
    })
  }
  return out
}

// ---------------------------------------------------------------- which muscles is the member asking about?
// Small bilingual keyword map. Arabic is matched on normAr() text (alef / ya / ta-marbuta folded) and includes everyday Kuwaiti words;
// English is matched on word starts. It only decides WHICH library records are offered to the model, so a miss costs nothing:
// with no match the server offers a balanced set over all muscles.
const KEYWORDS: Array<[Muscle, string[], RegExp]> = [
  ['back', ['ظهر', 'ظهري', 'مجانص', 'ترابيس', 'سحب', 'عقله'], /\b(back|lats?|traps?|rows?|pull[- ]?ups?|chin[- ]?ups?|pull[- ]?downs?|deadlifts?)\b/],
  ['chest', ['صدر', 'صدري', 'بنش', 'ضغط'], /\b(chest|pecs?|pectorals?|bench|push[- ]?ups?|press[- ]?ups?|fl(y|ies|yes))\b/],
  ['shoulders', ['كتف', 'اكتاف', 'جتف', 'جتوف', 'دالي'], /\b(shoulders?|delts?|deltoids?|overhead press|lateral raises?)\b/],
  ['biceps', ['بايسبس', 'بايسيبس', 'باي سبس', 'عضله الذراع الاماميه'], /\b(biceps?|curls?)\b/],
  ['triceps', ['ترايسبس', 'ترايسيبس', 'تراي سبس'], /\b(triceps?|dips?|skull ?crushers?|push[- ]?downs?)\b/],
  ['forearms', ['ساعد', 'سواعد', 'رسغ', 'قبضه', 'زند'], /\b(forearms?|wrists?|grip)\b/],
  ['hips', ['ارجل', 'رجول', 'ريول', 'رجل', 'فخذ', 'افخاذ', 'موخره', 'ارداف', 'ورك', 'سكوات', 'قرفصاء'], /\b(legs?|glutes?|hips?|quads?|hamstrings?|thighs?|squats?|lunges?|booty)\b/],
  ['calf', ['سمانه', 'سمانات', 'بطه الرجل', 'بطات'], /\b(calf|calves)\b/],
  ['abs', ['بطن', 'بطني', 'كرش', 'معده', 'سكس باك', 'بلانك'], /\b(abs|abdominals?|core|six[- ]?pack|planks?|crunch(es)?|sit[- ]?ups?)\b/],
]
/** Muscles named in the text, in the order of the fixed muscle list (at most 4). Empty when none is named. */
export function inferMuscles(text: string): Muscle[] {
  if (!text) return []
  const ar = normAr(text), en = text.toLowerCase()
  return KEYWORDS.filter(([, words, re]) => words.some((w) => ar.includes(w)) || re.test(en)).map(([m]) => m).slice(0, 4)
}
/** A multi-day programme is asked for (more candidates are offered then). */
export const wantsPlan = (text: string): boolean => /(خطه|برنامج|جدول)/.test(normAr(text)) || /\b(plans?|program(me)?s?|routines?|splits?|schedule)\b/i.test(text)

// ---------------------------------------------------------------- building what the app receives, from the library record
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)))
// "8-12", "10", "30 s", "12 each side" ... : a count or a range with an optional short unit. Anything else falls back to the library default.
const REPS = /^\d{1,3}(\s?[-–]\s?\d{1,3})?(\s?(s|sec|secs|seconds|min|each side|per side|ث|ثانيه|ثانية|ثواني|لكل جهه|لكل جهة))?$/i
const volume = (rec: LibraryExercise, ref: ExerciseRef) => ({
  sets: ref.sets === null ? rec.default_sets : clamp(ref.sets, 1, 6),
  reps: ref.reps !== null && REPS.test(ref.reps.trim()) ? ref.reps.trim() : rec.default_reps,
  rest_seconds: ref.rest_seconds === null ? rec.rest_seconds : clamp(ref.rest_seconds, 15, 300),
})
const ALT_REASON = { ar: 'بديل من مكتبة VORA لنفس العضلة', en: 'An alternative from the VORA library for the same muscle' } as const

/** The one-exercise card. Field names are the ones the apps already render; "_ar" text fields carry the member's language. */
export function buildCard(rec: LibraryExercise, ref: ExerciseRef, lang: 'ar' | 'en', environment: Env): Record<string, unknown> {
  const ar = lang === 'ar', alt = rec.alternatives[0]
  return {
    exercise_id: rec.id, source: 'library',
    exercise_name_ar: rec.name_ar, exercise_name_en: rec.name_en, target_muscle: rec.primary_muscle, secondary_muscles: rec.secondary_muscles,
    environment: rec.environments.includes(environment) ? environment : rec.environments[0], equipment: ar ? rec.equipment_ar : rec.equipment_en, difficulty: rec.difficulty,
    ...volume(rec, ref),
    posture_cues: ar ? rec.cues_ar : rec.cues_en, safety: ar ? rec.safety_ar : rec.safety_en,
    alternative: alt ? { name_ar: ar ? alt.name_ar : alt.name_en, reason_ar: ALT_REASON[lang] } : null,
    alternatives: rec.alternatives.map((a) => ({ exercise_id: a.id, name_ar: a.name_ar, name_en: a.name_en })),
    note: ref.note.slice(0, 160),
  }
}

const PLAN_TITLE = { ar: 'خطة تمارين', en: 'Workout plan' } as const
const DAY = { ar: 'اليوم', en: 'Day' } as const
/** The multi-day plan. Exercises whose id is not a candidate are removed; a day left empty is removed; no day left => null. */
export function buildPlan(plan: PlanRef, byId: Map<string, LibraryExercise>, lang: 'ar' | 'en'): Record<string, unknown> | null {
  const ar = lang === 'ar'
  const days = plan.days.map((d) => ({
    day_label: d.day_label, focus: d.focus,
    exercises: d.exercises.flatMap((ref) => {
      const rec = byId.get(ref.exercise_id)
      return rec ? [{ exercise_id: rec.id, source: 'library', name: ar ? rec.name_ar : rec.name_en, name_ar: rec.name_ar, name_en: rec.name_en, target_muscle: rec.primary_muscle, ...volume(rec, ref), note: ref.note.slice(0, 160) }] : []
    }),
  })).filter((d) => d.exercises.length > 0).map((d, i) => ({ ...d, day_label: d.day_label || `${DAY[lang]} ${i + 1}` }))
  return days.length ? { title: plan.title || PLAN_TITLE[lang], days, notes: plan.notes } : null
}

/** The candidate list as it is written into the system prompt (one line per exercise; ids are the only handle the model gets). */
export function candidateLines(c: LibraryExercise[]): string {
  const flat = (s: string) => s.replace(/[\r\n|]+/g, ' ')
  return c.map((e) => `${e.id} | ${flat(e.name_en)} | ${flat(e.name_ar)} | ${e.primary_muscle} | ${flat(e.equipment_en)} | ${e.difficulty} | ${e.default_sets} x ${flat(e.default_reps)}, rest ${e.rest_seconds}s`).join('\n')
}

// ---------------------------------------------------------------- short answers (trial and coins tiers)
/** Hard cap for a short answer: cut at the last sentence end inside the limit (or, failing that, at a word) so it never ends mid-word. */
export function shorten(text: string, max = 320): string {
  if (text.length <= max) return text
  const head = text.slice(0, max), min = Math.min(40, Math.floor(max / 4))      // never cut down to a stub
  let cut = -1
  for (const m of head.matchAll(/[.!?؟…。]+(?=\s|$)|\n/g)) cut = m.index! + (m[0] === '\n' ? 0 : m[0].length)
  if (cut >= min) return head.slice(0, cut).trim()
  const sp = head.lastIndexOf(' ')
  return (sp >= min ? head.slice(0, sp) : head.slice(0, max - 1)).trim() + '…'
}
