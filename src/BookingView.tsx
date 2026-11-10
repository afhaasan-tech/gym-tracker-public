import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import './booking.css'

type Service = { id: string; name: string; description: string; price_kwd: number; is_available: boolean; is_demo: boolean }
type Booking = {
  id: string; user_id: string; service_id: string; scheduled_at: string
  booking_status: 'pending' | 'confirmed' | 'cancelled'
  payment_status: 'pending' | 'awaiting_payment' | 'paid' | 'failed' | 'expired'
  price_kwd: number; created_at: string; services?: { name: string } | null
}

const BOOKING_LABEL: Record<Booking['booking_status'], string> = { pending: 'قيد المراجعة', confirmed: 'مؤكد (تجريبي)', cancelled: 'ملغي' }
const PAYMENT_LABEL: Record<Booking['payment_status'], string> = {
  pending: 'الدفع: معلّق (غير مفعّل)', awaiting_payment: 'بانتظار الدفع', paid: 'مدفوع', failed: 'فشل الدفع', expired: 'انتهت المهلة',
}
const kwd = (n: number) => `${Number(n).toFixed(3)} د.ك`
const when = (iso: string) => new Date(iso).toLocaleString('ar-KW-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })
/** Local "YYYY-MM-DDTHH:mm" for <input type="datetime-local"> */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

function bookingError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('scheduled_at')) return 'اختر وقت بعد ساعة من الحين وخلال 90 يوم.'
  if (m.includes('not available')) return 'هذي الخدمة مب متاحة حالياً.'
  return 'تعذر تثبيت الحجز التجريبي. جرّب مرة ثانية.'
}

