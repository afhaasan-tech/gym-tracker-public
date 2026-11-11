import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AUDIENCE_LABEL, CATEGORY_LABEL, DELIVERY_LABEL, FORMAT_LABEL, kwd, sportName, sportNameOf, useCoaches, useServices, useSlots, useSports, whenKw, type CatalogService } from './catalog'
import { EXERCISES } from './kw/data.js'
import { exercisesLocalized, foodsLocalized, exerciseLoc } from './i18n/data'
import ExercisesViewJs from './kw/ExercisesView.jsx'
import FoodViewJs from './kw/FoodView.jsx'
import { GROUPS, exercisesForGroup, groupName } from './muscles'
import { LoadingState, ErrorState, DemoBadge, Page, LockBadge } from './ui'
import { t } from './i18n'
import { LIMITS, groupOpen, tierOf } from './plans'

type Go = (to: string) => void
const loginTo = (next: string) => `/login?next=${encodeURIComponent(next)}`
const Loading = LoadingState
const Err = ({ msg }: { msg: string }) => <ErrorState msg={msg} />
const Demo = DemoBadge
const futurePaid = () => t('مدفوع مستقبلاً (غير مفعّل حالياً)')

function Crumbs({ items, go }: { items: [string, string?][]; go: Go }) {
  return <nav className="crumbs" aria-label={t("مسار التنقل")}>{items.map(([label, to], i) => to ? <button key={i} type="button" className="link" onClick={() => go(to)}>{label}</button> : <span key={i}>{label}</span>)}</nav>
}

// ------------------------------------------------------------------ home
const choices = (): { label: string; to: string; hint: string }[] => [
  { label: t('أبي مدرب خاص'), to: '/journey/private', hint: t('جلسات فردية مع مدرب مستقل') },
  { label: t('أبي تدريب جماعي'), to: '/journey/group', hint: t('حصص لمجموعات صغيرة') },
  { label: t('أبي أتمرن بروحي'), to: '/self', hint: t('تمارين مجانية حسب هدفك') },
  { label: t('أبي نظام غذائي'), to: '/food', hint: t('يومية الأكل والمعلومات والخدمات') },
  { label: t('أبي أحجز جلسة'), to: '/journey/book', hint: t('من الرياضة إلى الموعد') },
  { label: t('أبي أتصفح الرياضات'), to: '/sports', hint: t('كل الرياضات المتاحة') },
]
export function HomePage({ go }: { go: Go }) {
  const sports = useSports(), coaches = useCoaches(), services = useServices()
  const [q, setQ] = useState('')
  const cats = useMemo(() => [...new Set(sports.data.map((s) => s.category))].filter((c) => c !== 'nutrition'), [sports.data])
  return (
    <main className="screen market home">
      <section className="home-hero">
        <span className="eyebrow">{t("منصة رياضية كويتية")}</span>
        <h1>{t("اكتشف رياضتك والمدرب المناسب لك")}</h1>
        <p>{t("تصفّح الرياضات والمدربين والتمارين المجانية قبل ما تسوي حساب. الحجوزات الحالية تجريبية وما فيها دفع حقيقي.")}</p>
        <form className="home-search" role="search" onSubmit={(e) => { e.preventDefault(); go(`/search?q=${encodeURIComponent(q.trim())}`) }}>
          <input type="search" aria-label={t("ابحث عن رياضة أو مدرب أو خدمة")} placeholder={t("ابحث عن رياضة أو مدرب أو خدمة…")} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary" type="submit">{t("ابحث")}</button>
        </form>
      </section>
      <section aria-label={t("ابدأ من هنا")}><h2>{t("وش تبي اليوم؟")}</h2>
        <div className="choice-grid">{choices().map((c) => <button key={c.to} type="button" className="choice card" onClick={() => go(c.to)}><strong>{c.label}</strong><span className="muted small">{c.hint}</span></button>)}</div>
      </section>
      <section><div className="section-head"><h2>{t("اكتشف الرياضات")}</h2><button className="link" type="button" onClick={() => go('/sports')}>{t("عرض الكل")}</button></div>
        {sports.loading ? <Loading /> : <div className="chips wrap">{cats.map((c) => <button key={c} type="button" className="chip chip-btn" onClick={() => go(`/sports?cat=${c}`)}>{CATEGORY_LABEL[c] ?? c}</button>)}</div>}
        <Err msg={sports.error} />
      </section>
      <section><div className="section-head"><h2>{t("مدربون معتمدون")}</h2><button className="link" type="button" onClick={() => go('/coaches')}>{t("كل المدربين")}</button></div>
        {coaches.loading ? <Loading /> : coaches.data.length === 0 ? <p className="muted">{t("ما في مدربين معتمدين حالياً.")}</p>
          : <div className="card-grid">{coaches.data.slice(0, 3).map((c) => <button key={c.id} type="button" className="card coach-card" onClick={() => go(`/coaches/${c.id}`)}><strong>{c.display_name}</strong>{c.is_demo && <Demo />}<span className="muted small">{c.bio.slice(0, 90)}</span></button>)}</div>}
        <Err msg={coaches.error} />
      </section>
      <section className="split">
        <div className="card"><h2>{t("تمارين مجانية بروحك")}</h2><p className="muted">{t("اختر عضلتك أو هدفك وشوف التمارين المناسبة. الحفظ في سجلك يحتاج حساب.")}</p><div className="row-actions"><button className="outline" type="button" onClick={() => go('/self')}>{t("أتمرن بروحي")}</button><button className="outline" type="button" onClick={() => go('/muscles')}>{t("اختَر عضلتك")}</button></div></div>
        <div className="card"><h2>{t("الغذاء والتغذية")}</h2><p className="muted">{t("يومية أكل مجانية للأعضاء، ومعلومات عامة، وخدمات تغذية من مزوّدين مؤهلين عند اعتمادهم.")}</p><div className="row-actions"><button className="outline" type="button" onClick={() => go('/food')}>{t("استكشف الغذاء")}</button></div></div>
      </section>
      <p className="muted small note">{t("ملاحظة: الحجوزات والأسعار المعروضة تجريبية فقط ولا يتم أي دفع أو تنفيذ فعلي.")} {services.data.length > 0 && t("عدد الخدمات المنشورة حالياً: {0}.", [services.data.length])}</p>
    </main>
  )
}

