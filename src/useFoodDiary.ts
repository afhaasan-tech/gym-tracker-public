import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { t } from './i18n'

/** Shapes the (unchanged) FoodView component already works with. */
export type Meal = { id: string; name: string; serving: string; calories: number; protein: number; carbs: number; fat: number; date: string }
export type CustomFood = { id: string; name: string; serving: string; calories: number; protein: number; carbs: number; fat: number }

const MEAL_COLS = 'id,entry_date,name,serving,calories,protein,carbs,fat,created_at'
const FOOD_COLS = 'id,name,serving,calories,protein,carbs,fat,created_at'
const PAGE = 1000
const LEGACY_MEALS_KEY = 'athar-meals'   // keys used by the old localStorage-only version
const LEGACY_FOODS_KEY = 'athar-foods'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/

type Row = Record<string, unknown>
const num = (v: unknown, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(0, Math.round(n * 100) / 100)) : 0 }
const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export function writeErrorMessage(err: { message?: string } | null | undefined): string {
  if (/failed to fetch|network|load failed/i.test(err?.message ?? '')) return t("ما قدرنا نتصل بالإنترنت، فما انحفظ التغيير. شيّك على الاتصال وجرّب مرة ثانية.")
  return t("ما انحفظ التغيير في حسابك. جرّب مرة ثانية.")
}

function toMeal(r: Row): Meal {
  return { id: String(r.id), name: String(r.name), serving: String(r.serving ?? ''), calories: Number(r.calories), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat), date: String(r.entry_date) }
}
function toFood(r: Row): CustomFood {
  return { id: String(r.id), name: String(r.name), serving: String(r.serving), calories: Number(r.calories), protein: Number(r.protein), carbs: Number(r.carbs), fat: Number(r.fat) }
}

function readLegacy(key: string): Row[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []
  } catch { return [] }
}

/** Stable id for old records that have none, so importing the same data twice can never create duplicates. */
function legacyIds(items: Row[], keyOf: (r: Row) => string): string[] {
  const seen = new Map<string, number>()
  return items.map((r) => {
    if (r.id !== undefined && r.id !== null && String(r.id).length <= 64) return String(r.id)
    const k = keyOf(r); const n = (seen.get(k) ?? 0) + 1; seen.set(k, n)
    return `h:${k}#${n}`.slice(0, 64)
  })
}

async function fetchAll(table: 'food_entries' | 'custom_foods', cols: string): Promise<{ rows: Row[]; error: { message?: string } | null }> {
  const rows: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).order('created_at', { ascending: true }).order('id').range(from, from + PAGE - 1)
    if (error) return { rows: [], error }
    rows.push(...((data ?? []) as unknown as Row[]))
    if ((data ?? []).length < PAGE) return { rows, error: null }
  }
}

/**
 * Food diary stored in Supabase for the signed-in user (tables food_entries / custom_foods, protected by RLS).
 * Writes are shown immediately and rolled back with a clear Arabic message if they fail (e.g. offline).
 * Other devices see changes on their next refresh/refocus (checked on focus, when the tab becomes visible, when the
 * connection returns, and every 30 s while visible).
 */
