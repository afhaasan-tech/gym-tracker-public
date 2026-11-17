import AsyncStorage from '@react-native-async-storage/async-storage'
import { getLocales } from 'expo-localization'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'ar' | 'en'
type Ctx = { lang: Lang; rtl: boolean; setLang: (l: Lang) => void; L: (ar: string, en: string) => string }
const I18n = createContext<Ctx>({ lang: 'ar', rtl: true, setLang: () => {}, L: (ar) => ar })

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(() => (getLocales()[0]?.languageCode === 'en' ? 'en' : 'ar'))
  useEffect(() => { AsyncStorage.getItem('vora_lang').then((v) => { if (v === 'ar' || v === 'en') set(v) }).catch(() => {}) }, [])
  const setLang = useCallback((l: Lang) => { set(l); AsyncStorage.setItem('vora_lang', l).catch(() => {}) }, [])
  const value = useMemo<Ctx>(() => ({ lang, rtl: lang === 'ar', setLang, L: (ar, en) => (lang === 'ar' ? ar : en) }), [lang, setLang])
  return <I18n.Provider value={value}>{children}</I18n.Provider>
}
export const useI18n = () => useContext(I18n)
