// Validation of what a MODEL returned for the VORA trainer. Lenient on size (long text is truncated, numbers are clamped, extra keys and
// extra array items are dropped) so a verbose model cannot break the apps; strict on shape (missing card fields, wrong enums) so the
// apps can render a card without defensive code. Anything that does not validate is treated as a provider failure (nothing is charged).
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'   // zod v3 (URL import: identical in Supabase Edge and in local deno test next to the repo package.json)
import { cleanOutput } from './sanitize.ts'

export const MUSCLES = ['back', 'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'hips', 'calf', 'abs'] as const
export const LOCKABLE = ['nutrition', 'plan'] as const
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

// ---------------------------------------------------------------- one exercise
export const workoutCard = z.object({
  exercise_name_ar: text(80),
  exercise_name_en: text(80),
  target_muscle: z.preprocess(lower, z.enum(MUSCLES)),
  secondary_muscles: softList(z.preprocess(lower, z.enum(MUSCLES)), 4),
  environment: z.preprocess(lower, z.enum(['gym', 'home'])),
  equipment: text(80),
  sets: int(1, 10),
  reps: text(24),
  rest_seconds: int(0, 600),
  posture_cues: softList(text(200), 5).refine((a) => a.length >= 2, 'at least two posture cues'),
  alternative: z.preprocess((v) => (v === undefined ? null : v), z.object({ name_ar: text(80), reason_ar: text(200) }).nullable()).catch(null),
})

// ---------------------------------------------------------------- multi-day personalised plan (subscribers only: enforced in core.ts)
const planExercise = z.object({ name: text(80), sets: int(1, 10), reps: text(24), rest_seconds: int(0, 600) })
const planDay = z.object({
  day_label: text(40),
  focus: text(80),
  exercises: list(planExercise, 8).refine((a) => a.length >= 1, 'no exercises'),
})
export const workoutPlan = z.object({
  title: text(100),
  days: list(planDay, 7).refine((a) => a.length >= 1, 'no days'),
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
  workout_card: nullish(workoutCard),
  workout_plan: nullish(workoutPlan),
  meal_card: nullish(mealCard),
  /** what the member asked for but the model held back because of the plan (a UI hint only: entitlements are decided in core.ts) */
  withheld: softList(z.preprocess(lower, z.enum(LOCKABLE)), 2),
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
export const GEMINI_RESPONSE_SCHEMA = obj({
  chat_reply: S, voice_script: S, off_topic: B,
  safety: obj({ injury_reported: B, injured_area: NS, refused: B, refusal_reason: NS, urgent: B }),
  workout_card: obj({
    exercise_name_ar: S, exercise_name_en: S, target_muscle: { type: 'STRING', enum: [...MUSCLES] }, secondary_muscles: arr({ type: 'STRING', enum: [...MUSCLES] }),
    environment: { type: 'STRING', enum: ['gym', 'home'] }, equipment: S, sets: I, reps: S, rest_seconds: I, posture_cues: arr(S),
    alternative: obj({ name_ar: S, reason_ar: S }, ['name_ar', 'reason_ar'], true),
  }, ['exercise_name_ar', 'exercise_name_en', 'target_muscle', 'environment', 'equipment', 'sets', 'reps', 'rest_seconds', 'posture_cues'], true),
  workout_plan: obj({ title: S, days: arr(obj({ day_label: S, focus: S, exercises: arr(obj({ name: S, sets: I, reps: S, rest_seconds: I })) })), notes: S }, ['title', 'days'], true),
  meal_card: obj({
    meal_name_ar: S, meal_name_en: S, servings: I, prep_minutes: I, cook_minutes: I, localized_for: NS,
    macros_per_serving: obj(G_MACROS), macros_with_substitutes: obj(G_MACROS, Object.keys(G_MACROS), true),
    ingredients: arr(obj({ name_ar: S, grams: N, household_unit: S, substitute: obj({ name_ar: S, store_hint: S, grams: N, household_unit: S, macros_delta_per_serving: obj(G_MACROS) }, ['name_ar', 'grams', 'macros_delta_per_serving'], true) }, ['name_ar', 'grams', 'household_unit'])),
    steps: arr(obj({ text_ar: S, timer_seconds: { type: 'INTEGER', nullable: true } }, ['text_ar'])),
  }, ['meal_name_ar', 'meal_name_en', 'servings', 'prep_minutes', 'cook_minutes', 'macros_per_serving', 'ingredients', 'steps'], true),
  withheld: arr({ type: 'STRING', enum: [...LOCKABLE] }),
}, ['chat_reply', 'voice_script', 'off_topic', 'safety'])