// ------------------------------------------------------------------ search
export function SearchPage({ q, go }: { q: string; go: Go }) {
  const sports = useSports(), coaches = useCoaches(), services = useServices()
  const needle = q.trim().toLowerCase()
  const m = (...v: (string | undefined)[]) => !needle || v.some((x) => (x ?? '').toLowerCase().includes(needle))
  const rs = sports.data.filter((s) => m(sportName(s), s.name_en)), rc = coaches.data.filter((c) => m(c.display_name, c.bio)), rv = services.data.filter((s) => m(s.name, s.description))
  return (
    <Page title={t("نتائج البحث")} kicker={q ? `«${q}»` : undefined}>
      <form className="home-search" role="search" onSubmit={(e) => { e.preventDefault(); go(`/search?q=${encodeURIComponent(new FormData(e.currentTarget).get('q') as string)}`) }}>
        <input name="q" type="search" defaultValue={q} aria-label={t("بحث")} placeholder={t("ابحث…")} /><button className="primary" type="submit">{t("ابحث")}</button>
      </form>
      {(sports.loading || coaches.loading || services.loading) ? <Loading /> : (
        <>
          <h2>{t("الرياضات (")}{rs.length})</h2><div className="chips wrap">{rs.map((s) => <button key={s.id} type="button" className="chip chip-btn" onClick={() => go(`/sports/${s.slug}`)}>{sportName(s)}</button>)}</div>
          <h2>{t("المدربون (")}{rc.length})</h2><ul className="list">{rc.map((c) => <li key={c.id} className="card row"><div className="row-body"><strong>{c.display_name}</strong><span className="muted small">{c.bio.slice(0, 100)}</span></div><button className="outline" type="button" onClick={() => go(`/coaches/${c.id}`)}>{t("الملف")}</button></li>)}</ul>
          <h2>{t("الخدمات (")}{rv.length})</h2><ul className="list">{rv.map((s) => <li key={s.id} className="card row"><div className="row-body"><strong>{s.name}</strong><span className="muted small">{kwd(s.price_kwd)} · {FORMAT_LABEL[s.format]} · {DELIVERY_LABEL[s.delivery]}</span></div><button className="outline" type="button" onClick={() => go(`/book/${s.id}`)}>{t("التفاصيل")}</button></li>)}</ul>
          {rs.length + rc.length + rv.length === 0 && <p className="muted empty">{t("ما لقينا نتائج. جرّب كلمة ثانية.")}</p>}
        </>
      )}
    </Page>
  )
}

