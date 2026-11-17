// Auth session + trusted-device state. The server is the authority: this only mirrors what device-auth answers.
import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { deviceLabel, deviceSecret } from './device'
import { fn, supabase } from './supabase'

export type Trust = 'loading' | 'trusted' | 'challenge'
type Ctx = {
  ready: boolean; session: Session | null; trust: Trust
  recheckTrust: () => Promise<void>
  sendCode: (lang: 'ar' | 'en') => Promise<string | null>          // returns an error code or null
  verifyCode: (code: string) => Promise<boolean>
  signOut: () => Promise<void>
}
const C = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [trust, setTrust] = useState<Trust>('loading')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id ?? null
  const recheckTrust = useCallback(async () => {
    if (!userId) { setTrust('loading'); return }
    const r = await fn<{ state: string }>('device-auth', { action: 'status', device_secret: await deviceSecret() })
    setTrust(r.data?.state === 'trusted' ? 'trusted' : 'challenge')
  }, [userId])
  useEffect(() => { setTrust('loading'); if (userId) void recheckTrust() }, [userId, recheckTrust])

  const sendCode = useCallback(async (lang: 'ar' | 'en') => {
    const r = await fn('device-auth', { action: 'send_code', device_secret: await deviceSecret(), language: lang })
    return r.error ?? null
  }, [])
  const verifyCode = useCallback(async (code: string) => {
    const r = await fn<{ state: string }>('device-auth', { action: 'verify_code', device_secret: await deviceSecret(), code, label: deviceLabel() })
    const ok = r.data?.state === 'trusted'
    if (ok) setTrust('trusted')
    return ok
  }, [])
  const signOut = useCallback(async () => { await supabase.auth.signOut() }, [])

  const value = useMemo(() => ({ ready, session, trust, recheckTrust, sendCode, verifyCode, signOut }), [ready, session, trust, recheckTrust, sendCode, verifyCode, signOut])
  return <C.Provider value={value}>{children}</C.Provider>
}
export function useSession(): Ctx {
  const v = useContext(C)
  if (!v) throw new Error('SessionProvider missing')
  return v
}
