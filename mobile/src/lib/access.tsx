// What the signed-in member may use: the free trial conversation, pay-as-you-go VORA Coins, or an active subscription. The server decides; this mirrors it.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Access = {
  tier: 'subscriber' | 'coins' | 'trial' | 'none'; purchased_coins?: number; library?: boolean; period?: 'monthly' | 'yearly' | null; plan_key: string | null; nutrition: boolean; period_end: string | null; auto_renew: boolean | null
  trial: { available: boolean; started: boolean; conversation_id: string | null; remaining: number; ends_at: string | null; ended: boolean; max_messages: number }
}
const listeners = new Set<() => void>()
/** Ask every mounted screen to re-read access (after a trainer reply, or when a subscription changes). */
export const refreshAccess = () => listeners.forEach((f) => f())

export function useAccess(): { access: Access | null; loaded: boolean; unavailable: boolean; refresh: () => Promise<void> } {
  const [access, setAccess] = useState<Access | null>(null), [loaded, setLoaded] = useState(false), [unavailable, setUnavailable] = useState(false)
  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_trainer_access')
    if (error || !data) { setUnavailable(true); setAccess(null) } else { setUnavailable(false); setAccess(data as Access) }
    setLoaded(true)
  }, [])
  useEffect(() => { void refresh(); const f = () => { void refresh() }; listeners.add(f); return () => { listeners.delete(f) } }, [refresh])
  return { access, loaded, unavailable, refresh }
}