// ------------------------------------------------------------------ sports
export function SportsPage({ cat, go }: { cat: string | null; go: Go }) {
  const sports = useSports()
  const cats = [...new Set(sports.data.map((s) => s.category))]
  const shown = sports.data.filter((s) => !cat || s.category === cat)
  return (
    <Page title={t("اكتشف الرياضات")} kicker={t("كل الرياضات المتاحة في الكتالوج")}>
      <div className="chips wrap" role="group" aria-label={t("تصفية حسب النوع")}>
        <button type="button" className={!cat ? 'chip chip-btn on' : 'chip chip-btn'} onClick={() => go('/sports')}>{t("الكل")}</button>
        {cats.map((c) => <button key={c} type="button" className={cat === c ? 'chip chip-btn on' : 'chip chip-btn'} onClick={() => go(`/sports?cat=${c}`)}>{CATEGORY_LABEL[c] ?? c}</button>)}
      </div>
      {sports.loading ? <Loading /> : <div className="card-grid">{shown.map((s) => (
        <button key={s.id} type="button" className="card sport-card" onClick={() => go(`/sports/${s.slug}`)}>
          <strong>{sportName(s)}</strong>
          <span className="chips"><span className="chip">{CATEGORY_LABEL[s.category] ?? s.category}</span>{s.requires_review && <span className="chip chip-warn">{t("يتطلب مراجعة مؤهلات")}</span>}</span>
        </button>))}</div>}
      <Err msg={sports.error} />
      <p className="muted small note">{t("وجود رياضة في الكتالوج لا يعني السماح بتقديم تدريب تجاري لها؛ تُراجع المؤهلات والتراخيص قبل نشر أي خدمة.")}</p>
    </Page>
  )
}
export function SportDetail({ slug, go }: { slug: string; go: Go }) {
  const sports = useSports(), services = useServices(), coaches = useCoaches()
  const sport = sports.data.find((s) => s.slug === slug)
  if (sports.loading) return <Page title="…"><Loading /></Page>
  if (!sport) return <Page title={t("الرياضة غير موجودة")}><button className="outline" onClick={() => go('/sports')}>{t("رجوع للرياضات")}</button></Page>
  const svc = services.data.filter((s) => s.sport_id === sport.id)
  const cs = coaches.data.filter((c) => c.coach_sports.some((x) => x.sport_id === sport.id && x.status === 'approved'))
  return (
    <Page title={sportName(sport)} kicker={CATEGORY_LABEL[sport.category]}>
      <Crumbs go={go} items={[[t("الرياضات"), '/sports'], [sportName(sport)]]} />
      <h2>{t("خدمات منشورة")}</h2>
      {svc.length === 0 ? <p className="muted">{t("ما في خدمات منشورة لهذي الرياضة حالياً.")}</p> : <ServiceList services={svc} coaches={coaches.data} go={go} />}
      <h2>{t("مدربون")}</h2>
      {cs.length === 0 ? <p className="muted">{t("ما في مدربين معتمدين لهذي الرياضة حالياً.")}</p> : <ul className="list">{cs.map((c) => <li key={c.id} className="card row"><div className="row-body"><strong>{c.display_name}</strong>{c.is_demo && <Demo />}</div><button className="outline" onClick={() => go(`/coaches/${c.id}`)}>{t("الملف")}</button></li>)}</ul>}
      <h2>{t("تدرّب بروحك (مجاني)")}</h2><button className="outline" type="button" onClick={() => go('/self')}>{t("تمارين وعضلات")}</button>
    </Page>
  )
}
function ServiceList({ services, coaches, go }: { services: CatalogService[]; coaches: { id: string; display_name: string }[]; go: Go }) {
  return (
    <ul className="list">{services.map((s) => (
      <li key={s.id} className="card row"><div className="row-body">
        <strong>{s.name}</strong>
        <span className="muted small">{coaches.find((c) => c.id === s.coach_id)?.display_name ?? t("خدمة من المنصة")} · {FORMAT_LABEL[s.format]} · {DELIVERY_LABEL[s.delivery]}{s.location ? ` · ${s.location}` : ''}</span>
        <span className="chips"><span className="chip">{kwd(s.price_kwd)}</span><span className="chip">{s.duration_minutes} {t("دقيقة")}</span>{s.format === 'group' && <span className="chip">{t("حتى")} {s.capacity}</span>}{s.min_age != null && <span className="chip">{t("أعمار")} {s.min_age}–{s.max_age ?? '+'}</span>}<span className="chip chip-warn">{futurePaid()}</span><Demo /></span>
      </div><button className="primary" type="button" onClick={() => go(`/book/${s.id}`)}>{t("التفاصيل والحجز")}</button></li>))}
    </ul>
  )
}

