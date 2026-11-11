import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type AdminRole = 'super' | 'emergency'
export type Roles = {
  loading: boolean
  admin: { role: AdminRole; aal2: boolean } | null          // a privileged account row exists (aal2 = has a multi-factor session)
  coach: { id: string; status: string; display_name: string } | null
  refresh: () => void
}

/** Reads the caller's roles from the SERVER (RPCs/RLS). Nothing here grants access; it only decides what to show. */
export function useRoles(session: Session | null): Roles {
  const [state, setState] = useState<Pick<Roles, 'loading' | 'admin' | 'coach'>>({ loading: true, admin: null, coach: null })
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((n) => n + 1), [])
  const uid = session?.user.id ?? null
  const aal = (session ? (JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { aal?: string }).aal : '') ?? ''
  useEffect(() => {
    let live = true
    if (!uid) { setState({ loading: false, admin: null, coach: null }); return }
    ;(async () => {
      const [a, c] = await Promise.all([supabase.rpc('my_admin_status'), supabase.rpc('my_coach_profile_id')])
      let coach: Roles['coach'] = null
      if (typeof c.data === 'string') {
        const r = await supabase.from('coach_profiles').select('id,status,display_name').eq('id', c.data).maybeSingle()
        if (r.data) coach = r.data as { id: string; status: string; display_name: string }
      }
      if (!live) return
      const st = a.data as { role: AdminRole | null; aal2: boolean } | null
      setState({ loading: false, admin: st?.role ? { role: st.role, aal2: st.aal2 } : null, coach })
    })()
    return () => { live = false }
  }, [uid, aal, tick])
  return { ...state, refresh }
}
