import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from './supabase'
import { kwd, sportNameOf, useSports, whenKw, CATEGORY_LABEL } from './catalog'
import type { Roles } from './useRoles'
import { t } from './i18n'

type Go = (to: string) => void
const msgOf = (e: { message?: string } | null) => !e ? '' : /super admin only/i.test(e.message ?? '') ? t("هذا الإجراء للمالك الرئيسي فقط.") : /administrators only/i.test(e.message ?? '') ? t("يتطلب جلسة مدير موثّقة بالتحقق الثنائي.") : /qualifications/i.test(e.message ?? '') ? t("هذي الرياضة تتطلب تأكيد مراجعة المؤهلات والتراخيص أول.") : /duplicate|unique/i.test(e.message ?? '') ? t("يوجد دعوة مفتوحة لهذا الإيميل.") : /reason/i.test(e.message ?? '') ? t("اكتب سبب الإجراء.") : /coach is not active|approved specializations|only submitted/i.test(e.message ?? '') ? t("لا يمكن اعتماد الخدمة: تأكد من تفعيل المدرب واعتماد التخصص وأن الخدمة مرسلة.") : t("تعذر تنفيذ الإجراء.")

// ------------------------------------------------------------------ TOTP multi-factor gate for privileged accounts
export function MfaGate({ onDone }: { onDone: () => void }) {
  const [factor, setFactor] = useState<{ id: string; verified: boolean } | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false), [ready, setReady] = useState(false)
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const v = data?.totp?.[0]; setFactor(v ? { id: v.id, verified: true } : null); setReady(true)
    })
  }, [])
  async function start() {
    setBusy(true); setMsg('')
    const all = await supabase.auth.mfa.listFactors()
    for (const f of (all.data?.all ?? []).filter((x) => x.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'VORA admin' })
    setBusy(false)
    if (error || !data) { setMsg(t("تعذر بدء الإعداد. تأكد أن التحقق الثنائي (TOTP) مفعّل في إعدادات Supabase Auth.")); return }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const id = enroll?.id ?? factor?.id
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id!, code: code.trim() })
    setBusy(false)
    if (error) { setMsg(t("الرمز غير صحيح أو منتهي. جرّب رمزاً جديداً من التطبيق.")); setCode(''); return }
    onDone()
  }
  return (
    <main className="screen market"><div className="page-title"><h1>{t("التحقق الثنائي مطلوب")}</h1><p className="muted">{t("لوحة الإدارة تتطلب جلسة موثّقة بتطبيق المصادقة (TOTP). هذا الشرط يفرضه الخادم وليس الواجهة.")}</p></div>
      {!ready ? <p className="muted">{t("جاري التحميل…")}</p> : (
        <section className="card">
          {!factor && !enroll && <><p>{t("ما عندك تطبيق مصادقة مربوط بالحساب. اربط Google Authenticator أو أي تطبيق TOTP.")}</p><button className="primary" disabled={busy} onClick={start}>{t("ابدأ الإعداد")}</button></>}
          {enroll && <><p>{t("امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدوياً، ثم اكتب الرمز المكوّن من 6 أرقام:")}</p>
            <img className="qr" alt={t("رمز QR لربط تطبيق المصادقة")} src={enroll.qr} width={180} height={180} />
            <p dir="ltr" className="secret">{enroll.secret}</p></>}
          {(factor || enroll) && (
            <form onSubmit={verify}><label>{t("رمز التحقق")}<input dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="otp-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
              <button className="primary" disabled={busy || code.length !== 6}>{busy ? t("لحظة…") : t("تحقّق")}</button></form>)}
          {msg && <p role="alert" className="error">{msg}</p>}
        </section>)}
    </main>
  )
}

const tabsSuper = () => [['/owner', t('لوحة المالك')], ['/owner/coaches', t('طلبات المدربين')], ['/owner/services', t('اعتماد الخدمات')], ['/owner/users', t('المستخدمون والصلاحيات')], ['/owner/bookings', t('الحجوزات')], ['/owner/settings', t('إعدادات المنصة')]] as const
const tabsEmergency = () => [['/owner', t('لوحة الطوارئ')], ['/owner/coaches', t('المدربون')], ['/owner/services', t('الخدمات')], ['/owner/bookings', t('الحجوزات')], ['/owner/audit', t('سجل التدقيق')]] as const

