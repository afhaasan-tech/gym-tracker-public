import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from './supabase'
import { DELIVERY_LABEL, FORMAT_LABEL, kwd, useSports, whenKw, AUDIENCE_LABEL } from './catalog'
import type { Roles } from './useRoles'

type Go = (to: string) => void
type Svc = { id: string; name: string; description: string; price_kwd: number; sport_id: string | null; format: 'private' | 'group'; delivery: 'online' | 'in_person' | 'hybrid'; location: string; capacity: number; min_age: number | null; max_age: number | null; accessibility: string; duration_minutes: number; status: string; coach_id: string | null }
const STATUS: Record<string, string> = { draft: 'مسودة', submitted: 'بانتظار اعتماد المالك', published: 'منشورة', rejected: 'مرفوضة', archived: 'مؤرشفة' }
const COACH_STATUS: Record<string, string> = { pending_activation: 'بانتظار تفعيل المالك', active: 'نشط', suspended: 'موقوف', revoked: 'ملغى' }
const errText = (e: { message?: string } | null) => !e ? '' : /specialization/i.test(e.message ?? '') ? 'اختر رياضة من تخصصاتك المعتمدة.' : /choose a sport/i.test(e.message ?? '') ? 'اختر الرياضة.' : /not allowed|status change/i.test(e.message ?? '') ? 'هذا الإجراء غير مسموح لحالة الخدمة الحالية.' : 'تعذر تنفيذ الطلب. جرّب مرة ثانية.'
const TABS = [['/coach', 'لوحة المدرب'], ['/coach/services', 'خدماتي'], ['/coach/bookings', 'طلبات الحجز'], ['/coach/schedule', 'المواعيد'], ['/coach/profile', 'ملفي']] as const

export function ClaimCoachCard({ onDone }: { onDone: () => void }) {
  const [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  async function claim() {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('claim_coach_invitation')
    setBusy(false)
    if (error) setMsg(/verify your e-mail/i.test(error.message) ? 'أكّد إيميلك أول.' : /no open coach invitation/i.test(error.message) ? 'ما لقينا دعوة مدرب مفتوحة لإيميلك. الدعوات تصدر من إدارة المنصة فقط.' : 'تعذر التنفيذ. جرّب مرة ثانية.')
    else { setMsg('تم استلام الدعوة. حسابك بانتظار تفعيل المالك.'); onDone() }
  }
  return (
    <section className="card"><h2>هل وصلتك دعوة مدرب؟</h2>
      <p className="muted small">صلاحية المدرب تُمنح بدعوة من إدارة المنصة فقط، ولا يمكن التسجيل كمدرب ذاتياً. إذا وصلتك دعوة على إيميلك المؤكَّد اضغط الزر.</p>
      <button className="outline" type="button" disabled={busy} onClick={claim}>{busy ? 'لحظة…' : 'استلم دعوة المدرب'}</button>
      {msg && <p role="status" className="info">{msg}</p>}
    </section>
  )
}

export default function CoachArea({ roles, go, sub }: { roles: Roles; go: Go; sub: string }) {
  const coach = roles.coach
  if (roles.loading) return <main className="screen market"><p className="muted empty" role="status">جاري التحميل…</p></main>
  if (!coach || coach.status === 'revoked') return (
    <main className="screen market"><div className="page-title"><h1>لوحة المدرب</h1></div>
      <p className="card muted">هذا القسم للمدربين الذين دعتهم إدارة المنصة فقط.</p><ClaimCoachCard onDone={roles.refresh} /></main>)
  if (coach.status === 'suspended') return (
    <main className="screen market"><div className="page-title"><h1>لوحة المدرب</h1></div><p className="card error" role="alert">تم إيقاف صلاحيات المدرب لحسابك مؤقتاً. تواصل مع إدارة المنصة.</p></main>)
  return (
    <main className="screen market coach-area">
      <div className="page-title"><span className="eyebrow">{coach.display_name} · {COACH_STATUS[coach.status]}</span><h1>لوحة المدرب</h1></div>
      <nav className="subtabs" aria-label="أقسام لوحة المدرب">{TABS.map(([to, label]) => <button key={to} type="button" className={sub === to ? 'chip chip-btn on' : 'chip chip-btn'} onClick={() => go(to)}>{label}</button>)}</nav>
      {coach.status === 'pending_activation' && <p className="card info" role="status">طلبك بانتظار تفعيل المالك. تقدر تجهّز ملفك وتخصصاتك الآن، وإضافة الخدمات تُفتح بعد التفعيل.</p>}
      {sub === '/coach/profile' && <CoachProfileEdit coachId={coach.id} />}
      {coach.status === 'active' && sub === '/coach' && <CoachHome coachId={coach.id} go={go} />}
      {coach.status === 'active' && sub === '/coach/services' && <CoachServices coachId={coach.id} />}
      {coach.status === 'active' && sub === '/coach/bookings' && <CoachBookings coachId={coach.id} />}
      {coach.status === 'active' && sub === '/coach/schedule' && <CoachSchedule coachId={coach.id} />}
      {coach.status === 'pending_activation' && sub !== '/coach/profile' && <p className="muted">اذهب إلى «ملفي» لتجهيز بياناتك.</p>}
    </main>
  )
}

function useMine(coachId: string) {
  const [services, setServices] = useState<Svc[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const { data } = await supabase.from('services').select('id,name,description,price_kwd,sport_id,format,delivery,location,capacity,min_age,max_age,accessibility,duration_minutes,status,coach_id').eq('coach_id', coachId).order('created_at', { ascending: false })
    setServices((data ?? []) as Svc[]); setLoading(false)
  }, [coachId])
  useEffect(() => { void load() }, [load])
  return { services, loading, load }
}