// ------------------------------------------------------------------ coaches
export function CoachesPage({ go }: { go: Go }) {
  const coaches = useCoaches(), sports = useSports()
  const [sport, setSport] = useState(''), [fmt, setFmt] = useState(''), [loc, setLoc] = useState('')
  const shown = coaches.data.filter((c) => (!sport || c.coach_sports.some((x) => x.sport_id === sport && x.status === 'approved')) && (!fmt || c.formats.includes(fmt)) && (!loc || c.locations.some((l) => l.includes(loc))))
  return (
    <Page title={t("المدربون")} kicker={t("مدربون مستقلون معتمدون من إدارة المنصة")}>
      <div className="filters card">
        <label>{t("الرياضة")}<select value={sport} onChange={(e) => setSport(e.target.value)}><option value="">{t("الكل")}</option>{sports.data.map((s) => <option key={s.id} value={s.id}>{sportName(s)}</option>)}</select></label>
        <label>{t("طريقة التدريب")}<select value={fmt} onChange={(e) => setFmt(e.target.value)}><option value="">{t("الكل")}</option>{Object.entries(DELIVERY_LABEL).map(([k, v]) => <option key={k} value={k === 'in_person' ? 'in_person' : k}>{v}</option>)}</select></label>
        <label>{t("المنطقة")}<input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder={t("مثال: حولي")} /></label>
      </div>
      {coaches.loading ? <Loading /> : shown.length === 0 ? <p className="muted empty">{t("ما في مدربين مطابقين.")}</p> : (
        <div className="card-grid">{shown.map((c) => (
          <button key={c.id} type="button" className="card coach-card" onClick={() => go(`/coaches/${c.id}`)}>
            <strong>{c.display_name}</strong>{c.is_demo && <Demo />}
            <span className="muted small">{c.bio.slice(0, 100)}</span>
            <span className="chips">{c.formats.map((f) => <span key={f} className="chip">{DELIVERY_LABEL[f as keyof typeof DELIVERY_LABEL]}</span>)}{c.locations.slice(0, 2).map((l) => <span key={l} className="chip">{l}</span>)}</span>
          </button>))}</div>)}
      <Err msg={coaches.error} />
    </Page>
  )
}
export function CoachProfile({ id, go }: { id: string; go: Go }) {
  const coaches = useCoaches(), services = useServices(), sports = useSports()
  const c = coaches.data.find((x) => x.id === id)
  if (coaches.loading) return <Page title="…"><Loading /></Page>
  if (!c) return <Page title={t("المدرب غير متاح")}><p className="muted">{t("هذا الملف غير منشور أو غير موجود.")}</p><button className="outline" onClick={() => go('/coaches')}>{t("رجوع")}</button></Page>
  const svc = services.data.filter((s) => s.coach_id === c.id)
  return (
    <Page title={c.display_name} kicker={c.is_demo ? t("ملف تجريبي (ليس شخصاً حقيقياً)") : t("مدرب مستقل معتمد")}>
      <Crumbs go={go} items={[[t("المدربون"), '/coaches'], [c.display_name]]} />
      <section className="card">
        <p>{c.bio || t("ما في نبذة.")}</p>
        <dl className="facts">
          {c.experience_years != null && <><dt>{t("الخبرة")}</dt><dd>{c.experience_years} {t("سنة")}</dd></>}
          <dt>{t("المؤهلات")}</dt><dd>{c.qualifications || '—'}</dd>
          <dt>{t("طرق التدريب")}</dt><dd>{c.formats.map((f) => DELIVERY_LABEL[f as keyof typeof DELIVERY_LABEL]).join(t("، ")) || '—'}</dd>
          <dt>{t("المناطق")}</dt><dd>{c.locations.join(t("، ")) || '—'}</dd>
          <dt>{t("الفئات")}</dt><dd>{c.participant_categories.map((x) => AUDIENCE_LABEL[x] ?? x).join(t("، ")) || '—'}</dd>
          <dt>{t("التخصصات")}</dt><dd>{c.coach_sports.filter((x) => x.status === 'approved').map((x) => sportNameOf(sports.data.find((s) => s.id === x.sport_id))).filter(Boolean).join(t("، ")) || '—'}</dd>
          {c.accessibility && <><dt>{t("تهيئة وتسهيلات")}</dt><dd>{c.accessibility}</dd></>}
        </dl>
      </section>
      <h2>{t("خدمات هذا المدرب")}</h2>
      {svc.length === 0 ? <p className="muted">{t("ما في خدمات منشورة.")}</p> : <ServiceList services={svc} coaches={[c]} go={go} />}
    </Page>
  )
}

