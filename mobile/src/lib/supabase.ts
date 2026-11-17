import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

// Only the public project URL and publishable key ship in the app. Secrets live in Supabase Edge Function secrets.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
export const configured = Boolean(url && key)

export const supabase = createClient(url || 'https://invalid.local', key || 'invalid', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' },
})

export type FnResult<T> = { data?: T; status: number; error?: string; extra?: Record<string, unknown> }
/** Calls an Edge Function with the user's JWT and turns HTTP errors into { status, error }. */
export async function fn<T>(name: string, body: object): Promise<FnResult<T>> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return { data: data as T, status: 200 }
  const res = (error as { context?: Response }).context
  let j: Record<string, unknown> = {}
  try { if (res && typeof res.json === 'function') j = await res.json() } catch { /* not JSON */ }
  return { status: res?.status ?? 0, error: typeof j.error === 'string' ? j.error : error.message, extra: j }
}
