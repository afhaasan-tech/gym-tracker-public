import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Sport = { id: string; slug: string; name_ar: string; name_en: string; category: string; requires_review: boolean; is_active: boolean; sort_order: number }
export type Coach = {
  id: string; display_name: string; bio: string; experience_years: number | null; qualifications: string; formats: string[]; locations: string[]
  participant_categories: string[]; accessibility: string; status: string; is_demo: boolean
}
export type CatalogService = {
  id: string; name: string; description: string; price_kwd: number; coach_id: string | null; sport_id: string | null; format: 'private' | 'group'
  delivery: 'online' | 'in_person' | 'hybrid'; location: string; capacity: number; min_age: number | null; max_age: number | null
  accessibility: string; duration_minutes: number; status: string; platform_owned: boolean; is_demo: boolean
}
export type Slot = { id: string; starts_at: string; remaining: number }

export const CATEGORY_LABEL: Record<string, string> = {
  team: 'رياضات جماعية', racket: 'رياضات المضرب', aquatic: 'رياضات مائية', mind_body: 'عقل وجسم', fitness: 'لياقة وقوة', combat: 'فنون قتالية', nutrition: 'تغذية',
}
export const DELIVERY_LABEL = { online: 'أونلاين', in_person: 'حضوري', hybrid: 'مختلط' } as const
export const FORMAT_LABEL = { private: 'خاص', group: 'جماعي' } as const
export const AUDIENCE_LABEL: Record<string, string> = { adults: 'بالغين', women: 'نساء', men: 'رجال', youth: 'شباب', children: 'أطفال', seniors: 'كبار السن', special_needs: 'احتياجات خاصة' }
export const kwd = (n: number) => `${Number(n).toFixed(3)} د.ك`
export const whenKw = (iso: string) => new Date(iso).toLocaleString('ar-KW-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuwait' })

type State<T> = { data: T; loading: boolean; error: string }
/** Loads a public catalog query once. All of these tables only ever return approved, published rows for visitors (enforced by RLS). */
function useQuery<T>(load: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, initial: T, deps: unknown[] = []): State<T> {
  const [s, setS] = useState<State<T>>({ data: initial, loading: true, error: '' })
  useEffect(() => {
    let live = true
    setS((x) => ({ ...x, loading: true, error: '' }))
    load().then(({ data, error }) => { if (live) setS({ data: (data ?? initial) as T, loading: false, error: error ? 'تعذر تحميل البيانات. حدّث الصفحة وجرّب مرة ثانية.' : '' }) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return s
}

export const useSports = () => useQuery<Sport[]>(() => supabase.from('sports').select('*').order('sort_order'), [])
export const useCoaches = () => useQuery<(Coach & { coach_sports: { sport_id: string; status: string }[] })[]>(
  () => supabase.from('coach_profiles').select('id,display_name,bio,experience_years,qualifications,formats,locations,participant_categories,accessibility,status,is_demo,coach_sports(sport_id,status)').eq('status', 'active').order('display_name'), [])
export const useServices = () => useQuery<CatalogService[]>(
  () => supabase.from('services').select('id,name,description,price_kwd,coach_id,sport_id,format,delivery,location,capacity,min_age,max_age,accessibility,duration_minutes,status,platform_owned,is_demo').eq('status', 'published').order('price_kwd'), [])
export const useSlots = (serviceId: string | null) => useQuery<Slot[]>(
  () => serviceId ? supabase.rpc('public_slots', { p_service: serviceId }) : Promise.resolve({ data: [] as Slot[], error: null }), [], [serviceId])