// ------------------------------------------------------------------ guided journeys (sport -> format -> place -> services)
export function Journey({ kind, query, go }: { kind: 'private' | 'group' | 'book'; query: URLSearchParams; go: Go }) {
  const sports = useSports(), services = useServices(), coaches = useCoaches()
  const sport = query.get('sport'), fmt = kind === 'book' ? query.get('fmt') : kind, where = query.get('where')
  const base = `/journey/${kind}`
  const set = (k: string, v: string) => { const q = new URLSearchParams(query); q.set(k, v); go(`${base}?${q}`) }
  const withServices = new Set(services.data.map((s) => s.sport_id))
  const title = { private: t("أبي مدرب خاص"), group: t("أبي تدريب جماعي"), book: t("أبي أحجز جلسة") }[kind]
  let step = 1; if (sport) step = 2; if (sport && fmt) step = 3; if (sport && fmt && where) step = 4
  const results = services.data.filter((s) => s.sport_id === sport && (!fmt || s.format === fmt) && (where === 'any' || s.delivery === where || s.delivery === 'hybrid'))
  return (
    <Page title={title} kicker={t("الخطوة {0} من 4", [step])}>
      {step > 1 && <button type="button" className="link" onClick={() => { const q = new URLSearchParams(query); (step === 2 ? ['sport'] : step === 3 ? ['fmt'] : ['where']).forEach((k) => q.delete(k)); if (step === 3 && kind !== 'book') q.delete('sport'); go(`${base}?${q}`) }}>{t("← رجوع خطوة")}</button>}
      {step === 1 && (<><h2>{t("اختر الرياضة")}</h2>{sports.loading ? <Loading /> : <div className="chips wrap">{sports.data.filter((s) => s.category !== 'nutrition').map((s) => <button key={s.id} type="button" className="chip chip-btn" onClick={() => set('sport', s.id)}>{sportName(s)}{withServices.has(s.id) ? '' : ' ·'}</button>)}</div>}<p className="muted small">{t("الرياضات بنقطة ما لها خدمات منشورة حالياً.")}</p></>)}
      {step === 2 && (<><h2>{t("نوع الجلسة")}</h2><div className="choice-grid">{(['private', 'group'] as const).map((f) => <button key={f} type="button" className="choice card" onClick={() => set('fmt', f)}><strong>{f === 'private' ? t("جلسة خاصة") : t("تدريب جماعي")}</strong></button>)}</div></>)}
      {step === 3 && (<><h2>{t("وين تبي تتدرب؟")}</h2><div className="choice-grid">{([['in_person', t("حضوري")], ['online', t("أونلاين")], ['any', t("أي طريقة")]] as const).map(([k, v]) => <button key={k} type="button" className="choice card" onClick={() => set('where', k)}><strong>{v}</strong></button>)}</div></>)}
      {step === 4 && (<><h2>{t("الخدمات المناسبة")}</h2>
        {services.loading ? <Loading /> : results.length === 0 ? <p className="muted empty">{t("ما في خدمات منشورة بهذي الخيارات حالياً. جرّب خيارات ثانية.")}</p> : <ServiceList services={results} coaches={coaches.data} go={go} />}
        <p className="muted small">{t("الحجز يتم بعد اختيار الموعد، وتسجيل الدخول يُطلب فقط عند تثبيت الحجز.")}</p></>)}
    </Page>
  )
}

