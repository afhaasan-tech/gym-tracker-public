// Exercise knowledge. Muscle basics are free for everyone; the advanced exercise library is read from the server and
// only an active subscriber on a trusted device receives it (the server refuses everyone else — nothing premium ships in the app).
import { useEffect, useState } from 'react'
import type { MuscleId } from '../features/trainer/types'
import { supabase } from './supabase'

export type Muscle = { id: MuscleId; name_ar: string; name_en: string; location_ar: string; location_en: string; function_ar: string; function_en: string; summary_ar: string; summary_en: string }
export type LibSource = { org: string; title: string; year?: number | string; url?: string }
export type LibExercise = {
  id: string; name_ar: string; name_en: string; primary_muscle: MuscleId; secondary_muscles: MuscleId[]; equipment_ar: string; equipment_en: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'; environments: ('gym' | 'home')[]
  instructions_ar: string[]; instructions_en: string[]; cues_ar: string[]; cues_en: string[]; mistakes_ar: string[]; mistakes_en: string[]
  safety_ar: string; safety_en: string; alternatives: string[]; default_sets: number; default_reps: string; rest_seconds: number
  sources: LibSource[]; review_status: 'unreviewed' | 'reviewed'
}

let muscleCache: Muscle[] | null = null
export function useMuscles(): { muscles: Muscle[] | null; failed: boolean } {
  const [muscles, setMuscles] = useState<Muscle[] | null>(muscleCache), [failed, setFailed] = useState(false)
  useEffect(() => {
    if (muscleCache) return
    let alive = true
    supabase.rpc('public_muscles').then(({ data, error }) => {
      if (!alive) return
      if (error || !Array.isArray(data)) setFailed(true); else { muscleCache = data as Muscle[]; setMuscles(muscleCache) }
    })
    return () => { alive = false }
  }, [])
  return { muscles, failed }
}

/** Premium library for one muscle. `enabled` is only a hint to skip the call; the server decides who may read. */
export function usePremiumExercises(muscle: MuscleId, environment: 'gym' | 'home', enabled: boolean): { list: LibExercise[] | null; failed: boolean } {
  const [state, setState] = useState<{ key: string; list: LibExercise[] | null; failed: boolean }>({ key: '', list: null, failed: false })
  const key = `${muscle}:${environment}:${enabled}`
  useEffect(() => {
    if (!enabled) return
    let alive = true
    supabase.rpc('premium_exercises', { p_muscle: muscle, p_environment: environment }).then(({ data, error }) => {
      if (alive) setState({ key, list: error || !Array.isArray(data) ? null : (data as LibExercise[]), failed: Boolean(error) })
    })
    return () => { alive = false }
  }, [key, muscle, environment, enabled])
  return state.key === key ? { list: state.list, failed: state.failed } : { list: null, failed: false }
}