export default function OwnerArea({ roles, go, sub }: { roles: Roles; go: Go; sub: string }) {
  if (roles.loading) return <main className="screen market"><p className="muted empty" role="status">{t("جاري التحميل…")}</p></main>
  if (!roles.admin) return <main className="screen market"><div className="page-title"><h1>{t("غير مصرّح")}</h1></div><p className="card error" role="alert">{t("هذه اللوحة لحسابات الإدارة المصرّح لها فقط.")}</p></main>
  if (!roles.admin.aal2) return <MfaGate onDone={roles.refresh} />
  const sup = roles.admin.role === 'super'
  const tabs = sup ? tabsSuper() : tabsEmergency()
  return (
    <main className="screen market owner-area">
      <div className="page-title"><span className="eyebrow">{sup ? t("المالك الرئيسي — صلاحيات كاملة") : t("مسؤول الطوارئ — صلاحيات محدودة")}</span><h1>{t("لوحة المالك")}</h1></div>
      <nav className="subtabs" aria-label={t("أقسام لوحة المالك")}>{tabs.map(([to, label]) => <button key={to} type="button" className={sub === to ? 'chip chip-btn on' : 'chip chip-btn'} onClick={() => go(to)}>{label}</button>)}</nav>
      {sub === '/owner' && <Overview />}
      {sub === '/owner/coaches' && <Coaches sup={sup} />}
      {sub === '/owner/services' && <Services sup={sup} />}
      {sub === '/owner/users' && sup && <Users />}
      {sub === '/owner/bookings' && <Bookings sup={sup} />}
      {sub === '/owner/settings' && sup && <Settings />}
      {(sub === '/owner/audit' || (sub === '/owner/settings' && sup)) && <Audit />}
    </main>
  )
}

function Overview() {
  const [s, setS] = useState<Record<string, number> | null>(null)
  useEffect(() => { supabase.rpc('owner_platform_stats').then(({ data }) => setS(data as Record<string, number>)) }, [])
  const L: [string, string][] = [['users', t("المستخدمون")], ['coaches_active', t("مدربون نشطون")], ['coaches_pending', t("مدربون بانتظار التفعيل")], ['services_published', t("خدمات منشورة")], ['services_submitted', t("خدمات بانتظار الاعتماد")], ['bookings', t("حجوزات (تجريبية)")], ['workouts', t("سجلات تمارين")]]
  return s ? <section className="card-grid">{L.map(([k, l]) => <div key={k} className="card"><strong>{s[k]}</strong><span className="muted">{l}</span></div>)}</section> : <p className="muted">{t("جاري التحميل…")}</p>
}

