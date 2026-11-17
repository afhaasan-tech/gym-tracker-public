// Validation of what a MODEL returned for the VORA trainer, plus the shapes of the cards the APPS receive. Lenient on size (long text is truncated, numbers are clamped, extra keys and
// extra array items are dropped) so a verbose model cannot break the apps; strict on shape (missing card fields, wrong enums) so the
// apps can render a card without defensive code. Anything that does not validate is treated as a provider failure (nothing is charged).
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'   // zod v3 (URL import: identical in Supabase Edge and in local deno test next to the repo package.json)
import { cleanOutput } from './sanitize.ts'

export const MUSCLES = ['back', 'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'hips', 'calf', 'abs'] as const
export const LOCKABLE = ['nutrition', 'plan', 'library'] as const
export type Lockable = typeof LOCKABLE[number]

const toText = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : v)
/** required, non-empty text, truncated to max */
const text = (max: number) => z.preprocess(toText, z.string()).transform((s) => cleanOutput(s).slice(0, max)).refine((s) => s.length > 0, 'empty')
/** optional text: anything unusable becomes '' */
const softText = (max: number) => z.preprocess((v) => (typeof toText(v) === 'string' ? toText(v) : ''), z.string()).transform((s) => cleanOutput(s).slice(0, max))
const nullableText = (max: number) => z.preprocess((v) => { const t = toText(v); return typeof t === 'string' && cleanOutput(t) ? t : null }, z.string().transform((s) => cleanOutput(s).slice(0, max)).nullable())
const toNum = (v: unknown) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v)
const int = (min: number, max: number) => z.preprocess(toNum, z.number().finite()).transform((n) => Math.min(max, Math.max(min, Math.round(n))))
const num = (min: number, max: number) => z.preprocess(toNum, z.number().finite()).transform((n) => Math.min(max, Math.max(min, Math.round(n * 10) / 10)))
const bool = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean())
const softBool = bool.catch(false)
const lower = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : v)
const list = <T extends z.ZodTypeAny>(item: T, max: number) => z.preprocess((v) => (Array.isArray(v) ? v.slice(0, max) : v), z.array(item))
/** array whose invalid items are dropped instead of failing the whole answer */
const softList = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.preprocess((v) => (Array.isArray(v) ? v : []), z.array(z.unknown())).transform((a) => a.map((x) => item.safeParse(x)).filter((r) => r.success).map((r) => (r as z.SafeParseSuccess<z.infer<T>>).data).slice(0, max))
const nullish = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === undefined ? null : v), s.nullable())

// ---------------------------------------------------------------- exercises: what a MODEL may return
// A model never describes an exercise. It points at a library record by id and may choose sets / reps / rest and add a short note;
// core.ts resolves the id against the candidates the server offered and builds the card from the library record (library.ts).
// Deliberately soft: a card or plan exercise the server cannot resolve is DROPPED there, it does not fail the whole answer.
const exerciseId = z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : ''), z.string()).transform((s) => (/^[a-z0-9-]{2,60}$/.test(s) ? s : ''))
const optInt = (min: number, max: number) => int(min, max).nullable().catch(null)
const asObject = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
export const exerciseRef = z.preprocess(asObject, z.object({
  exercise_id: exerciseId,                 // '' when missing or malformed (never matches a library record)
  sets: optInt(1, 10),
  reps: nullableText(24).catch(null),
  rest_seconds: optInt(0, 600),
  note: softText(200),
}))
export const planRef = z.preprocess(asObject, z.object({
  title: softText(100),
  days: softList(z.object({ day_label: softText(40), focus: softText(80), exercises: softList(exerciseRef, 8) }), 7),
  notes: softText(600),
}))

// ---------------------------------------------------------------- exercises: what the APPS receive (built by the server from the library)
export const workoutCard = z.object({
  exercise_id: text(60),
  source: z.literal('library'),
  exercise_name_ar: text(80),
  exercise_name_en: text(80),
  target_muscle: z.enum(MUSCLES),
  secondary_muscles: z.array(z.enum(MUSCLES)),
  environment: z.enum(['gym', 'home']),
  equipment: softText(80),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  sets: z.number().int().min(1).max(10),
  reps: text(24),
  rest_seconds: z.number().int().min(0).max(600),
  posture_cues: z.array(text(200)),
  safety: softText(400),
  alternative: z.object({ name_ar: text(80), reason_ar: text(200) }).nullable(),
  alternatives: z.array(z.object({ exercise_id: text(60), name_ar: text(80), name_en: text(80) })),
  note: softText(160),
})
const planExercise = z.object({
  exercise_id: text(60), source: z.literal('library'), name: text(80), name_ar: text(80), name_en: text(80), target_muscle: z.enum(MUSCLES),
  sets: z.number().int().min(1).max(10), reps: text(24), rest_seconds: z.number().int().min(0).max(600), note: softText(160),
})
const planDay = z.object({
  day_label: text(40),
  focus: softText(80),
  exercises: z.array(planExercise).min(1, 'no exercises').max(8),
})
/** multi-day personalised plan (subscribers only: enforced in core.ts) */
export const workoutPlan = z.object({
  title: text(100),
  days: z.array(planDay).min(1, 'no days').max(7),
  notes: softText(600),
})

