import { useSyncExternalStore } from 'react'
import { EN } from './en'
import { EXTRA } from './en-extra'
const DICT: Record<string, string> = { ...EN, ...EXTRA }

/**
 * Arabic-first i18n. The Arabic sentence IS the key: `t('أبي مدرب خاص')` returns it unchanged in Arabic and the
 * English entry in EN otherwise. Placeholders: {name} with an object, or {0},{1} with an array. User-written content
 * (names, bios, service titles) is never passed through t().
 */
export type Lang = 'ar' | 'en'
const KEY = 'hayl-lang'
const read = (): Lang => { try { const v = localStorage.getItem(KEY); if (v === 'ar' || v === 'en') return v } catch { /* storage blocked */ } return 'ar' }
let current: Lang = read()
const listeners = new Set<() => void>()

function applyDocument() {
  if (typeof document === 'undefined') return
  document.documentElement.lang = current
  document.documentElement.dir = current === 'ar' ? 'rtl' : 'ltr'
  document.title = current === 'ar' ? 'حيل — رياضتك ومدربك في الكويت' : 'HAYL — Your sport. Your coach. Kuwait.'
}
applyDocument()

export const getLang = (): Lang => current
export function setLang(next: Lang) {
  if (next === current) return
  current = next
  try { localStorage.setItem(KEY, next) } catch { /* ignore */ }
  applyDocument(); listeners.forEach((f) => f())
}
export const useLang = (): Lang => useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb) } }, () => current)

export function t(ar: string, vars?: Record<string, string | number> | (string | number)[]): string {
  let s = current === 'ar' ? ar : (DICT[ar] ?? ar)
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => { const v = (vars as Record<string, string | number>)[k]; return v === undefined ? m : String(v) })
  return s
}
/** For data that already carries both languages. */
export const pick = <T,>(ar: T, en: T | undefined | null): T => (current === 'ar' || en == null ? ar : en)
export const numLocale = () => (current === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB')
export const isRtl = () => current === 'ar'
/** Label maps defined at module level stay translatable: values are looked up through t() on every access. */
export function lazyMap<T extends Record<string, string>>(map: T): T {
  return new Proxy(map, { get: (o, k) => (typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) ? t(o[k]) : (o as Record<string | symbol, unknown>)[k]) }) as T
}