function Coaches({ sup }: { sup: boolean }) {
  type C = { id: string; email: string | null; display_name: string; status: string; is_demo: boolean }
  type I = { id: string; email: string; display_name: string; status: string; expires_at: string }
  const sports = useSports()
  const [coaches, setCoaches] = useState<C[]>([]), [inv, setInv] = useState<I[]>([]), [prop, setProp] = useState<{ coach_id: string; sport_id: string }[]>([])
  const [email, setEmail] = useState(''), [name, setName] = useState(''), [reason, setReason] = useState(''), [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const [c, p] = await Promise.all([supabase.rpc('admin_list_coaches'), supabase.from('coach_sports').select('coach_id,sport_id').eq('status', 'proposed')])
    setCoaches((c.data ?? []) as C[]); setProp(p.data ?? [])
    if (sup) { const i = await supabase.rpc('owner_list_invitations'); setInv((i.data ?? []) as I[]) }
  }, [sup])
  useEffect(() => { void load() }, [load])
  const run = async (p: PromiseLike<{ error: { message?: string } | null }>, ok: string) => { const { error } = await p; setMsg(error ? msgOf(error) : ok); void load() }
  const IS: Record<string, string> = { pending_activation: t("بانتظار التفعيل"), active: t("نشط"), suspended: t("موقوف"), revoked: t("ملغى") }
  return (
    <>
      {msg && <p role="status" className="info">{msg}</p>}
      {sup && <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); void run(supabase.rpc('owner_invite_coach', { p_email: email, p_name: name }), t("أُنشئت الدعوة. اطلب من المدرب إنشاء حساب عضو بنفس الإيميل وتأكيده ثم استلام الدعوة.")); setEmail(''); setName('') }}>
        <h2>{t("دعوة مدرب جديد")}</h2><p className="muted small">{t("لا يمكن لأحد أن يصير مدرباً بدون دعوتك. لا يُنشأ أي حساب بكلمة سر هنا؛ المدعو يسجّل كعضو عادي.")}</p>
        <label>{t("إيميل المدعو")}<input type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{t("الاسم المعروض")}<input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="primary">{t("أرسل الدعوة")}</button></form>}
      <label>{t("سبب الإجراء (للإيقاف)")}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("مطلوب عند الإيقاف")} /></label>
      <h2>{t("المدربون")}</h2>
      <ul className="list">{coaches.filter((c) => !c.is_demo).map((c) => (
        <li key={c.id} className="card row"><div className="row-body"><strong>{c.display_name}</strong><span className="muted small" dir="ltr">{c.email}</span><span className="chip">{IS[c.status] ?? c.status}</span></div>
          <div className="row-actions">
            {sup && ['pending_activation', 'suspended'].includes(c.status) && <button className="primary" type="button" onClick={() => run(supabase.rpc('owner_set_coach_status', { p_coach: c.id, p_status: 'active' }), t("تم التفعيل."))}>{t("فعّل")}</button>}
            {['pending_activation', 'active'].includes(c.status) && <button className="outline" type="button" onClick={() => run(supabase.rpc('admin_suspend_coach', { p_coach: c.id, p_reason: reason }), t("تم الإيقاف."))}>{t("أوقف")}</button>}
            {sup && c.status !== 'revoked' && <button className="outline" type="button" onClick={() => run(supabase.rpc('owner_set_coach_status', { p_coach: c.id, p_status: 'revoked' }), t("أُلغيت الصلاحية."))}>{t("إلغاء الصلاحية")}</button>}
          </div></li>))}
        {coaches.filter((c) => !c.is_demo).length === 0 && <li className="muted">{t("ما في مدربين حقيقيين بعد.")}</li>}</ul>
      {sup && <><h2>{t("تخصصات مقترحة للمراجعة")}</h2>
        <ul className="list">{prop.map((p) => <li key={p.coach_id + p.sport_id} className="card row"><div className="row-body"><strong>{coaches.find((c) => c.id === p.coach_id)?.display_name}</strong> — {sportNameOf(sports.data.find((s) => s.id === p.sport_id))}</div>
          <div className="row-actions"><button className="primary" type="button" onClick={() => run(supabase.rpc('owner_review_coach_sport', { p_coach: p.coach_id, p_sport: p.sport_id, p_approve: true }), t("اعتُمد التخصص."))}>{t("اعتمد")}</button><button className="outline" type="button" onClick={() => run(supabase.rpc('owner_review_coach_sport', { p_coach: p.coach_id, p_sport: p.sport_id, p_approve: false }), t("رُفض التخصص."))}>{t("ارفض")}</button></div></li>)}
          {prop.length === 0 && <li className="muted">{t("لا توجد تخصصات بانتظار المراجعة.")}</li>}</ul>
        <h2>{t("الدعوات")}</h2>
        <ul className="list">{inv.map((i) => <li key={i.id} className="card row"><div className="row-body"><strong>{i.display_name}</strong><span className="muted small" dir="ltr">{i.email}</span><span className="chip">{{ invited: t("مفتوحة"), claimed: t("استُلمت"), cancelled: t("ملغاة"), expired: t("منتهية") }[i.status] ?? i.status}</span></div>
          {i.status === 'invited' && <button className="outline" type="button" onClick={() => run(supabase.rpc('owner_cancel_invitation', { p_id: i.id }), t("أُلغيت الدعوة."))}>{t("إلغاء")}</button>}</li>)}
          {inv.length === 0 && <li className="muted">{t("ما في دعوات.")}</li>}</ul></>}
    </>
  )
}

