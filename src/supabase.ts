import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

export type Workout = {
  id: string
  user_id: string
  exercise: string
  sets: number
  reps: number
  weight: number
  created_at: string
  photo_url: string | null
  summary: string | null
}

export const PHOTO_BUCKET = 'progress-photos'
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
export const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** Returns an error message if the file is not an allowed image under 5 MB, else null. */
export function validatePhoto(file: File): string | null {
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) return 'اختر صورة بصيغة JPG أو PNG أو WebP أو GIF.'
  if (file.size > MAX_PHOTO_BYTES) return `حجم الصورة ${(file.size / 1024 / 1024).toFixed(1)} ميغا، والحد الأقصى 5 ميغا.`
  return null
}

/** Calls an AI Edge Function and turns HTTP errors (including 429) into a readable message. */
export async function callAi<T>(fn: 'ai-summary' | 'ai-analysis', body: object): Promise<{ data?: T; error?: string; status?: number }> {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (!error) return { data: data as T, status: 200 }
  const res = (error as { context?: Response }).context
  if (res && typeof res.json === 'function') {
    const j = await res.json().catch(() => null)
    // Same server-side limit and response; only the wording shown to the user is Arabic.
    if (res.status === 429) {
      return { error: `وصلت الحد الأقصى: 5 طلبات ذكاء اصطناعي بالدقيقة (تنحسب على الميزتين). جرّب بعد ${j?.retry_after_seconds ?? 60} ثانية.`, status: 429 }
    }
    return { error: j?.error ?? 'صار خطأ في طلب الذكاء الاصطناعي.', status: res.status }
  }
  return { error: error.message }
}

/** Turns a Supabase Auth error into a short Kuwaiti Arabic message (falls back to a generic one, never raw English). */
export function authErrorMessage(err: { message?: string; code?: string; status?: number }): string {
  const code = err.code ?? ''
  const msg = (err.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'الإيميل أو الرقم السري مب صحيح. جرّب مرة ثانية.'
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'هذا الإيميل مسجّل من قبل. سجّل دخول بدل ما تسوي حساب جديد.'
  if (code === 'weak_password' || msg.includes('password should be')) return 'الرقم السري ضعيف. استخدم 8 خانات على الأقل.'
  if (code === 'email_not_confirmed' || msg.includes('not confirmed')) return 'لازم تأكّد إيميلك أول. شيّك على بريدك.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || err.status === 429 || msg.includes('rate limit'))
    return 'صارت طلبات واجد. انتظر شوي وجرّب مرة ثانية.'
  if (code === 'validation_failed' || msg.includes('valid email') || msg.includes('invalid format')) return 'اكتب إيميل صحيح.'
  if (code === 'same_password' || msg.includes('different from the old')) return 'اختر رقم سري غير الرقم القديم.'
  if (code === 'signup_disabled') return 'التسجيل مب متاح حالياً.'
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'ما قدرنا نتصل. شيّك على الإنترنت وجرّب مرة ثانية.'
  return 'صار خطأ غير متوقع. جرّب مرة ثانية.'
}