function CoachHome({ coachId, go }: { coachId: string; go: Go }) {
  const { services } = useMine(coachId)
  const [n, setN] = useState<number | null>(null)
  useEffect(() => { supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('coach_id', coachId).then(({ count }) => setN(count ?? 0)) }, [coachId])
  const by = (s: string) => services.filter((x) => x.status === s).length
  return (
    <section className="card-grid">
      <div className="card"><strong>{by('published')}</strong><span className="muted">خدمات منشورة</span></div>
      <div className="card"><strong>{by('submitted')}</strong><span className="muted">بانتظار الاعتماد</span></div>
      <div className="card"><strong>{by('draft') + by('rejected')}</strong><span className="muted">مسودات / مرفوضة</span></div>
      <div className="card"><strong>{n ?? '…'}</strong><span className="muted">طلبات الحجز (تجريبية)</span></div>
      <div className="card"><span className="muted small">الأرباح والمدفوعات غير مفعّلة حالياً (مستقبلاً).</span><button className="link" type="button" onClick={() => go('/coach/services')}>أضف خدمة</button></div>
    </section>
  )
}

const blank = { name: '', description: '', price_kwd: '5', sport_id: '', format: 'private', delivery: 'in_person', location: '', capacity: '1', min_age: '', max_age: '', accessibility: '', duration_minutes: '60' }
function CoachServices({ coachId }: { coachId: string }) {
  const sports = useSports(), { services, loading, load } = useMine(coachId)
  const [approved, setApproved] = useState<string[]>([])
  const [f, setF] = useState(blank), [editing, setEditing] = useState<string | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('coach_sports').select('sport_id').eq('coach_id', coachId).eq('status', 'approved').then(({ data }) => setApproved((data ?? []).map((x) => x.sport_id as string))) }, [coachId])
  const payload = () => ({ name: f.name.trim(), description: f.description.trim(), price_kwd: Number(f.price_kwd), sport_id: f.sport_id || null, format: f.format, delivery: f.delivery, location: f.location.trim(), capacity: f.format === 'private' ? 1 : Number(f.capacity), min_age: f.min_age ? Number(f.min_age) : null, max_age: f.max_age ? Number(f.max_age) : null, accessibility: f.accessibility.trim(), duration_minutes: Number(f.duration_minutes) })
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const body = payload()
    const { error } = editing ? await supabase.from('services').update(body).eq('id', editing) : await supabase.from('services').insert(body)
    setBusy(false)
    if (error) { setMsg(errText(error)); return }
    setF(blank); setEditing(null); setMsg(editing ? 'تم الحفظ. التعديلات على خدمة منشورة تحتاج اعتماد المالك من جديد.' : 'تمت إضافة المسودة. أرسلها للاعتماد.'); void load()
  }
  async function setStatus(id: string, status: 'submitted' | 'archived') {
    const { error } = await supabase.rpc('coach_set_service_status', { p_service: id, p_status: status })
    setMsg(error ? errText(error) : status === 'submitted' ? 'أُرسلت للاعتماد.' : 'تمت الأرشفة.'); void load()
  }
  const mySports = sports.data.filter((s) => approved.includes(s.id))
  return (
    <>
      <form className="card form-grid" onSubmit={submit}>
        <h2>{editing ? 'تعديل الخدمة' : 'خدمة جديدة'}</h2>
        <label>الاسم<input required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label>الوصف<textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label>الرياضة (من تخصصاتك المعتمدة)<select required value={f.sport_id} onChange={(e) => setF({ ...f, sport_id: e.target.value })}><option value="">اختر</option>{mySports.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}</select></label>
        <label>السعر المقترح (د.ك)<input type="number" min="0" step="0.5" required value={f.price_kwd} onChange={(e) => setF({ ...f, price_kwd: e.target.value })} /></label>
        <label>النوع<select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="private">خاص</option><option value="group">جماعي</option></select></label>
        <label>الطريقة<select value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })}>{Object.entries(DELIVERY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>الموقع<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
        {f.format === 'group' && <label>السعة القصوى<input type="number" min="2" max="50" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /></label>}
        <label>أدنى عمر<input type="number" min="3" max="99" value={f.min_age} onChange={(e) => setF({ ...f, min_age: e.target.value })} /></label>
        <label>أعلى عمر<input type="number" min="3" max="99" value={f.max_age} onChange={(e) => setF({ ...f, max_age: e.target.value })} /></label>
        <label>المدة (دقيقة)<input type="number" min="15" max="240" value={f.duration_minutes} onChange={(e) => setF({ ...f, duration_minutes: e.target.value })} /></label>
        <label>تسهيلات / دعم خاص<input value={f.accessibility} onChange={(e) => setF({ ...f, accessibility: e.target.value })} /></label>
        {mySports.length === 0 && <p className="muted small">ما عندك تخصصات معتمدة بعد. اقترح تخصصاتك من «ملفي» وانتظر اعتماد المالك.</p>}
        {msg && <p role="status" className="info">{msg}</p>}
        <div className="row-actions"><button className="primary" disabled={busy}>{busy ? 'لحظة…' : editing ? 'احفظ' : 'أضف كمسودة'}</button>{editing && <button type="button" className="link" onClick={() => { setEditing(null); setF(blank) }}>إلغاء التعديل</button>}</div>
      </form>
      <h2>خدماتي</h2>
      {loading ? <p className="muted">جاري التحميل…</p> : services.length === 0 ? <p className="muted">ما عندك خدمات بعد.</p> : (
        <ul className="list">{services.map((s) => (
          <li key={s.id} className="card row"><div className="row-body"><strong>{s.name}</strong>
            <span className="muted small">{kwd(s.price_kwd)} · {FORMAT_LABEL[s.format]} · {DELIVERY_LABEL[s.delivery]}</span>
            <span className="chips"><span className="chip">{STATUS[s.status] ?? s.status}</span></span></div>
            <div className="row-actions">
              <button className="outline" type="button" onClick={() => { setEditing(s.id); setF({ name: s.name, description: s.description, price_kwd: String(s.price_kwd), sport_id: s.sport_id ?? '', format: s.format, delivery: s.delivery, location: s.location, capacity: String(s.capacity), min_age: s.min_age ? String(s.min_age) : '', max_age: s.max_age ? String(s.max_age) : '', accessibility: s.accessibility, duration_minutes: String(s.duration_minutes) }) }}>تعديل</button>
              {['draft', 'rejected'].includes(s.status) && <button className="primary" type="button" onClick={() => setStatus(s.id, 'submitted')}>أرسل للاعتماد</button>}
              {s.status !== 'archived' && <button className="outline" type="button" onClick={() => setStatus(s.id, 'archived')}>أرشفة</button>}
            </div></li>))}</ul>)}
    </>
  )
}