// ------------------------------------------------------------------ booking wizard (demo bookings only)
const WIZ = 'gt-wizard'
type Wiz = { serviceId: string; slotId: string; free: string; participants: number; consent: boolean }
const readWiz = (id: string): Wiz => { try { const w = JSON.parse(sessionStorage.getItem(WIZ) ?? 'null'); if (w?.serviceId === id) return w } catch { /* ignore */ } return { serviceId: id, slotId: '', free: '', participants: 1, consent: false } }
const bookingMsg = (m: string) => /slot is full/i.test(m) ? t("هذا الموعد امتلأ. اختر موعد ثاني.") : /guardian/i.test(m) ? t("الخدمة لمن هم دون 18 وتحتاج موافقة ولي الأمر.") : /choose an available slot/i.test(m) ? t("اختر موعداً من المتاح.") : /not available/i.test(m) ? t("هذي الخدمة مب متاحة حالياً.") : /scheduled_at/i.test(m) ? t("اختر وقت بعد ساعة من الحين وخلال 90 يوم.") : t("تعذر تثبيت الحجز التجريبي. جرّب مرة ثانية.")
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export function BookingWizard({ serviceId, session, go }: { serviceId: string; session: Session | null; go: Go }) {
  const services = useServices(), coaches = useCoaches(), slots = useSlots(serviceId)
  const [w, setW] = useState<Wiz>(() => readWiz(serviceId))
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState<{ id: string; when: string; price: number } | null>(null)
  const s = services.data.find((x) => x.id === serviceId)
  useEffect(() => { try { sessionStorage.setItem(WIZ, JSON.stringify(w)) } catch { /* ignore */ } }, [w])
  if (services.loading) return <Page title="…"><Loading /></Page>
  if (!s) return <Page title={t("الخدمة غير متاحة")}><p className="muted">{t("هذي الخدمة غير منشورة أو غير موجودة.")}</p><button className="outline" onClick={() => go('/sports')}>{t("رجوع")}</button></Page>
  const coach = coaches.data.find((c) => c.id === s.coach_id)
  const hasSlots = slots.data.length > 0
  const minor = s.min_age != null && s.min_age < 18
  const ready = (hasSlots ? Boolean(w.slotId) : Boolean(w.free)) && (!minor || w.consent)
  async function confirm(e: FormEvent) {
    e.preventDefault(); setError('')
    if (!session) { go(loginTo(`/book/${serviceId}`)); return }
    if (!ready) { setError(minor && !w.consent ? t("لازم موافقة ولي الأمر.") : t("اختر الموعد أول.")); return }
    setBusy(true)
    const row: Record<string, unknown> = { service_id: serviceId, participants: w.participants, guardian_consent: w.consent }
    if (hasSlots) row.slot_id = w.slotId; else row.scheduled_at = new Date(w.free).toISOString()
    const { data, error: err } = await supabase.from('bookings').insert(row).select('id,scheduled_at,price_kwd').single()
    setBusy(false)
    if (err || !data) { setError(bookingMsg(err?.message ?? '')); return }
    try { sessionStorage.removeItem(WIZ) } catch { /* ignore */ }
    setDone({ id: data.id, when: data.scheduled_at, price: Number(data.price_kwd) })
  }
  if (done) return (
    <Page title={t("تم تثبيت الحجز التجريبي")}>
      <section className="card confirm"><p>{t("هذا حجز تجريبي لعرض خطوات الحجز فقط؛ ما في دفع ولا تنفيذ فعلي.")}</p>
        <dl className="facts"><dt>{t("الخدمة")}</dt><dd>{s.name}</dd><dt>{t("الموعد")}</dt><dd>{whenKw(done.when)}</dd><dt>{t("السعر (تجريبي)")}</dt><dd>{kwd(done.price)}</dd><dt>{t("حالة الدفع")}</dt><dd>{t("غير مفعّل")}</dd></dl>
        <button className="primary" type="button" onClick={() => go('/bookings')}>{t("حجوزاتي")}</button></section>
    </Page>)
  return (
    <Page title={s.name} kicker={coach ? t("مع {0}", [coach.display_name]) : t("خدمة من المنصة")}>
      <Crumbs go={go} items={[[t("الرياضات"), '/sports'], [s.name]]} />
      <section className="card"><p>{s.description}</p>
        <span className="chips"><span className="chip">{kwd(s.price_kwd)}</span><span className="chip">{FORMAT_LABEL[s.format]}</span><span className="chip">{DELIVERY_LABEL[s.delivery]}</span><span className="chip">{s.duration_minutes} {t("دقيقة")}</span><span className="chip chip-warn">{futurePaid()}</span><Demo /></span>
        {coach && <button className="link" type="button" onClick={() => go(`/coaches/${coach.id}`)}>{t("ملف المدرب")}</button>}
      </section>
      <form className="card booking-form" onSubmit={confirm}>
        <h2>{t("اختر الموعد")}</h2>
        {hasSlots ? (
          <fieldset className="slot-grid"><legend className="sr-only">{t("المواعيد المتاحة")}</legend>
            {slots.data.slice(0, 24).map((sl) => <label key={sl.id} className={w.slotId === sl.id ? 'slot on' : 'slot'}><input type="radio" name="slot" value={sl.id} checked={w.slotId === sl.id} disabled={sl.remaining < w.participants} onChange={() => setW({ ...w, slotId: sl.id })} /><span>{whenKw(sl.starts_at)}</span><small>{sl.remaining > 0 ? t("متبقي {0}", [sl.remaining]) : t("مكتمل")}</small></label>)}
          </fieldset>
        ) : <label>{t("الموعد المطلوب")}<input type="datetime-local" min={localInput(new Date(Date.now() + 2 * 3600e3))} max={localInput(new Date(Date.now() + 89 * 864e5))} value={w.free} onChange={(e) => setW({ ...w, free: e.target.value })} /></label>}
        {s.format === 'group' && <label>{t("عدد المشاركين")}<input type="number" min={1} max={s.capacity} value={w.participants} onChange={(e) => setW({ ...w, participants: Math.max(1, Math.min(s.capacity, Number(e.target.value) || 1)) })} /></label>}
        {minor && <label className="check"><input type="checkbox" checked={w.consent} onChange={(e) => setW({ ...w, consent: e.target.checked })} /> {t("أنا ولي الأمر وأوافق على حجز هذي الجلسة للمشارك")}</label>}
        <Err msg={error} />
        <div className="summary"><strong>{t("ملخص الحجز:")}</strong> {s.name} · {kwd(s.price_kwd)} {t("(السعر يحدده الخادم) ·")} {w.slotId ? whenKw(slots.data.find((x) => x.id === w.slotId)?.starts_at ?? '') : w.free || t("لم يُختر موعد")}</div>
        <button className="primary" disabled={busy}>{busy ? t("لحظة…") : session ? t("ثبّت الحجز التجريبي") : t("سجّل دخولك لتثبيت الحجز التجريبي")}</button>
        {!session && <p className="muted small">{t("اختياراتك محفوظة وترجع لك بعد تسجيل الدخول.")}</p>}
      </form>
    </Page>
  )
}