function Services({ sup }: { sup: boolean }) {
  type S = { id: string; name: string; price_kwd: number; status: string; sport_id: string | null; coach_id: string | null; description: string }
  const sports = useSports()
  const [rows, setRows] = useState<S[]>([]), [coaches, setCoaches] = useState<{ id: string; display_name: string }[]>([]), [checked, setChecked] = useState<Record<string, boolean>>({}), [reason, setReason] = useState(''), [msg, setMsg] = useState('')
  const load = useCallback(async () => {
    const [s, c] = await Promise.all([supabase.from('services').select('id,name,price_kwd,status,sport_id,coach_id,description').in('status', ['submitted', 'published']).order('status').order('created_at', { ascending: false }), supabase.rpc('admin_list_coaches')])
    setRows((s.data ?? []) as S[]); setCoaches((c.data ?? []) as { id: string; display_name: string }[])
  }, [])
  useEffect(() => { void load() }, [load])
  const run = async (p: PromiseLike<{ error: { message?: string } | null }>, ok: string) => { const { error } = await p; setMsg(error ? msgOf(error) : ok); void load() }
  const sub = rows.filter((r) => r.status === 'submitted'), pub = rows.filter((r) => r.status === 'published' && r.coach_id)
  const Line = ({ s }: { s: S }) => { const sp = sports.data.find((x) => x.id === s.sport_id); return <div className="row-body"><strong>{s.name}</strong><span className="muted small">{coaches.find((c) => c.id === s.coach_id)?.display_name ?? t("المنصة")} · {sportNameOf(sp) ?? '—'} ({sp ? CATEGORY_LABEL[sp.category] : ''}{t(") · السعر المقترح")} {kwd(s.price_kwd)}</span>{sp?.requires_review && <span className="chip chip-warn">{t("رياضة تتطلب مراجعة مؤهلات وتراخيص")}</span>}</div> }
  return (
    <>
      {msg && <p role="status" className="info">{msg}</p>}
      <label>{t("سبب الإجراء")}<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("مطلوب عند إيقاف خدمة")} /></label>
      {sup && <><h2>{t("بانتظار الاعتماد (")}{sub.length})</h2>
        <ul className="list">{sub.map((s) => { const sp = sports.data.find((x) => x.id === s.sport_id); return (
          <li key={s.id} className="card row"><Line s={s} />
            <div className="row-actions">
              {sp?.requires_review && <label className="check"><input type="checkbox" checked={!!checked[s.id]} onChange={(e) => setChecked({ ...checked, [s.id]: e.target.checked })} /> {t("راجعت المؤهلات والتراخيص")}</label>}
              <button className="primary" type="button" onClick={() => run(supabase.rpc('owner_review_service', { p_service: s.id, p_decision: 'published', p_qualification_checked: !!checked[s.id] }), t("نُشرت الخدمة."))}>{t("اعتمد وانشر")}</button>
              <button className="outline" type="button" onClick={() => run(supabase.rpc('owner_review_service', { p_service: s.id, p_decision: 'rejected' }), t("رُفضت الخدمة."))}>{t("ارفض")}</button></div></li>) })}
          {sub.length === 0 && <li className="muted">{t("لا توجد خدمات بانتظار الاعتماد.")}</li>}</ul></>}
      <h2>{t("خدمات المدربين المنشورة (")}{pub.length})</h2>
      <ul className="list">{pub.map((s) => <li key={s.id} className="card row"><Line s={s} /><button className="outline" type="button" onClick={() => run(supabase.rpc('admin_unpublish_service', { p_service: s.id, p_reason: reason }), t("أُوقفت الخدمة."))}>{t("أوقف الخدمة")}</button></li>)}{pub.length === 0 && <li className="muted">{t("لا توجد.")}</li>}</ul>
    </>
  )
}

