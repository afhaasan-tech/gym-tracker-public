import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { authErrorMessage, callAi, PHOTO_BUCKET, supabase, validatePhoto, type Workout } from './supabase'
import { CalendarCheck, Dumbbell, LibraryBig, PersonStanding, UserRound, Utensils, type LucideIcon } from 'lucide-react'
import ProfileView from './ProfileView'
import BookingView from './BookingView'
import VerifyEmail, { startResendCooldown } from './VerifyEmail'
import { useFoodDiary } from './useFoodDiary'
import ExercisesViewJs from './kw/ExercisesView.jsx'
import FoodViewJs from './kw/FoodView.jsx'
import { EXERCISES, FOODS } from './kw/data.js'

// The ported views are plain JS; give them explicit prop types here.
type LibraryLog = { id: string; date: string; name: string; sets: number; reps: number; weight: number; duration: number }
type SaveResult = boolean | { ok?: boolean; error?: string }
const ExercisesView = ExercisesViewJs as unknown as React.ComponentType<{
  exercises: unknown[]; logs: LibraryLog[]
  onSaveLog: (item: { name: string; sets: number; reps: number; weight: number }) => Promise<SaveResult> | SaveResult
}>
const FoodView = FoodViewJs as unknown as React.ComponentType<{
  foods: unknown[]; meals: unknown[]; customFoods: unknown[]; calorieGoal: number
  onAddMeal: (m: unknown) => boolean; onDeleteMeal: (id: string) => boolean; onAddCustomFood: (f: unknown) => boolean
}>
import './kw/kw-scope.css'

// Heavy 3D code (three.js) loads only when the anatomy tab is opened.
const AnatomyView = lazy(() => import('./kw/AnatomyView.jsx'))
// Licensed model (CC BY-SA, see docs/ANATOMY-SOURCES.md) served from this app's own /public folder.
const ANATOMY_MODEL_URL = `${import.meta.env.BASE_URL}body.glb`

type Tab = 'workouts' | 'library' | 'food' | 'anatomy' | 'book' | 'profile'
const TABS: { id: Tab; label: string; short: string; Icon: LucideIcon }[] = [
  { id: 'workouts', label: 'تماريني', short: 'تماريني', Icon: Dumbbell },
  { id: 'library', label: 'مكتبة التمارين', short: 'المكتبة', Icon: LibraryBig },
  { id: 'food', label: 'الغذاء', short: 'الغذاء', Icon: Utensils },
  { id: 'anatomy', label: 'التشريح 3D', short: 'التشريح', Icon: PersonStanding },
  { id: 'book', label: 'احجز جلسة', short: 'احجز', Icon: CalendarCheck },
  { id: 'profile', label: 'حسابي', short: 'حسابي', Icon: UserRound },
]

const AI_OK_MESSAGE = 'تم اقتراح ملخص. تقدر تعدّله قبل الحفظ.'

function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" /></svg>
    </span>
  )
}

