import { EXERCISES as EX_AR, FOODS as FOODS_AR } from '../kw/data.js'
import { getLang } from './index'
import { EXERCISES_EN, FOODS_EN } from './data-en'

type Obj = Record<string, unknown> & { id: string }
/** Built-in exercise/food catalogue in the active language (Arabic source data stays the single source of truth). */
export const exercisesLocalized = (): Obj[] => (getLang() === 'ar' ? (EX_AR as Obj[]) : (EX_AR as Obj[]).map((e) => ({ ...e, ...(EXERCISES_EN[e.id] ?? {}) })))
export const foodsLocalized = (): Obj[] => (getLang() === 'ar' ? (FOODS_AR as Obj[]) : (FOODS_AR as Obj[]).map((f) => ({ ...f, ...(FOODS_EN[f.id] ?? { serving: String(f.serving ?? '').replace(/\s*غ(?![\u0600-\u06FF])/, ' g') }) })))
export const exerciseLoc = <T extends { id: string }>(e: T): T => (getLang() === 'ar' ? e : ({ ...e, ...(EXERCISES_EN[e.id] ?? {}) } as T))