function Users() {
  type U = { user_id: string; email: string; created_at: string; last_sign_in_at: string | null; coach_status: string | null; admin_role: string | null }
  const [rows, setRows] = useState<U[]>([]), [msg, setMsg] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.rpc('owner_list_users'); setRows((data ?? []) as U[]) }, [])
  useEffect(() => { void load() }, [load])
  const run = async (p: PromiseLike<{ error: { message?: string } | null }>, ok: string) => { const { error } = await p; setMsg(error ? msgOf(error) : ok); void load() }
  const hasEmergency = rows.some((r) => r.admin_role === 'emergency')
  return (
    <>
      <p className="muted small">{t("المالك الرئيسي واحد فقط ولا يمكن تغييره من هنا. يمكنك تعيين مسؤول طوارئ واحد بصلاحيات محدودة وسحبه في أي وقت. الحد الأقصى لحسابات الإدارة حسابان، ويُفرض هذا في قاعدة البيانات.")}</p>
      {msg && <p role="status" className="info">{msg}</p>}
      <ul className="list">{rows.map((u) => (
        <li key={u.user_id} className="card row"><div className="row-body"><strong dir="ltr">{u.email}</strong><span className="muted small">{t("انضم")} {whenKw(u.created_at)}</span>
          <span className="chips">{u.admin_role === 'super' && <span className="chip">{t("المالك الرئيسي")}</span>}{u.admin_role === 'emergency' && <span className="chip chip-warn">{t("مسؤول طوارئ")}</span>}{u.coach_status && <span className="chip">{t("مدرب:")} {u.coach_status}</span>}</span></div>
          {!u.admin_role && !u.coach_status && <button className="outline" type="button" onClick={() => run(supabase.rpc('owner_set_emergency_admin', { p_user: u.user_id }), t("عُيّن مسؤول الطوارئ."))}>{t("عيّنه مسؤول طوارئ")}</button>}
          {u.admin_role === 'emergency' && <button className="outline" type="button" onClick={() => run(supabase.rpc('owner_clear_emergency_admin'), t("سُحبت صلاحية الطوارئ."))}>{t("اسحب صلاحية الطوارئ")}</button>}</li>))}</ul>
      {!hasEmergency && <p className="muted small">{t("لا يوجد مسؤول طوارئ حالياً.")}</p>}
    </>
  )
}

function Bookings({ sup }: { sup: boolean }) {
  type B = { id: string; scheduled_at: string; booking_status: string; payment_status: string; price_kwd: number; services: { name: string } | null }
  const [rows, setRows] = useState<B[]>([]), [reason, setReason] = useState(''), [msg, setMsg] = useState('')
  const load = useCallback(async () => { const { data } = await supabase.from('bookings').select('id,scheduled_at,booking_status,payment_status,price_kwd,services(name)').order('created_at', { ascending: false }).limit(200); setRows((data ?? []) as unknown as B[]) }, [])
  useEffect(() => { void load() }, [load])
  const run = async (p: PromiseLike<{ error: { message?: string } | null }>, ok: string) => { const { error } = await p; setMsg(error ? msgOf(error) : ok); void load() }
  const st: Record<string, string> = { pending: t("قيد المراجعة"), confirmed: t("مؤكد"), cancelled: t("ملغي") }
  return (
    <>
      <p className="muted small">{t("كل الحجوزات تجريبية. حالة الدفع تُدار من الخادم فقط وغير قابلة للتعديل من اللوحة.")}</p>
      {msg && <p role="status" className="info">{msg}</p>}
      <label>{t("سبب الإلغاء")}<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <ul className="list">{rows.map((b) => <li key={b.id} className="card row"><div className="row-body"><strong>{b.services?.name}</strong><span className="muted small">{whenKw(b.scheduled_at)} · {kwd(b.price_kwd)} {t("· الدفع:")} {b.payment_status === 'pending' ? t("غير مفعّل") : b.payment_status}</span><span className="chip">{st[b.booking_status]}</span></div>
        <div className="row-actions">{sup && b.booking_status === 'pending' && <button className="primary" type="button" onClick={() => run(supabase.from('bookings').update({ booking_status: 'confirmed' }).eq('id', b.id), t("تم التأكيد."))}>{t("أكّد")}</button>}{b.booking_status !== 'cancelled' && <button className="outline" type="button" onClick={() => run(supabase.rpc('admin_cancel_booking', { p_booking: b.id, p_reason: reason }), t("أُلغي الحجز."))}>{t("إلغاء")}</button>}</div></li>)}
        {rows.length === 0 && <li className="muted">{t("لا توجد حجوزات.")}</li>}</ul>
    </>
  )
}

