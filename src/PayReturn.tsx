import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Page, PaymentBadge } from './ui'
import { kwd, whenKw } from './catalog'
import { startPayment, useBookingsRealtime } from './payments'
import { t } from './i18n'

type Row = { id: string; payment_status: string; booking_status: string; price_kwd: number; scheduled_at: string; services: { name: string } | null }

/**
 * Where the gateway sends the browser back to. NOTHING in the address (?status=success, ?result=CAPTURED …) is read:
 * the page shows a neutral "verifying" state and only the booking row written by the trusted server decides what is shown.
 */
export default function PayReturn({ bookingId, go }: { bookingId: string; go: (to: string) => void }) {
  const [row, setRow] = useState<Row | null>(null), [missing, setMissing] = useState(false)
  const [waited, setWaited] = useState(0), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const asked = useRef(0)
  const load = useCallback(async () => {
    const { data } = await supabase.from('bookings').select('id,payment_status,booking_status,price_kwd,scheduled_at,services(name)').eq('id', bookingId).maybeSingle()
    if (data) setRow(data as unknown as Row); else setMissing(true)
    return data as unknown as Row | null
  }, [bookingId])
  useBookingsRealtime(() => { void load() }, 'ret-' + bookingId)

  useEffect(() => {
    let live = true
    const tick = async () => {
      const r = await load()
      if (!live) return
      if (r && r.payment_status !== 'paid' && r.payment_status !== 'failed' && r.payment_status !== 'expired') {
        // ask the server to check with the payment provider (the webhook usually already did; this just speeds convergence)
        if (asked.current < 6) { asked.current++; void supabase.functions.invoke('payment-reconcile', { body: { booking_id: bookingId } }).then(() => load()) }
      }
    }
    void tick()
    const iv = window.setInterval(() => { setWaited((w) => w + 3); void tick() }, 3000)
    return () => { live = false; window.clearInterval(iv) }
  }, [bookingId, load])

  const status = row?.payment_status ?? 'pending'
  const final = status === 'paid' || status === 'failed' || status === 'expired'
  async function retry() {
    setBusy(true); setErr('')
    const r = await startPayment(bookingId)
    if (r.url) { window.location.assign(r.url); return }
    setBusy(false); setErr(r.error ?? '')
  }
  if (missing) return <Page title={t('الحجز غير موجود')}><button className="primary" onClick={() => go('/bookings')}>{t('حجوزاتي')}</button></Page>
  return (
    <Page title={t('نتيجة الدفع')} kicker={t('دفع تجريبي (Sandbox) — لا يتم سحب أي مبلغ حقيقي')}>
      <section className="pay-card" aria-live="polite">
        {!final ? (<>
          <span className="spinner" aria-hidden="true" />
          <h2>{t('نتحقق من الدفع…')}</h2>
          <p>{t('ننتظر تأكيد بوابة الدفع. هذي الصفحة لا تعني أن الدفع تم. لا تغلقها.')}</p>
          {waited >= 45 && <p className="muted small">{t('التأكيد يستغرق وقتاً أطول من المعتاد. تقدر تتابع حالة الحجز من «حجوزاتي».')}</p>}
        </>) : status === 'paid' ? (<><h2 className="pay-ok">{t('تم الدفع بنجاح')}</h2><p>{t('أكدت بوابة الدفع العملية وسُجّل الدفع على الخادم.')}</p></>)
          : status === 'failed' ? (<><h2 className="pay-bad">{t('لم تكتمل عملية الدفع')}</h2><p>{t('رفضت البوابة العملية أو أُلغيت. ما تم سحب أي مبلغ. تقدر تحاول مرة ثانية.')}</p></>)
          : (<><h2 className="pay-warn">{t('انتهت مهلة الدفع')}</h2><p>{t('ما اكتمل الدفع في الوقت المحدد. تقدر تبدأ دفعة جديدة.')}</p></>)}
        {row && <dl className="facts"><dt>{t('الخدمة')}</dt><dd>{row.services?.name}</dd><dt>{t('الموعد')}</dt><dd>{whenKw(row.scheduled_at)}</dd><dt>{t('المبلغ')}</dt><dd>{kwd(row.price_kwd)}</dd><dt>{t('حالة الدفع')}</dt><dd><PaymentBadge status={status} /></dd></dl>}
        {err && <p role="alert" className="error">{err}</p>}
        <div className="row-actions">
          {(status === 'failed' || status === 'expired') && <button className="primary" type="button" disabled={busy} onClick={retry}>{busy ? t('لحظة…') : t('حاول الدفع مرة ثانية')}</button>}
          <button className="outline" type="button" onClick={() => go('/bookings')}>{t('حجوزاتي')}</button>
        </div>
      </section>
    </Page>
  )
}