// ---------------------------------------------------------------- one meal (plans with nutrition only: enforced in core.ts)
const macros = z.object({ calories: num(0, 5000), protein_g: num(0, 500), carbs_g: num(0, 800), fat_g: num(0, 400) })
const macrosDelta = z.object({ calories: num(-3000, 3000), protein_g: num(-300, 300), carbs_g: num(-500, 500), fat_g: num(-300, 300) })
const substitute = z.object({ name_ar: text(80), store_hint: softText(100), grams: num(0, 5000), household_unit: softText(60), macros_delta_per_serving: macrosDelta })
export const mealCard = z.object({
  meal_name_ar: text(100),
  meal_name_en: text(100),
  servings: int(1, 12),
  prep_minutes: int(0, 600),
  cook_minutes: int(0, 600),
  localized_for: nullableText(60).catch(null),
  macros_per_serving: macros,
  macros_with_substitutes: nullish(macros).catch(null),
  ingredients: list(z.object({ name_ar: text(80), grams: num(0, 5000), household_unit: softText(60), substitute: nullish(substitute).catch(null) }), 25).refine((a) => a.length >= 1, 'no ingredients'),
  steps: list(z.object({ text_ar: text(500), timer_seconds: z.preprocess((v) => (v === undefined ? null : v), int(0, 14400).nullable()).catch(null) }), 15).refine((a) => a.length >= 1, 'no steps'),
})

const safety = z.object({
  injury_reported: softBool,
  injured_area: nullableText(60).catch(null),
  refused: softBool,
  refusal_reason: nullableText(200).catch(null),
  urgent: softBool,
})
export const trainerOutput = z.object({
  chat_reply: text(2000),
  voice_script: softText(700),
  off_topic: softBool,
  safety: z.preprocess((v) => (v && typeof v === 'object' ? v : {}), safety),
  workout_card: nullish(exerciseRef),
  workout_plan: nullish(planRef),
  meal_card: nullish(mealCard),
  /** what the member asked for but the model held back because of the plan (a UI hint only: entitlements are decided in core.ts) */
  withheld: softList(z.preprocess(lower, z.enum(LOCKABLE)), 3),
})
export type TrainerOutput = z.infer<typeof trainerOutput>

/** Extracts the single JSON object from a model answer (tolerates code fences or a stray sentence around it). */
export function parseModelJson(raw: string): unknown {
  const s = raw.trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return undefined
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return undefined }
}

export function validateOutput(raw: string): { ok: true; data: TrainerOutput } | { ok: false; reason: string } {
  const obj = parseModelJson(raw)
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not_json' }
  const r = trainerOutput.safeParse(obj)
  return r.success ? { ok: true, data: r.data } : { ok: false, reason: 'schema:' + (r.error.issues[0]?.path.join('.') ?? '') }
}

// ---------------------------------------------------------------- the same shape for Gemini's responseSchema (OpenAPI subset)
const S = { type: 'STRING' }, I = { type: 'INTEGER' }, N = { type: 'NUMBER' }, B = { type: 'BOOLEAN' }
const NS = { type: 'STRING', nullable: true }
const obj = (properties: Record<string, unknown>, required: string[] = Object.keys(properties), nullable = false) => ({ type: 'OBJECT', properties, required, ...(nullable ? { nullable: true } : {}) })
const arr = (items: unknown) => ({ type: 'ARRAY', items })
const G_MACROS = { calories: N, protein_g: N, carbs_g: N, fat_g: N }
const G_EXERCISE = { exercise_id: S, sets: I, reps: S, rest_seconds: I, note: S }
export const GEMINI_RESPONSE_SCHEMA = obj({
  chat_reply: S, voice_script: S, off_topic: B,
  safety: obj({ injury_reported: B, injured_area: NS, refused: B, refusal_reason: NS, urgent: B }),
  workout_card: obj(G_EXERCISE, ['exercise_id'], true),
  workout_plan: obj({ title: S, days: arr(obj({ day_label: S, focus: S, exercises: arr(obj(G_EXERCISE, ['exercise_id'])) })), notes: S }, ['title', 'days'], true),
  meal_card: obj({
    meal_name_ar: S, meal_name_en: S, servings: I, prep_minutes: I, cook_minutes: I, localized_for: NS,
    macros_per_serving: obj(G_MACROS), macros_with_substitutes: obj(G_MACROS, Object.keys(G_MACROS), true),
    ingredients: arr(obj({ name_ar: S, grams: N, household_unit: S, substitute: obj({ name_ar: S, store_hint: S, grams: N, household_unit: S, macros_delta_per_serving: obj(G_MACROS) }, ['name_ar', 'grams', 'macros_delta_per_serving'], true) }, ['name_ar', 'grams', 'household_unit'])),
    steps: arr(obj({ text_ar: S, timer_seconds: { type: 'INTEGER', nullable: true } }, ['text_ar'])),
  }, ['meal_name_ar', 'meal_name_en', 'servings', 'prep_minutes', 'cook_minutes', 'macros_per_serving', 'ingredients', 'steps'], true),
  withheld: arr({ type: 'STRING', enum: [...LOCKABLE] }),
}, ['chat_reply', 'voice_script', 'off_topic', 'safety'])