function CoachBookings({ coachId }: { coachId: string }) {
  type B = { id: string; scheduled_at: string; booking_status: string; participants: number; price_kwd: number; services: { name: string } | null }
  const [rows, setRows] = useState<B[] | null>(null), [names, setNames] = useState<Record<string, string>>({}), [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const [b, t] = await Promise.all([supabase.from('bookings').select('id,scheduled_at,booking_status,participants,price_kwd,services(name)').eq('coach_id', coachId).order('scheduled_at'), supabase.rpc('coach_trainees')])
    setRows((b.data ?? []) as unknown as B[]); setNames(Object.fromEntries(((t.data ?? []) as { booking_id: string; member_name: string | null }[]).map((x) => [x.booking_id, x.member_name ?? 'متدرب'])))
  }, [coachId])
  useEffect(() => { void load() }, [load])
  async function set(id: string, status: 'confirmed' | 'cancelled') { const { error } = await supabase.from('bookings').update({ booking_status: status }).eq('id', id); setMsg(error ? 'تعذر التحديث.' : 'تم التحديث.'); void load() }
  const st: Record<string, string> = { pending: 'قيد المراجعة', confirmed: 'مؤكد', cancelled: 'ملغي' }
  return (
    <>
      <p className="muted small">حجوزات تجريبية. تشوف فقط حجوزات خدماتك واسم المتدرب؛ حالة الدفع والأسعار يتحكم فيها الخادم.</p>
      {msg && <p role="status" className="info">{msg}</p>}
      {rows === null ? <p className="muted">جاري التحميل…</p> : rows.length === 0 ? <p className="muted empty">ما في طلبات حجز.</p> : (
        <ul className="list">{rows.map((b) => <li key={b.id} className="card row"><div className="row-body"><strong>{b.services?.name}</strong><span className="muted small">{names[b.id] ?? 'متدرب'} · {whenKw(b.scheduled_at)} · {b.participants} مشارك · {kwd(b.price_kwd)}</span><span className="chip">{st[b.booking_status]}</span></div>
          <div className="row-actions">{b.booking_status === 'pending' && <button className="primary" type="button" onClick={() => set(b.id, 'confirmed')}>أكّد</button>}{b.booking_status !== 'cancelled' && <button className="outline" type="button" onClick={() => set(b.id, 'cancelled')}>إلغاء</button>}</div></li>)}</ul>)}
    </>
  )
}

