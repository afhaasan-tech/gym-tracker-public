// The VORA AI screens are shown when the database flag `ai_coach_enabled` is on (owner-controlled, off by default),
// or when a build sets VITE_VORA_AI=1 (staging). While it is off, the app behaves exactly as before.
// The last known value is remembered per browser so a returning visitor is not kept on a blank page while the flag
// is re-read; the fresh value always replaces it. The flag only chooses which screens show: the server enforces access.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const VORA_ENV_ON = import.meta.env.VITE_VORA_AI === '1'
const KEY = 'vora-flag-ai'
const remembered = (): boolean | null => { try { const v = localStorage.getItem(KEY); return v === '1' ? true : v === '0' ? false : null } catch { return null } }
let voraCache: boolean | null = VORA_ENV_ON ? true : remembered()
let fresh = VORA_ENV_ON
let pending: Promise<boolean> | null = null
const load = () => pending ??= Promise.resolve(supabase.rpc('public_flags')).then(({ data, error }) => {
  if (error) { pending = null; return voraCache ?? false }
  voraCache = Boolean((data as Record<string, boolean> | null)?.ai_coach_enabled); fresh = true
  try { localStorage.setItem(KEY, voraCache ? '1' : '0') } catch { /* storage blocked */ }
  return voraCache
})
export function useVoraOn(): boolean | null {
  const [on, setOn] = useState<boolean | null>(voraCache)
  useEffect(() => { if (!fresh) load().then(setOn) }, [])
  return on
}