export function useFoodDiary(userId: string) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [problem, setProblem] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<{ meals: number; foods: number } | null>(null)
  const pending = useRef(new Set<string>())   // ids being written, not yet confirmed by the server
  const removing = useRef(new Set<string>())  // ids being deleted
  const flagKey = `gt-food-import:${userId}`
  const [flag, setFlag] = useState<string | null>(() => { try { return localStorage.getItem(flagKey) } catch { return null } })
  const [legacyCount] = useState(() => ({ meals: readLegacy(LEGACY_MEALS_KEY).length, foods: readLegacy(LEGACY_FOODS_KEY).length }))

  const load = useCallback(async (quiet = false) => {
    const [m, c] = await Promise.all([fetchAll('food_entries', MEAL_COLS), fetchAll('custom_foods', FOOD_COLS)])
    if (m.error || c.error) { if (!quiet) setStatus('error'); return }
    setMeals((old) => {
      const server = m.rows.map(toMeal).filter((x) => !removing.current.has(x.id))
      const ids = new Set(server.map((x) => x.id))
      return [...server, ...old.filter((x) => pending.current.has(x.id) && !ids.has(x.id))]
    })
    setCustomFoods((old) => {
      const server = c.rows.map(toFood).filter((x) => !removing.current.has(x.id))
      const ids = new Set(server.map((x) => x.id))
      return [...server, ...old.filter((x) => pending.current.has(x.id) && !ids.has(x.id))]
    })
    setStatus('ready')
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh); window.addEventListener('online', refresh); document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [load])

  const addMeal = useCallback((raw: unknown): boolean => {
    const m = raw as Row
    const name = text(m.name, 120)
    const date = String(m.date ?? '')
    if (!name || !DATE.test(date)) return false
    const id = UUID.test(String(m.id)) ? String(m.id) : crypto.randomUUID()
    const meal: Meal = { id, name, serving: text(m.serving, 80), calories: num(m.calories, 20000), protein: num(m.protein, 2000), carbs: num(m.carbs, 2000), fat: num(m.fat, 2000), date }
    pending.current.add(id); setProblem(''); setMeals((old) => [...old, meal])
    void supabase.from('food_entries').insert({ id, entry_date: date, name, serving: meal.serving, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat }).then(({ error }) => {
      pending.current.delete(id)
      if (error) { setMeals((old) => old.filter((x) => x.id !== id)); setProblem(writeErrorMessage(error)) }
    })
    return true
  }, [])

  const deleteMeal = useCallback((id: string): boolean => {
    removing.current.add(id); setProblem('')
    setMeals((old) => old.filter((x) => x.id !== id))
    void supabase.from('food_entries').delete().eq('id', id).then(({ error }) => {
      removing.current.delete(id)
      if (error) { setProblem(writeErrorMessage(error)); void load(true) }
    })
    return true
  }, [load])

  const addCustomFood = useCallback((raw: unknown): boolean => {
    const f = raw as Row
    const name = text(f.name, 120), serving = text(f.serving, 80)
    if (!name || !serving) return false
    const id = UUID.test(String(f.id)) ? String(f.id) : crypto.randomUUID()
    const food: CustomFood = { id, name, serving, calories: num(f.calories, 20000), protein: num(f.protein, 2000), carbs: num(f.carbs, 2000), fat: num(f.fat, 2000) }
    pending.current.add(id); setProblem(''); setCustomFoods((old) => [...old, food])
    void supabase.from('custom_foods').insert({ id, name, serving, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat }).then(({ error }) => {
      pending.current.delete(id)
      if (error) { setCustomFoods((old) => old.filter((x) => x.id !== id)); setProblem(writeErrorMessage(error)) }
    })
    return true
  }, [])

  /** One-time, user-confirmed copy of the old device-only records into the account. Idempotent (unique per user + old id). */
  const importLegacy = useCallback(async () => {
    setImporting(true); setProblem('')
    const oldMeals = readLegacy(LEGACY_MEALS_KEY), oldFoods = readLegacy(LEGACY_FOODS_KEY)
    const mealIds = legacyIds(oldMeals, (r) => `${r.date}|${r.name}|${r.serving}|${r.calories}`)
    const foodIds = legacyIds(oldFoods, (r) => `${r.name}|${r.serving}|${r.calories}`)
    const mealRows = oldMeals.map((r, i) => ({ r, legacy_id: mealIds[i] })).filter(({ r }) => text(r.name, 120) && DATE.test(String(r.date ?? '')))
      .map(({ r, legacy_id }) => ({ entry_date: String(r.date), name: text(r.name, 120), serving: text(r.serving, 80), calories: num(r.calories, 20000), protein: num(r.protein, 2000), carbs: num(r.carbs, 2000), fat: num(r.fat, 2000), legacy_id }))
    const foodRows = oldFoods.map((r, i) => ({ r, legacy_id: foodIds[i] })).filter(({ r }) => text(r.name, 120) && text(r.serving, 80))
      .map(({ r, legacy_id }) => ({ name: text(r.name, 120), serving: text(r.serving, 80), calories: num(r.calories, 20000), protein: num(r.protein, 2000), carbs: num(r.carbs, 2000), fat: num(r.fat, 2000), legacy_id }))
    let failure: { message?: string } | null = null
    for (const [table, rows] of [['custom_foods', foodRows], ['food_entries', mealRows]] as const) {
      for (let i = 0; i < rows.length && !failure; i += 200) {
        const { error } = await supabase.from(table).upsert(rows.slice(i, i + 200), { onConflict: 'user_id,legacy_id', ignoreDuplicates: true })
        if (error) failure = error
      }
    }
    setImporting(false)
    if (failure) { setProblem(writeErrorMessage(failure)); return false }   // flag stays unset: the user can simply try again
    try { localStorage.setItem(flagKey, 'done') } catch { /* ignore */ }
    setFlag('done'); setImported({ meals: mealRows.length, foods: foodRows.length }); await load(true)
    return true
  }, [flagKey, load])

  const skipLegacy = useCallback(() => {
    try { localStorage.setItem(flagKey, 'skipped') } catch { /* ignore */ }
    setFlag('skipped')
  }, [flagKey])

  const offerImport = status === 'ready' && !flag && legacyCount.meals + legacyCount.foods > 0

  return { meals, customFoods, status, problem, dismissProblem: () => setProblem(''), reload: () => { setStatus('loading'); void load() },
    addMeal, deleteMeal, addCustomFood, offerImport, legacyCount, importing, imported, importLegacy, skipLegacy }
}
