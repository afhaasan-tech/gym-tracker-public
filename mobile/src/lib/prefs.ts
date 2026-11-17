// Small device-local preferences (training place). Coach/consent settings live in Supabase (member_preferences).
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useEffect, useState } from 'react'

export type Env = 'gym' | 'home'
const listeners = new Set<(e: Env) => void>()
let current: Env | null = null

export function useTrainingEnv(): [Env, (e: Env) => void] {
  const [env, set] = useState<Env>(current ?? 'gym')
  useEffect(() => {
    listeners.add(set)
    if (current === null) AsyncStorage.getItem('vora_env').then((v) => { current = v === 'home' ? 'home' : 'gym'; listeners.forEach((f) => f(current!)) }).catch(() => {})
    return () => { listeners.delete(set) }
  }, [])
  const setEnv = useCallback((e: Env) => { current = e; listeners.forEach((f) => f(e)); AsyncStorage.setItem('vora_env', e).catch(() => {}) }, [])
  return [env, setEnv]
}