function Auth() {
  const [signup, setSignup] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  // Set after signup (or a login by a not-yet-verified account): shows the 6-digit code screen instead of the form.
  const [pending, setPending] = useState<{ email: string; notice?: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setInfo('')
    if (forgot) {
      // Sends a recovery link; the app opens the set-new-password screen when the user returns through it.
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
      if (error) setError(authErrorMessage(error))
      else setInfo('إذا الإيميل مسجّل عندنا، راح توصلك رسالة فيها رابط تغيير الرقم السري.')
    } else if (signup) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      if (error) setError(authErrorMessage(error))
      // With email confirmation off, signUp returns a session and the app moves to the workouts page by itself.
      // With it on there is no session until the e-mailed code is verified.
      else if (!data.session) {
        // Supabase hides whether an address exists: an already-registered address comes back with no identities and no e-mail is sent.
        if (data.user && data.user.identities?.length === 0) setError('هذا الإيميل مسجّل من قبل. سجّل دخول بدل ما تسوي حساب جديد.')
        else { startResendCooldown(email); setPending({ email }) }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error?.code === 'email_not_confirmed') setPending({ email, notice: 'حسابك ما انأكد بعد. اطلب رمز جديد واكتبه هنا.' })
      else if (error) setError(authErrorMessage(error))
    }
    setBusy(false)
  }

  if (pending) return <VerifyEmail email={pending.email} notice={pending.notice} onBack={() => { setPending(null); setSignup(false); setPassword('') }} />

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="brand"><Logo /><span>جيم تراكر</span></div>
        <div className="hero-copy">
          <h1>{forgot ? 'نسيت الرقم السري؟' : signup ? 'سوّي حسابك' : 'هلا فيك، سجّل دخولك'}</h1>
          <p>سجّل كل سيت، وشوف تطورك.</p>
        </div>
      </section>
      <section className="auth-panel">
        <form className="card auth-card" onSubmit={submit}>
          <label>الإيميل
            <input type="email" dir="ltr" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          {!forgot && <label>الرقم السري
            <input type="password" dir="ltr" required minLength={8}
              autoComplete={signup ? 'new-password' : 'current-password'} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="ثمان خانات على الأقل" />
          </label>}
          {error && <p role="alert" className="error">{error}</p>}
          {info && <p role="status" className="info">{info}</p>}
          <button className="primary" disabled={busy}>{busy ? 'لحظة…' : forgot ? 'ارسل رابط التغيير' : signup ? 'سجّل' : 'دخول'}</button>
          {!signup && !forgot && <button type="button" className="link" onClick={() => { setForgot(true); setError(''); setInfo('') }}>نسيت الرقم السري؟</button>}
          <button type="button" className="link" onClick={() => { if (forgot) setForgot(false); else setSignup(!signup); setError(''); setInfo('') }}>
            {forgot ? 'رجوع لتسجيل الدخول' : signup ? 'عندك حساب؟ سجّل دخول' : 'جديد؟ سوّي حساب'}
          </button>
        </form>
      </section>
    </main>
  )
}

/** Shown after the user opens the password-recovery link: they are signed in temporarily and must set a new password. */
function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('الرقمين السريين مب متطابقين.'); return }
    setBusy(true); setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(authErrorMessage(error))
    else onDone()
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="brand"><Logo /><span>جيم تراكر</span></div>
        <div className="hero-copy"><h1>رقم سري جديد</h1><p>اختر رقم سري جديد لحسابك.</p></div>
      </section>
      <section className="auth-panel">
        <form className="card auth-card" onSubmit={submit}>
          <label>الرقم السري الجديد
            <input type="password" dir="ltr" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="ثمان خانات على الأقل" />
          </label>
          <label>أكّد الرقم السري
            <input type="password" dir="ltr" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? 'لحظة…' : 'احفظ الرقم السري'}</button>
        </form>
      </section>
    </main>
  )
}

function PhotoPlaceholder() {
  return (
    <div className="thumb placeholder" role="img" aria-label="ما في صورة">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>
    </div>
  )
}