function Settings() {
  const sports = useSports()
  const [settings, setSettings] = useState<{ key: string; value: unknown }[]>([]), [commission, setCommission] = useState(''), [msg, setMsg] = useState('')
  const [ns, setNs] = useState({ slug: '', ar: '', en: '', cat: 'fitness', review: false })
  const load = useCallback(async () => { const { data } = await supabase.rpc('owner_get_settings'); const s = (data ?? []) as { key: string; value: unknown }[]; setSettings(s); setCommission(String(s.find((x) => x.key === 'commission_percent')?.value ?? '')) }, [])
  useEffect(() => { void load() }, [load])
  const run = async (p: PromiseLike<{ error: { message?: string } | null }>, ok: string) => { const { error } = await p; setMsg(error ? msgOf(error) : ok); void load() }
  return (
    <>
      {msg && <p role="status" className="info">{msg}</p>}
      <section className="card"><h2>{t("العمولة المستقبلية")}</h2><p className="muted small">{t("إعداد للاستخدام المستقبلي فقط؛ لا تُحصَّل عمولات ولا مدفوعات حالياً.")}</p>
        <form className="row-actions" onSubmit={(e) => { e.preventDefault(); void run(supabase.rpc('owner_set_setting', { p_key: 'commission_percent', p_value: Number(commission) }), t("حُفظ.")) }}><label>{t("نسبة العمولة %")}<input type="number" min="0" max="50" step="0.5" value={commission} onChange={(e) => setCommission(e.target.value)} /></label><button className="primary">{t("احفظ")}</button></form>
        <p className="muted small">{t("الحجوزات تجريبية:")} {String(settings.find((x) => x.key === 'bookings_are_demo')?.value)}</p></section>
      <section><h2>{t("كتالوج الرياضات")}</h2>
        <ul className="list">{sports.data.map((s) => <li key={s.id} className="card row"><div className="row-body"><strong>{s.name_ar}</strong><span className="muted small" dir="ltr">{s.slug}</span></div>
          <button className="outline" type="button" onClick={() => run(supabase.rpc('owner_upsert_sport', { p_slug: s.slug, p_name_ar: s.name_ar, p_name_en: s.name_en, p_category: s.category, p_requires_review: s.requires_review, p_is_active: !s.is_active, p_sort: s.sort_order }), s.is_active ? t("أُخفيت الرياضة.") : t("فُعّلت الرياضة."))}>{s.is_active ? t("إخفاء") : t("تفعيل")}</button></li>)}</ul>
        <form className="card form-grid" onSubmit={(e) => { e.preventDefault(); void run(supabase.rpc('owner_upsert_sport', { p_slug: ns.slug, p_name_ar: ns.ar, p_name_en: ns.en, p_category: ns.cat, p_requires_review: ns.review, p_is_active: true, p_sort: 90 }), t("أُضيفت الرياضة.")) }}>
          <h3>{t("إضافة رياضة")}</h3>
          <label>{t("المعرّف (إنجليزي صغير)")}<input dir="ltr" required pattern="[a-z0-9-]{2,40}" value={ns.slug} onChange={(e) => setNs({ ...ns, slug: e.target.value })} /></label>
          <label>{t("الاسم بالعربي")}<input required value={ns.ar} onChange={(e) => setNs({ ...ns, ar: e.target.value })} /></label>
          <label>{t("الاسم بالإنجليزي")}<input required dir="ltr" value={ns.en} onChange={(e) => setNs({ ...ns, en: e.target.value })} /></label>
          <label>{t("النوع")}<select value={ns.cat} onChange={(e) => setNs({ ...ns, cat: e.target.value })}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="check"><input type="checkbox" checked={ns.review} onChange={(e) => setNs({ ...ns, review: e.target.checked })} /> {t("يتطلب مراجعة مؤهلات وتراخيص قبل نشر الخدمات")}</label>
          <button className="primary">{t("أضف")}</button></form></section>
    </>
  )
}

function Audit() {
  const [rows, setRows] = useState<{ id: number; at: string; actor_role: string | null; action: string; target_type: string | null; details: Record<string, unknown> }[] | null>(null)
  useEffect(() => { supabase.from('audit_log').select('id,at,actor_role,action,target_type,details').order('id', { ascending: false }).limit(100).then(({ data }) => setRows((data ?? []) as never)) }, [])
  return (
    <section><h2>{t("سجل التدقيق")}</h2><p className="muted small">{t("سجل للقراءة فقط لا يمكن تعديله أو حذفه، ويضم الإجراءات الحساسة.")}</p>
      {rows === null ? <p className="muted">{t("جاري التحميل…")}</p> : rows.length === 0 ? <p className="muted">{t("لا توجد سجلات بعد.")}</p> : <ul className="list audit">{rows.map((r) => <li key={r.id} className="card"><strong dir="ltr">{r.action}</strong> <span className="muted small">{whenKw(r.at)} · {r.actor_role ?? t("عضو")}{r.details?.emergency ? t(" · طوارئ") : ''}</span></li>)}</ul>}
    </section>
  )
}