export function MyBookings({ go }: { go: Go }) {
  const [rows, setRows] = useState<{ id: string; scheduled_at: string; booking_status: string; payment_status: string; price_kwd: number; participants: number; services: { name: string } | null }[] | null>(null)
  useEffect(() => { supabase.from('bookings').select('id,scheduled_at,booking_status,payment_status,price_kwd,participants,services(name)').order('created_at', { ascending: false }).then(({ data }) => setRows((data ?? []) as never)) }, [])
  const st: Record<string, string> = { pending: t("قيد المراجعة"), confirmed: t("مؤكد (تجريبي)"), cancelled: t("ملغي") }
  return (
    <Page title={t("حجوزاتي")} kicker={t("حجوزات تجريبية فقط")}>
      {rows === null ? <Loading /> : rows.length === 0 ? <><p className="muted empty">{t("ما عندك حجوزات.")}</p><button className="primary" onClick={() => go('/journey/book')}>{t("أبي أحجز جلسة")}</button></> :
        <ul className="list bookings">{rows.map((b) => <li key={b.id} className="card row"><div className="row-body"><strong>{b.services?.name ?? t("خدمة")}</strong><span className="muted small">{whenKw(b.scheduled_at)} · {kwd(b.price_kwd)}</span><span className="chips"><span className="chip">{st[b.booking_status] ?? b.booking_status}</span><span className="chip">{t("الدفع: غير مفعّل")}</span><Demo /></span></div></li>)}</ul>}
    </Page>
  )
}

// ------------------------------------------------------------------ self-guided (free) + food hub
const ExercisesView = ExercisesViewJs as unknown as React.ComponentType<{ exercises: unknown[]; logs: unknown[]; onSaveLog: (i: { name: string; sets: number; reps: number; weight: number }) => unknown }>
const FoodView = FoodViewJs as unknown as React.ComponentType<{ foods: unknown[]; meals: unknown[]; customFoods: unknown[]; calorieGoal: number; onAddMeal: (m: unknown) => boolean; onDeleteMeal: (id: string) => boolean; onAddCustomFood: (f: unknown) => boolean }>