function CoachSchedule({ coachId }: { coachId: string }) {
  const { services } = useMine(coachId)
  const [sid, setSid] = useState(''), [at, setAt] = useState(''), [slots, setSlots] = useState<{ id: string; starts_at: string }[]>([]), [msg, setMsg] = useState('')
  const load = useCallback(async () => { if (!sid) { setSlots([]); return } const { data } = await supabase.from('service_slots').select('id,starts_at').eq('service_id', sid).gt('starts_at', new Date().toISOString()).order('starts_at'); setSlots(data ?? []) }, [sid])
  useEffect(() => { void load() }, [load])
  async function add(e: FormEvent) { e.preventDefault(); const { error } = await supabase.from('service_slots').insert({ service_id: sid, starts_at: new Date(at).toISOString() }); setMsg(error ? 'تعذر إضافة الموعد (تأكد أنه في المستقبل وغير مكرر).' : 'أضيف الموعد.'); setAt(''); void load() }
  async function del(id: string) { await supabase.from('service_slots').delete().eq('id', id); void load() }
  return (
    <>
      <label>الخدمة<select value={sid} onChange={(e) => setSid(e.target.value)}><option value="">اختر خدمة</option>{services.filter((s) => s.status !== 'archived').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {sid && <form className="card row-actions" onSubmit={add}><label>موعد جديد<input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} /></label><button className="primary">أضف</button></form>}
      {msg && <p role="status" className="info">{msg}</p>}
      <ul className="list">{slots.map((s) => <li key={s.id} className="card row"><div className="row-body">{whenKw(s.starts_at)}</div><button className="outline" type="button" onClick={() => del(s.id)}>حذف</button></li>)}</ul>
    </>
  )
}