/** «احجز جلسة»: DEMO booking foundation. No payment, no real appointments. Prices always come from the database. */
export default function BookingView({ session }: { session: Session }) {
  const [services, setServices] = useState<Service[]>([])
  const [mine, setMine] = useState<Booking[]>([])
  const [all, setAll] = useState<Booking[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [slot, setSlot] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState<Booking | null>(null)
  const [{ min, max }] = useState(() => ({ min: localInput(new Date(Date.now() + 2 * 3600 * 1000)), max: localInput(new Date(Date.now() + 89 * 24 * 3600 * 1000)) }))

  const load = useCallback(async () => {
    const [s, b, a] = await Promise.all([
      supabase.from('services').select('*').order('price_kwd', { ascending: true }),
      supabase.from('bookings').select('*, services(name)').eq('user_id', session.user.id).order('created_at', { ascending: false }),
      supabase.rpc('is_admin'),
    ])
    if (s.error || b.error) setError('تعذر تحميل البيانات. حدّث الصفحة وجرّب مرة ثانية.')
    setServices((s.data ?? []) as Service[])
    setMine((b.data ?? []) as Booking[])
    const admin = a.data === true
    setIsAdmin(admin)
    if (admin) {
      const r = await supabase.from('bookings').select('*, services(name)').order('created_at', { ascending: false })
      setAll((r.data ?? []) as Booking[])
    }
    setLoading(false)
  }, [session.user.id])

  useEffect(() => { load() }, [load])

  async function book(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!serviceId || !slot) { setError('اختر الخدمة والوقت أول.'); return }
    setBusy(true)
    // Only service_id and scheduled_at are sent. The database sets owner, statuses and the price.
    const { data, error: err } = await supabase.from('bookings')
      .insert({ service_id: serviceId, scheduled_at: new Date(slot).toISOString() })
      .select('*, services(name)').single()
    setBusy(false)
    if (err || !data) { setError(bookingError(err?.message ?? '')); return }
    setConfirmed(data as Booking)
    setSlot(''); setServiceId('')
    load()
  }

  async function setStatus(id: string, status: Booking['booking_status']) {
    const { error: err } = await supabase.from('bookings').update({ booking_status: status }).eq('id', id)
    if (err) setError('تعذر تحديث الحالة.')
    else load()
  }


  if (confirmed) {
    return (
      <main className="screen booking">
        <div className="page-title"><span className="eyebrow">احجز جلسة</span><h1>تم تثبيت الحجز التجريبي</h1></div>
        <section className="card confirm" aria-live="polite">
          <p className="demo-note" role="note">هذا حجز تجريبي لتجربة النظام فقط. ما في موعد حقيقي في نادي، وما في دفع.</p>
          <dl>
            <dt>الخدمة</dt><dd>{confirmed.services?.name ?? '—'}</dd>
            <dt>الموعد</dt><dd>{when(confirmed.scheduled_at)}</dd>
            <dt>السعر (من الخادم)</dt><dd>{kwd(confirmed.price_kwd)}</dd>
            <dt>حالة الحجز</dt><dd><span className="chip">{BOOKING_LABEL[confirmed.booking_status]}</span></dd>
            <dt>حالة الدفع</dt><dd><span className="chip">{PAYMENT_LABEL[confirmed.payment_status]}</span></dd>
            <dt>رقم الحجز</dt><dd dir="ltr">{confirmed.id.slice(0, 8)}</dd>
          </dl>
          <p className="muted small">الدفع الإلكتروني غير مفعّل بعد، ومراحله القادمة ما تتم إلا من الخادم.</p>
          <button className="primary" onClick={() => setConfirmed(null)}>رجوع للحجوزات</button>
        </section>
      </main>
    )
  }

  return (
    <main className="screen booking">
      <div className="page-title"><span className="eyebrow">احجز جلسة</span><h1>احجز جلسة</h1></div>
      <p className="demo-note" role="note">⚠️ خدمات تجريبية للعرض فقط: الحجوزات هنا مب مواعيد حقيقية، وما فيه دفع ولا رسوم فعلية.</p>
      {error && <p role="alert" className="error banner">{error}</p>}

      <form className="card" onSubmit={book}>
        <h2>الخدمات التجريبية</h2>
        {loading && <p className="muted">جاري التحميل…</p>}
        <div className="services" role="radiogroup" aria-label="اختر خدمة">
          {services.map((s) => (
            <label key={s.id} className={serviceId === s.id ? 'service selected' : 'service'}>
              <input type="radio" name="service" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} />
              <span className="service-head"><strong>{s.name}</strong><span className="price" dir="ltr">{kwd(s.price_kwd)}</span></span>
              <span className="muted small">{s.description}</span>
              <span className="chip demo">تجريبي</span>
            </label>
          ))}
          {!loading && services.length === 0 && <p className="muted">ما فيه خدمات متاحة حالياً.</p>}
        </div>
        <label>الموعد المطلوب (بعد ساعتين من الحين وخلال 90 يوم)
          <input type="datetime-local" dir="ltr" min={min} max={max} value={slot} onChange={(e) => setSlot(e.target.value)} required />
        </label>
        <button className="primary" disabled={busy || !serviceId}>{busy ? 'يثبّت…' : 'ثبّت الحجز التجريبي'}</button>
        <p className="muted small">السعر يُقرأ من قاعدة البيانات عند التثبيت، مب من المتصفح.</p>
      </form>

      <section className="card">
        <h2>حجوزاتي التجريبية</h2>
        {mine.length === 0 && !loading && <p className="muted">ما عندك حجوزات للحين.</p>}
        <ul className="bookings">
          {mine.map((b) => (
            <li key={b.id}>
              <strong>{b.services?.name ?? 'خدمة'}</strong>
              <span className="muted small">{when(b.scheduled_at)} · {kwd(b.price_kwd)}</span>
              <span className="chips"><span className="chip">{BOOKING_LABEL[b.booking_status]}</span><span className="chip">{PAYMENT_LABEL[b.payment_status]}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {isAdmin && (
        <section className="card admin" aria-label="لوحة الإدارة">
          <h2>لوحة الإدارة (تجريبية)</h2>
          <p className="muted small">تظهر لحسابات الإدارة فقط. تقدر تغيّر حالة الحجز؛ حالة الدفع محجوزة للخادم.</p>
          <ul className="bookings">
            {all.map((b) => (
              <li key={b.id}>
                <strong>{b.services?.name ?? 'خدمة'}</strong>
                <span className="muted small" dir="ltr">{b.user_id.slice(0, 8)} · {b.id.slice(0, 8)}</span>
                <span className="muted small">{when(b.scheduled_at)} · {kwd(b.price_kwd)}</span>
                <span className="chips"><span className="chip">{BOOKING_LABEL[b.booking_status]}</span><span className="chip">{PAYMENT_LABEL[b.payment_status]}</span></span>
                <span className="admin-actions">
                  <button type="button" className="outline" disabled={b.booking_status === 'confirmed'} onClick={() => setStatus(b.id, 'confirmed')}>أكّد</button>
                  <button type="button" className="outline" disabled={b.booking_status === 'cancelled'} onClick={() => setStatus(b.id, 'cancelled')}>إلغاء</button>
                </span>
              </li>
            ))}
            {all.length === 0 && <li className="muted">لا توجد حجوزات.</li>}
          </ul>
        </section>
      )}
    </main>
  )
}
