import { useEffect } from 'react'
import { supabase } from './supabase'
import { getLang, t } from './i18n'

export type PayStatus = 'pending' | 'awaiting_payment' | 'paid' | 'failed' | 'expired'
export const PAY_LABEL = (s: string): string => ({
  pending: t('بانتظار الدفع'), awaiting_payment: t('بانتظار إتمام الدفع'), paid: t('مدفوع'), failed: t('فشل الدفع'), expired: t('انتهت مهلة الدفع'),
} as Record<string, string>)[s] ?? s
export const canPay = (s: string, price: number, booking: string) => price > 0 && booking !== 'cancelled' && s !== 'paid'

const CHECKOUT_HOSTS = /(^|\.)upayments\.com$|(^|\.)kpay\.com\.kw$/i
/** Only ever navigate to the gateway's own HTTPS hosted page. */
export function isSafeCheckout(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && CHECKOUT_HOSTS.test(u.hostname) } catch { return false }
}

const ERR: Record<string, () => string> = {
  login_required: () => t('سجّل دخولك أول.'), email_not_verified: () => t('فعّل إيميلك أول.'), booking_not_found: () => t('الحجز غير موجود.'),
  not_payable: () => t('هذا الحجز ما يحتاج دفع.'), already_paid: () => t('هذا الحجز مدفوع من قبل.'),
  verifying_previous_payment: () => t('نتحقق من محاولة دفع سابقة. جرّب بعد دقيقة.'), checkout_in_progress: () => t('صفحة الدفع قيد التجهيز. جرّب بعد لحظات.'),
  gateway_unavailable: () => t('بوابة الدفع التجريبية غير متاحة الآن. جرّب لاحقاً.'),
}
/** Sends ONLY the booking id. The server decides the amount, currency and status. */
export async function startPayment(bookingId: string): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('initiate-payment', { body: { booking_id: bookingId }, headers: { 'x-lang': getLang() } })
  if (error) {
    let code = ''
    try { code = (await (error as { context?: Response }).context?.json())?.error ?? '' } catch { /* ignore */ }
    return { error: (ERR[code] ?? (() => t('ما قدرنا نبدأ الدفع. جرّب مرة ثانية.')))() }
  }
  const url = (data as { checkout_url?: string } | null)?.checkout_url
  if (!url || !isSafeCheckout(url)) return { error: t('ما قدرنا نبدأ الدفع. جرّب مرة ثانية.') }
  return { url }
}

/** Live changes of bookings the signed-in user is allowed to see (RLS applies to Realtime as well). */
export function useBookingsRealtime(onChange: () => void, key = 'bookings') {
  useEffect(() => {
    const ch = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => onChange())
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