function Workouts({ session }: { session: Session }) {
  const [items, setItems] = useState<Workout[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [exercise, setExercise] = useState('')
  const [sets, setSets] = useState('')
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')
  const [summary, setSummary] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [photoError, setPhotoError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [analysis, setAnalysis] = useState('')
  const [analysisMsg, setAnalysisMsg] = useState('')
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('workouts')
  function goTab(next: Tab) { setTab(next); window.scrollTo({ top: 0 }) }
  // Food diary stays on this device only (no Supabase sync).
  const food = useFoodDiary(session.user.id)

  /** Saves a workout from the exercise library into the user's Supabase workouts (RLS applies). */
  async function saveLibraryLog(item: { name: string; sets: number; reps: number; weight: number }) {
    if (!(item.sets > 0 && item.reps > 0)) {
      return { error: 'حفظ التمارين في حسابك يحتاج جولات وتكرارات أكبر من صفر. تسجيل المدة فقط غير مدعوم حالياً.' }
    }
    const { error } = await supabase.from('workouts').insert({
      exercise: item.name.slice(0, 100), sets: item.sets, reps: item.reps, weight: item.weight || 0,
    })
    if (error) return { error: 'تعذر حفظ التمرين: ' + error.message }
    await load()
    return { ok: true }
  }

  async function load() {
    const { data, error } = await supabase.from('workouts').select('*').order('created_at', { ascending: false })
    if (error) { setError(error.message); setLoading(false); return }
    const rows = data as Workout[]
    setItems(rows)
    const paths = rows.map((r) => r.photo_url).filter((p): p is string => !!p)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
      const map: Record<string, string> = {}
      signed?.forEach((s) => { if (s.path && s.signedUrl) map[s.path] = s.signedUrl })
      setUrls(map)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  function choosePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allows picking the same file again
    if (!file) return
    const problem = validatePhoto(file)
    if (problem) { setPhotoError(problem); return } // keep any previously chosen photo
    setPhotoError('')
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
  }

  function clearPhoto() { setPhoto(null); setPreview(''); setPhotoError('') }

  async function suggestSummary() {
    setAiBusy(true); setAiMsg('')
    const r = await callAi<{ summary: string }>('ai-summary', {
      exercise: exercise.trim(), sets: Number(sets), reps: Number(reps), weight: Number(weight || 0),
    })
    if (r.data?.summary) { setSummary(r.data.summary); setAiMsg(AI_OK_MESSAGE) }
    else setAiMsg(r.error ?? 'صار خطأ في طلب الذكاء الاصطناعي.')
    setAiBusy(false)
  }

  async function analyze() {
    setAnalysisBusy(true); setAnalysisMsg(''); setAnalysis('')
    const r = await callAi<{ analysis: string }>('ai-analysis', {})
    if (r.data?.analysis) setAnalysis(r.data.analysis)
    else setAnalysisMsg(r.error ?? 'صار خطأ في طلب الذكاء الاصطناعي.')
    setAnalysisBusy(false)
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(''); setBusy(true)
    let photo_url: string | null = null
    if (photo) {
      const ext = photo.type === 'image/jpeg' ? 'jpg' : photo.type.split('/')[1]
      photo_url = `${session.user.id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from(PHOTO_BUCKET).upload(photo_url, photo, { contentType: photo.type })
      if (up.error) { setError('فشل رفع الصورة: ' + up.error.message); setBusy(false); return }
    }
    // user_id is NOT sent: the database fills it from the authenticated session (auth.uid()).
    const { error } = await supabase.from('workouts').insert({
      exercise: exercise.trim(), sets: Number(sets), reps: Number(reps), weight: Number(weight || 0),
      photo_url, summary: summary.trim() || null,
    })
    if (error) {
      if (photo_url) await supabase.storage.from(PHOTO_BUCKET).remove([photo_url])
      setError(error.message); setBusy(false); return
    }
    setExercise(''); setSets(''); setReps(''); setWeight(''); setSummary(''); setAiMsg(''); clearPhoto()
    await load()
    setBusy(false)
  }

  async function remove(w: Workout) {
    const { error } = await supabase.from('workouts').delete().eq('id', w.id)
    if (error) { setError(error.message); return }
    if (w.photo_url) await supabase.storage.from(PHOTO_BUCKET).remove([w.photo_url])
    setItems((xs) => xs.filter((x) => x.id !== w.id))
  }

  const canSuggest = exercise.trim() && Number(sets) > 0 && Number(reps) > 0

  return (
    <div className="app shell">
      {/* Desktop: sidebar. Mobile: this is hidden and the bottom bar below is used. */}
      <aside className="sidebar">
        <div className="brand"><Logo /><span>جيم تراكر</span></div>
        <nav className="side-nav" aria-label="أقسام التطبيق">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} type="button" className={tab === id ? 'nav-item active' : 'nav-item'}
              aria-current={tab === id ? 'page' : undefined} onClick={() => goTab(id)}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="content">
      <header className="topbar">
        <div className="brand"><Logo /><span>جيم تراكر</span></div>
        <div className="topbar-user">
          <span className="who" dir="auto">{(session.user.user_metadata?.display_name as string | undefined) || session.user.email}</span>
          <button className="outline" onClick={() => supabase.auth.signOut()}>خروج</button>
        </div>
      </header>

      {tab === 'library' && (
        <main className="kw-scope">
          <ExercisesView exercises={EXERCISES}
            logs={items.map((w) => ({ id: w.id, date: w.created_at.slice(0, 10), name: w.exercise, sets: w.sets, reps: w.reps, weight: w.weight, duration: 0 }))}
            onSaveLog={saveLibraryLog} />
        </main>
      )}
      {tab === 'food' && (
        <main className="kw-scope">
          <p className="kw-notice" role="note">سجل الغذاء محفوظ بأمان في حسابك، وتشوفه من أي جهاز تسجّل منه دخولك.</p>
          {food.status === 'loading' && <p className="kw-notice" role="status">جاري تحميل سجل الغذاء…</p>}
          {food.status === 'error' && (
            <p className="kw-notice error" role="alert">ما قدرنا نحمّل سجل الغذاء من حسابك. شيّك على الإنترنت. <button type="button" className="link" onClick={food.reload}>حاول مرة ثانية</button></p>
          )}
          {food.problem && (
            <p className="kw-notice error" role="alert">{food.problem} <button type="button" className="link" onClick={food.dismissProblem}>تمام</button></p>
          )}
          {food.imported && <p className="kw-notice info" role="status">نقلنا {food.imported.meals} وجبة و{food.imported.foods} طعام خاص من هذا الجهاز إلى حسابك.</p>}
          {food.offerImport && (
            <section className="kw-notice" role="region" aria-label="نقل سجل الغذاء القديم">
              <p>لقينا على هذا الجهاز سجل غذاء قديم ({food.legacyCount.meals} وجبة، {food.legacyCount.foods} طعام خاص). تبي تنقله إلى حسابك؟ ما راح نحذف شي من الجهاز، وما راح يتكرر لو نقلته مرتين.</p>
              <button type="button" className="primary" disabled={food.importing} onClick={() => void food.importLegacy()}>{food.importing ? 'لحظة…' : 'انقل السجل لحسابي'}</button>{' '}
              <button type="button" className="link" disabled={food.importing} onClick={food.skipLegacy}>لا، تجاهله</button>
            </section>
          )}
          <FoodView foods={FOODS} meals={food.meals} onAddMeal={food.addMeal} onDeleteMeal={food.deleteMeal}
            customFoods={food.customFoods} onAddCustomFood={food.addCustomFood} calorieGoal={2000} />
        </main>
      )}
      {tab === 'profile' && <ProfileView session={session} />}
      {tab === 'book' && <BookingView session={session} />}
      {tab === 'anatomy' && (
        <main className="kw-scope">
          <Suspense fallback={<p className="muted empty">جارٍ تحضير التشريح ثلاثي الأبعاد…</p>}>
            <AnatomyView modelUrl={ANATOMY_MODEL_URL} go={(id?: string) => goTab(id === 'exercises' ? 'library' : id === 'food' ? 'food' : 'workouts')} />
          </Suspense>
        </main>
      )}

      {tab === 'workouts' && <main className="screen">
        <div className="page-title">
          <span className="eyebrow">داخل بحساب <bdi dir="ltr">{session.user.email}</bdi></span>
          <h1>تماريني</h1>
        </div>

        <div className="layout">
          <div className="col">
            <form className="card" onSubmit={add}>
              <h2>أضف تمرين</h2>
              <label>التمرين
                <input required maxLength={100} value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="مثال: بنش برس" />
              </label>
              <div className="grid3">
                <label>السيتات
                  <input type="number" dir="ltr" required min={1} value={sets} onChange={(e) => setSets(e.target.value)} placeholder="3" />
                </label>
                <label>الريبات
                  <input type="number" dir="ltr" required min={1} value={reps} onChange={(e) => setReps(e.target.value)} placeholder="10" />
                </label>
                <label>الوزن (كجم)
                  <input type="number" dir="ltr" min={0} step="any" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="60" />
                </label>
              </div>

              <div className="photo">
                {preview ? <img className="thumb" src={preview} alt="معاينة صورة التمرين" /> : <PhotoPlaceholder />}
                <div className="photo-actions">
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="ملف صورة التمرين" hidden onChange={choosePhoto} />
                  <div className="photo-buttons">
                    <button type="button" className="outline" onClick={() => fileRef.current?.click()}>{photo ? 'غيّر الصورة' : 'أضف صورة (اختياري)'}</button>
                    {photo && <button type="button" className="link" onClick={clearPhoto}>شيل الصورة</button>}
                  </div>
                  <span className="muted small">صور بس، وبحد أقصى 5 ميغا</span>
                </div>
              </div>
              {photoError && <p role="alert" className="error">{photoError}</p>}

              <div className="ai">
                <button type="button" className="ai-btn" disabled={!canSuggest || aiBusy} onClick={suggestSummary}>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
                  {aiBusy ? 'يفكر…' : 'اقترح ملخص بالذكاء الاصطناعي'}
                </button>
                {aiMsg && <p role="status" className={summary && aiMsg === AI_OK_MESSAGE ? 'info' : 'error'}>{aiMsg}</p>}
                <label>الملخص (اختياري، تقدر تعدّله)
                  <textarea rows={3} maxLength={1000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="اكتب ملخصك، أو خلّ الذكاء الاصطناعي يقترح لك" />
                </label>
              </div>

              <button className="primary" disabled={busy}>{busy ? 'يحفظ…' : 'أضف تمرين'}</button>
            </form>

            <section className="card insight">
              <h2>آخر 7 أيام</h2>
              <p className="muted small">الذكاء الاصطناعي يوريك العضلات اللي أخذت اهتمام أقل.</p>
              <button type="button" className="outline" disabled={analysisBusy} onClick={analyze}>{analysisBusy ? 'يحلل…' : 'حلّل أسبوعي'}</button>
              {analysisMsg && <p role="alert" className="error">{analysisMsg}</p>}
              {analysis && <p className="analysis" aria-label="تحليل الأسبوع">{analysis}</p>}
            </section>
          </div>

          <div className="col">
            {error && <p role="alert" className="error banner">{error}</p>}

            <section className="history">
              <h2>السجل</h2>
              {loading && <p className="muted">جاري التحميل…</p>}
              {!loading && items.length === 0 && <p className="muted empty">ما في تمارين للحين. أضف أول تمرين من فوق.</p>}
              <ul>
                {items.map((w) => (
                  <li key={w.id} className="card row">
                    {w.photo_url && urls[w.photo_url]
                      ? <img className="thumb" src={urls[w.photo_url]} alt={`صورة ${w.exercise}`} />
                      : <PhotoPlaceholder />}
                    <div className="row-body">
                      <strong>{w.exercise}</strong>
                      <span className="chips">
                        <span className="chip">{w.sets} سيت</span>
                        <span className="chip">{w.reps} ريب</span>
                        <span className="chip">{w.weight} كجم</span>
                        <span className="muted small">{new Date(w.created_at).toLocaleDateString('ar-KW-u-nu-latn', { day: 'numeric', month: 'short' })}</span>
                      </span>
                      {w.summary && <span className="summary">{w.summary}</span>}
                    </div>
                    <button className="icon" aria-label={`احذف ${w.exercise}`} onClick={() => remove(w)}>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </main>}
      </div>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {TABS.map(({ id, short, Icon }) => (
          <button key={id} type="button" className={tab === id ? 'active' : undefined}
            aria-current={tab === id ? 'page' : undefined} onClick={() => goTab(id)}>
            <Icon size={22} aria-hidden="true" /><span>{short}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!ready) return null
  if (session && recovering) return <SetNewPassword onDone={() => setRecovering(false)} />
  // Defense in depth: even if a session ever exists for an address that was never verified, protected pages stay closed.
  if (session && !session.user.email_confirmed_at) return <VerifyEmail email={session.user.email ?? ''} onBack={() => supabase.auth.signOut()} />
  return session ? <Workouts session={session} /> : <Auth />
}
