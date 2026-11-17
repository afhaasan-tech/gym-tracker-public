// Validation of what a MODEL returned, per agent role. Lenient on size (long text is truncated, numbers are clamped, extra keys and
// extra array items are dropped) so a verbose model cannot break the apps; strict on shape (missing card fields, wrong enums) so the
// apps can render a card without defensive code. Anything that does not validate is treated as a provider failure (credits released).
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'   // zod v3 (URL import: identical in Supabase Edge and in local deno test next to the repo package.json)
import { cleanOutput } from './sanitize.ts'

export const ROLES = ['coach', 'nutritionist', 'support'] as const
export type AgentRole = typeof ROLES[number]
export const MUSCLES = ['back', 'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'hips', 'calf', 'abs'] as const
export const TICKET_CATEGORIES = ['billing', 'technical', 'device_limit', 'renewal', 'other'] as const
export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const
export const SUPPORT_ACTIONS = ['cancel_renewal', 'manage_devices', 'open_plans', 'retry_payment'] as const

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

// ---------------------------------------------------------------- coach
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
const safety = z.object({
  injury_reported: softBool,
  injured_area: nullableText(60).catch(null),
  refused: softBool,
  refusal_reason: nullableText(200).catch(null),
})
export const coachOutput = z.object({
  chat_reply: text(2000),
  voice_script: softText(700),
  safety: z.preprocess((v) => (v && typeof v === 'object' ? v : {}), safety),
  workout_card: nullish(workoutCard),
})

// ---------------------------------------------------------------- nutritionist
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
export const nutritionistOutput = z.object({
  chat_reply: text(2000),
  voice_script: softText(700),
  meal_card: nullish(mealCard),
})

// ---------------------------------------------------------------- support
export const ticketDraft = z.object({
  category: z.preprocess(lower, z.enum(TICKET_CATEGORIES)).catch('other'),
  priority: z.preprocess(lower, z.enum(TICKET_PRIORITIES)).catch('normal'),
  summary: text(1000),
})
export const supportOutput = z.object({
  chat_reply: text(2000),
  voice_script: softText(700),
  resolved: bool,
  create_support_ticket: bool,
  ticket_draft: nullish(ticketDraft).catch(null),
  suggested_actions: softList(z.object({ action: z.preprocess(lower, z.enum(SUPPORT_ACTIONS)), label_ar: text(60) }), 3),
})

export type CoachOutput = z.infer<typeof coachOutput>
export type NutritionistOutput = z.infer<typeof nutritionistOutput>
export type SupportOutput = z.infer<typeof supportOutput>
export type AgentOutput = CoachOutput | NutritionistOutput | SupportOutput
const SCHEMAS = { coach: coachOutput, nutritionist: nutritionistOutput, support: supportOutput } as const

/** Extracts the single JSON object from a model answer (tolerates code fences or a stray sentence around it). */
export function parseModelJson(raw: string): unknown {
  const s = raw.trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return undefined
  try { return JSON.parse(s.slice(a, b + 1)) } catch { return undefined }
}

export function validateOutput(role: AgentRole, raw: string): { ok: true; data: AgentOutput } | { ok: false; reason: string } {
  const obj = parseModelJson(raw)
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, reason: 'not_json' }
  const r = SCHEMAS[role].safeParse(obj)
  return r.success ? { ok: true, data: r.data as AgentOutput } : { ok: false, reason: 'schema:' + (r.error.issues[0]?.path.join('.') ?? '') }
}