function CoachProfileEdit({ coachId }: { coachId: string }) {
  const sports = useSports()
  const [p, setP] = useState({ display_name: '', bio: '', experience_years: '', qualifications: '', formats: [] as string[], locations: '', participant_categories: [] as string[], accessibility: '' })
  const [mine, setMine] = useState<{ sport_id: string; status: string }[]>([]), [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const [c, s] = await Promise.all([supabase.from('coach_profiles').select('display_name,bio,experience_years,qualifications,formats,locations,participant_categories,accessibility').eq('id', coachId).single(), supabase.from('coach_sports').select('sport_id,status').eq('coach_id', coachId)])
    if (c.data) setP({ display_name: c.data.display_name, bio: c.data.bio, experience_years: c.data.experience_years?.toString() ?? '', qualifications: c.data.qualifications, formats: c.data.formats, locations: c.data.locations.join('، '), participant_categories: c.data.participant_categories, accessibility: c.data.accessibility })
    setMine(s.data ?? [])
  }, [coachId])
  useEffect(() => { void load() }, [load])
  const toggle = (k: 'formats' | 'participant_categories', v: string) => setP((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }))
  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('coach_profiles').update({ display_name: p.display_name.trim(), bio: p.bio, experience_years: p.experience_years ? Number(p.experience_years) : null, qualifications: p.qualifications, formats: p.formats, locations: p.locations.split(/[،,]/).map((x) => x.trim()).filter(Boolean), participant_categories: p.participant_categories, accessibility: p.accessibility }).eq('id', coachId)
    setMsg(error ? 'تعذر الحفظ. راجع الحقول.' : 'تم حفظ الملف.')
  }
  async function propose(id: string) { const { error } = await supabase.from('coach_sports').insert({ coach_id: coachId, sport_id: id }); setMsg(error ? 'تعذر الاقتراح.' : 'أُرسل التخصص لمراجعة المالك.'); void load() }
  async function withdraw(id: string) { await supabase.from('coach_sports').delete().eq('coach_id', coachId).eq('sport_id', id); void load() }
  const SL: Record<string, string> = { proposed: 'بانتظار المراجعة', approved: 'معتمد', rejected: 'مرفوض' }
  return (
    <>
      <form className="card form-grid" onSubmit={save}>
        <h2>ملفي العام</h2>
        <label>الاسم المعروض<input required minLength={2} maxLength={60} value={p.display_name} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></label>
        <label>نبذة<textarea maxLength={1000} value={p.bio} onChange={(e) => setP({ ...p, bio: e.target.value })} /></label>
        <label>سنوات الخبرة<input type="number" min="0" max="60" value={p.experience_years} onChange={(e) => setP({ ...p, experience_years: e.target.value })} /></label>
        <label>المؤهلات (ملخص عام)<textarea maxLength={1000} value={p.qualifications} onChange={(e) => setP({ ...p, qualifications: e.target.value })} /></label>
        <fieldset><legend>طرق التدريب</legend>{Object.entries(DELIVERY_LABEL).map(([k, v]) => <label key={k} className="check"><input type="checkbox" checked={p.formats.includes(k)} onChange={() => toggle('formats', k)} /> {v}</label>)}</fieldset>
        <label>المناطق (افصل بفاصلة)<input value={p.locations} onChange={(e) => setP({ ...p, locations: e.target.value })} /></label>
        <fieldset><legend>الفئات</legend>{Object.entries(AUDIENCE_LABEL).map(([k, v]) => <label key={k} className="check"><input type="checkbox" checked={p.participant_categories.includes(k)} onChange={() => toggle('participant_categories', k)} /> {v}</label>)}</fieldset>
        <label>تسهيلات ودعم خاص<input maxLength={500} value={p.accessibility} onChange={(e) => setP({ ...p, accessibility: e.target.value })} /></label>
        {msg && <p role="status" className="info">{msg}</p>}
        <button className="primary">احفظ الملف</button>
        <p className="muted small">لا ترفع بيانات حساسة هنا؛ الوثائق الخاصة تُسلَّم للمالك بشكل منفصل وتبقى غير عامة.</p>
      </form>
      <h2>تخصصاتي</h2>
      <p className="muted small">التخصص لا يظهر للعامة إلا بعد اعتماد المالك.</p>
      <ul className="list">{mine.map((m) => <li key={m.sport_id} className="card row"><div className="row-body"><strong>{sports.data.find((s) => s.id === m.sport_id)?.name_ar}</strong><span className="chip">{SL[m.status]}</span></div><button className="outline" type="button" onClick={() => withdraw(m.sport_id)}>سحب</button></li>)}</ul>
      <label>اقترح تخصصاً<select value="" onChange={(e) => e.target.value && propose(e.target.value)}><option value="">اختر رياضة</option>{sports.data.filter((s) => !mine.some((m) => m.sport_id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}</select></label>
    </>
  )
}
