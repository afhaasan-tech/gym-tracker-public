import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { Auth, MemberArea, SetNewPassword } from './App'
import VerifyEmail from './VerifyEmail'
import ProfileView from './ProfileView'
import Shell, { publicNav, memberNav } from './Shell'
import { safeNext, useRoute } from './route'
import { useRoles } from './useRoles'
import { BookingWizard, CoachProfile, CoachesPage, FoodHub, FoodInfo, FoodServices, HomePage, Journey, MyBookings, PublicLibrary, SearchPage, SelfGuided, SportDetail, SportsPage } from './pages'
import CoachArea, { ClaimCoachCard } from './coach'
import OwnerArea from './owner'
import { t, useLang } from './i18n'
import PlansPage from './PlansPage'
import PayReturn from './PayReturn'

const MuscleExplorer = lazy(() => import('./MuscleExplorer'))
const MEMBER_ONLY = ['/workouts', '/bookings', '/profile']

export default function Root() {
  const lang = useLang()
  return <RootInner key={lang} />
}

function RootInner() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const { route, go } = useRoute()
  const roles = useRoles(session)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((event, s) => { setSession(s); if (event === 'PASSWORD_RECOVERY') setRecovering(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  const { path, segments: seg, query } = route
  const needsLogin = !session && (MEMBER_ONLY.includes(path) || path.startsWith('/pay/') || path === '/coach' || path.startsWith('/coach/') || path === '/owner' || path.startsWith('/owner/'))
  useEffect(() => {
    if (!ready) return
    if (session && path === '/login') go(safeNext(query.get('next')))
    if (needsLogin) go(`/login?next=${encodeURIComponent(path)}`)
  }, [ready, session, path, needsLogin, query, go])

  if (!ready) return null
  if (session && recovering) return <SetNewPassword onDone={() => setRecovering(false)} />
  // Defense in depth: an address that was never verified never reaches any private page.
  if (session && !session.user.email_confirmed_at) return <VerifyEmail email={session.user.email ?? ''} onBack={() => supabase.auth.signOut()} />
  if (path === '/login' && !session) return <Auth />

  const items = session ? memberNav(roles.coach?.status === 'active' || roles.coach?.status === 'pending_activation', Boolean(roles.admin)) : publicNav()
  const login = (next: string) => go(`/login?next=${encodeURIComponent(next)}`)
  let page: React.ReactNode
  if (path === '/') page = <HomePage go={go} />
  else if (path === '/search') page = <SearchPage q={query.get('q') ?? ''} go={go} />
  else if (path === '/sports') page = <SportsPage cat={query.get('cat')} go={go} />
  else if (seg[0] === 'sports' && seg[1]) page = <SportDetail slug={seg[1]} go={go} />
  else if (path === '/coaches') page = <CoachesPage go={go} />
  else if (seg[0] === 'coaches' && seg[1]) page = <CoachProfile id={seg[1]} go={go} />
  else if (seg[0] === 'journey' && ['private', 'group', 'book'].includes(seg[1])) page = <Journey kind={seg[1] as 'private' | 'group' | 'book'} query={query} go={go} />
  else if (seg[0] === 'book' && seg[1]) page = <BookingWizard serviceId={seg[1]} session={session} go={go} />
  else if (path === '/self') page = <SelfGuided session={session} go={go} query={query} />
  else if (path === '/self/library') page = session ? <MemberArea session={session} tab="library" /> : <PublicLibrary go={go} />
  else if (path === '/food') page = <FoodHub session={session} go={go} />
  else if (path === '/food/diary') page = session ? <MemberArea session={session} tab="food" /> : <main className="screen market"><div className="page-title"><h1>{t("يومية الأكل")}</h1></div><section className="card"><p>{t("يومية الأكل مجانية للأعضاء وتُحفظ في حسابك وتظهر على كل أجهزتك.")}</p><button className="primary" onClick={() => login('/food/diary')}>{t("سجّل دخولك أو أنشئ حساب")}</button></section></main>
  else if (path === '/plans') page = <PlansPage go={go} signedIn={Boolean(session)} />
  else if (path === '/food/info') page = <FoodInfo go={go} />
  else if (path === '/food/plans') page = <FoodServices slug="nutrition-plan" go={go} />
  else if (path === '/food/consult') page = <FoodServices slug="nutrition-consult" go={go} />
  else if (path === '/muscles') page = <Suspense fallback={<p className="muted empty">{t("جاري التحميل…")}</p>}><MuscleExplorer session={session} go={go} initialGroup={query.get('group')} /></Suspense>
  else if (session && path === '/workouts') page = <MemberArea session={session} tab="workouts" />
  else if (session && seg[0] === 'pay' && seg[1] === 'return' && seg[2]) page = <PayReturn bookingId={seg[2]} go={go} />
  else if (session && path === '/bookings') page = <MyBookings go={go} />
  else if (session && path === '/profile') page = <><ProfileView session={session} /><main className="screen market"><ClaimCoachCard onDone={roles.refresh} />{roles.admin && !roles.admin.aal2 && <p className="card muted">{t("حسابك مصرّح له بلوحة الإدارة؛ افتحها لإكمال التحقق الثنائي.")} <button className="link" onClick={() => go('/owner')}>{t("لوحة المالك")}</button></p>}</main></>
  else if (session && (path === '/coach' || path.startsWith('/coach/'))) page = <CoachArea roles={roles} go={go} sub={path} />
  else if (session && (path === '/owner' || path.startsWith('/owner/'))) page = <OwnerArea roles={roles} go={go} sub={path} />
  else if (needsLogin) page = null
  else page = <main className="screen market"><div className="page-title"><h1>{t("الصفحة غير موجودة")}</h1></div><button className="primary" onClick={() => go('/')}>{t("الرئيسية")}</button></main>

  return <Shell items={items} path={path} go={go} email={session?.user.email ?? undefined}>{page}</Shell>
}