type Ex = { id: string; name: string; muscle: string; level: string; equipment: string; sets: number; reps: string; description: string; instructions: string[] }
export function ExerciseCards({ group, session, go, back }: { group: string; session: Session | null; go: Go; back: string }) {
  const tier = tierOf(session)
  const all = exercisesForGroup(group, EXERCISES as Ex[]).map((e) => exerciseLoc(e))
  const cap = LIMITS.exercisesPerMuscleGroup[tier]
  const list = all.slice(0, cap)
  const hidden = all.length - list.length
  const [msg, setMsg] = useState('')
  async function save(e: Ex) {
    if (!session) { go(loginTo(back)); return }
    const reps = parseInt(String(e.reps), 10) || 10
    const { error } = await supabase.from('workouts').insert({ exercise: e.name, sets: Number(e.sets) || 3, reps, weight: 0 })
    setMsg(error ? t("تعذر الحفظ. جرّب مرة ثانية.") : t("تمت إضافة «{0}» إلى تماريني.", [e.name]))
  }
  return (
    <>
      {msg && <p role="status" className="info">{msg}</p>}
      {list.length === 0 ? <p className="muted">{t("ما في تمارين لهذي المجموعة حالياً.")}</p> : (
        <ul className="list">{list.map((e) => (
          <li key={e.id} className="card"><strong>{e.name}</strong><span className="muted small"> · {e.muscle} · {e.level}</span>
            <p className="muted small">{e.description}</p>
            <details><summary>{t("خطوات الأداء")}</summary><ol>{e.instructions.map((i) => <li key={i}>{i}</li>)}</ol></details>
            <div className="row-actions"><span className="chip">{e.sets} × {e.reps}</span><button className="outline" type="button" onClick={() => save(e)}>{session ? t("أضف إلى تماريني") : t("سجّل دخولك لحفظه")}</button></div>
          </li>))}</ul>)}
      {hidden > 0 && <div className="card soft"><p className="small"><LockBadge label={t('بريميوم')} /> {t('عرض تعريفي: {0} تمارين إضافية لهذي المجموعة ضمن حيل بريميوم (متاح بعد الإطلاق).', [hidden])}</p><button className="outline" type="button" onClick={() => go(session ? '/plans' : loginTo(back))}>{session ? t('شوف الباقات') : t('سوّي حساب مجاني')}</button></div>}
    </>
  )
}
export function SelfGuided({ session, go, query }: { session: Session | null; go: Go; query: URLSearchParams }) {
  const group = query.get('group')
  return (
    <Page title={t("أتمرن بروحي")} kicker={t("مجاني — تصفّح بدون حساب")}>
      {!group ? (<>
        <h2>{t("اختر هدفك أو عضلتك")}</h2>
        <div className="choice-grid">{GROUPS.map((g) => <button key={g.id} type="button" className="choice card" onClick={() => go(groupOpen(tierOf(session), g.id) ? `/self?group=${g.id}` : loginTo(`/self?group=${g.id}`))}><strong>{groupName(g)}{!groupOpen(tierOf(session), g.id) && <> <LockBadge label={t('بريميوم')} /></>}</strong></button>)}</div>
        <div className="row-actions"><button className="outline" type="button" onClick={() => go('/muscles')}>{t("اختَر عضلتك على المجسّم")}</button><button className="outline" type="button" onClick={() => go('/self/library')}>{t("مكتبة التمارين الكاملة")}</button></div>
        <p className="muted small note">{t("الباقات المتقدمة والتدريب الشخصي المدفوع غير متاحة حالياً (مستقبلاً).")}</p>
      </>) : (<>
        <button className="link" type="button" onClick={() => go('/self')}>{t("← كل المجموعات")}</button>
        <h2>{groupName(GROUPS.find((g) => g.id === group) ?? { ar: '', en: '' })}</h2>
        <ExerciseCards group={group} session={session} go={go} back={`/self?group=${group}`} />
      </>)}
    </Page>
  )
}
export function PublicLibrary({ go }: { go: Go }) {
  return (
    <main className="kw-scope">
      <p className="kw-notice" role="note">{t("تصفّح مجاني. لحفظ تمرين في سجلك")} <button type="button" className="link" onClick={() => go(loginTo('/self/library'))}>{t("سجّل دخولك")}</button>.</p>
      <ExercisesView exercises={exercisesLocalized()} logs={[]} onSaveLog={() => ({ error: t("سجّل دخولك أول لحفظ التمرين في حسابك.") })} />
    </main>
  )
}
export function FoodHub({ session, go, sports: _s }: { session: Session | null; go: Go; sports?: unknown }) {
  void _s
  return (
    <Page title={t("الغذاء")} kicker={t("اختر ما يناسبك")}>
      <div className="choice-grid">
        <button type="button" className="choice card" onClick={() => go('/food/diary')}><strong>{t("يومية الأكل (مجانية)")}</strong><span className="muted small">{session ? t("سجّل وجباتك وتُحفظ في حسابك") : t("للأعضاء — سجّل دخولك عند الحفظ")}</span></button>
        <button type="button" className="choice card" onClick={() => go('/food/info')}><strong>{t("وصفات ومعلومات عامة")}</strong><span className="muted small">{t("قاعدة الأغذية والبحث بدون حساب")}</span></button>
        <button type="button" className="choice card" onClick={() => go('/food/plans')}><strong>{t("خطة غذائية مخصصة")}</strong><span className="muted small">{t("من مزوّد مؤهل —")} {futurePaid()}</span></button>
        <button type="button" className="choice card" onClick={() => go('/food/consult')}><strong>{t("استشارة تغذية")}</strong><span className="muted small">{t("مزوّد موثّق ومؤهل —")} {futurePaid()}</span></button>
      </div>
    </Page>
  )
}
export function FoodServices({ slug, go }: { slug: 'nutrition-plan' | 'nutrition-consult'; go: Go }) {
  const sports = useSports(), services = useServices(), coaches = useCoaches()
  const sp = sports.data.find((s) => s.slug === slug)
  const list = services.data.filter((s) => sp && s.sport_id === sp.id)
  return (
    <Page title={slug === 'nutrition-plan' ? t("خطة غذائية مخصصة") : t("استشارة تغذية")} kicker={futurePaid()}>
      <Crumbs go={go} items={[[t("الغذاء"), '/food'], [slug === 'nutrition-plan' ? t("خطة مخصصة") : t("استشارة")]]} />
      {list.length === 0 ? <p className="card muted">{t("ما في خدمات تغذية معتمدة حالياً. تظهر هنا فقط بعد أن تعتمد إدارة المنصة مزوّداً مؤهلاً، ولا تُقدَّم نصائح غذائية علاجية بدون مؤهل.")}</p> : <ServiceList services={list} coaches={coaches.data} go={go} />}
    </Page>
  )
}
export function FoodInfo({ go }: { go: Go }) {
  return (
    <main className="kw-scope">
      <p className="kw-notice" role="note">{t("معلومات غذائية تقديرية للاسترشاد فقط. لحفظ وجباتك في يوميتك")} <button type="button" className="link" onClick={() => go(loginTo('/food/diary'))}>{t("سجّل دخولك")}</button>.</p>
      <FoodView foods={foodsLocalized()} meals={[]} customFoods={[]} calorieGoal={2000} onAddMeal={() => { go(loginTo('/food/diary')); return false }} onDeleteMeal={() => false} onAddCustomFood={() => { go(loginTo('/food/diary')); return false }} />
    </main>
  )
}
