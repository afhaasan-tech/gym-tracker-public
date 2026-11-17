import { lazy, Suspense, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import Shell, { publicNav, memberNav } from './Shell'
import { safeNext, useRoute } from './route'
import { useRoles } from './useRoles'
import { HomePage } from './Home'
import { t, useLang } from './i18n'
import { useVoraOn } from './voraFlag'
import { Bot, Wallet as WalletIcon, Shield as ShieldIcon, Tag as TagIcon, Dumbbell as DumbIcon, User as UserIcon, Salad as SaladIcon } from 'lucide-react'

// Everything except the shell and the home page is loaded on demand, so the first screen does not download the whole app.
type Mod<T> = { default: T }
const pick = <M, K extends keyof M>(load: () => Promise<M>, k: K) => lazy(() => load().then((m) => ({ default: m[k] }) as Mod<M[K] & React.ComponentType<any>>))
const app = () => import('./App'), pages = () => import('./pages'), vora = () => import('./vora'), coach = () => import('./coach')
const Auth = pick(app, 'Auth'), MemberArea = pick(app, 'MemberArea'), SetNewPassword = pick(app, 'SetNewPassword')
const BookingWizard = pick(pages, 'BookingWizard'), CoachProfile = pick(pages, 'CoachProfile'), CoachesPage = pick(pages, 'CoachesPage'), FoodHub = pick(pages, 'FoodHub'), FoodInfo = pick(pages, 'FoodInfo'), FoodServices = pick(pages, 'FoodServices'), Journey = pick(pages, 'Journey'), MyBookings = pick(pages, 'MyBookings'), PublicLibrary = pick(pages, 'PublicLibrary'), SearchPage = pick(pages, 'SearchPage'), SelfGuided = pick(pages, 'SelfGuided'), SportDetail = pick(pages, 'SportDetail'), SportsPage = pick(pages, 'SportsPage')
const DeviceGate = pick(vora, 'DeviceGate'), Onboarding = pick(vora, 'Onboarding'), Wallet = pick(vora, 'Wallet'), CoachChat = pick(vora, 'CoachChat'), VoraPlans = pick(vora, 'VoraPlans'), OwnerCommerce = pick(vora, 'OwnerCommerce')
const CoachArea = lazy(coach), ClaimCoachCard = pick(coach, 'ClaimCoachCard')
const OwnerArea = lazy(() => import('./owner')), PlansPage = lazy(() => import('./PlansPage')), PayReturn = lazy(() => import('./PayReturn'))
const ProfileView = lazy(() => import('./ProfileView')), VerifyEmail = lazy(() => import('./VerifyEmail'))
const Wait = ({ children }: { children: React.ReactNode }) => <Suspense fallback={<p className="muted empty">{t("جاري التحميل…")}</p>}>{children}</Suspense>

const MuscleExplorer = lazy(() => import('./MuscleExplorer'))
const MEMBER_ONLY = ['/workouts', '/bookings', '/profile', '/ai-coach', '/wallet', '/onboarding', '/vora-admin', '/food/diary']

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
  const voraFlag = useVoraOn()
  const VORA_ON = voraFlag === true

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

  // A visitor without a session never waits for the flag: it only changes what a signed-in member sees (and /plans).
  if (!ready || (voraFlag === null && (session || path === '/plans'))) return null
  if (session && recovering) return <Wait><SetNewPassword onDone={() => setRecovering(false)} /></Wait>
  // Defense in depth: an address that was never verified never reaches any private page.
  if (session && !session.user.email_confirmed_at) return <Wait><VerifyEmail email={session.user.email ?? ''} onBack={() => supabase.auth.signOut()} /></Wait>
  if (path === '/login' && !session) return <Wait><Auth /></Wait>

  const voraItems = (): import('./Shell').NavItem[] => [
    { to: '/ai-coach', label: 'AI Coach · المدرب الذكي', short: 'Coach', Icon: Bot, primary: true },
    { to: '/workouts', label: t('تماريني'), short: t('تماريني'), Icon: DumbIcon, primary: true },
    { to: '/food/diary', label: t('يومية الأكل'), short: t('الغذاء'), Icon: SaladIcon, primary: true },
    { to: '/wallet', label: 'Wallet · المحفظة', short: 'Wallet', Icon: WalletIcon, primary: true },
    { to: '/profile', label: t('حسابي'), short: t('حسابي'), Icon: UserIcon, primary: true },
    { to: '/onboarding', label: 'Onboarding · الإعداد', short: 'Setup', Icon: UserIcon },
    { to: '/plans', label: t('الباقات والأسعار'), short: t('الباقات'), Icon: TagIcon },
    ...(roles.admin ? [{ to: '/vora-admin', label: 'Owner · المالك', short: 'Owner', Icon: ShieldIcon }] : []),
  ]
  const items = VORA_ON && session ? voraItems() : session ? memberNav(roles.coach?.status === 'active' || roles.coach?.status === 'pending_activation', Boolean(roles.admin)) : publicNav()
  const login = (next: string) => go(`/login?next=${encodeURIComponent(next)}`)
  let page: React.ReactNode
  if (VORA_ON && session && path === '/ai-coach') page = <CoachChat />
  else if (VORA_ON && session && path === '/wallet') page = <Wallet />
  else if (VORA_ON && session && path === '/onboarding') page = <Onboarding session={session} go={go} />
  else if (VORA_ON && session && path === '/vora-admin') page = <OwnerCommerce />
  else if (VORA_ON && path === '/plans') page = session ? <VoraPlans /> : <VoraPlans />
  else if (VORA_ON && session && path === '/') page = <CoachChat />
  else if (path === '/') page = <HomePage go={go} />
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
  else if (path === '/muscles') page = <MuscleExplorer session={session} go={go} initialGroup={query.get('group')} />
  else if (session && path === '/workouts') page = <MemberArea session={session} tab="workouts" />
  else if (session && seg[0] === 'pay' && seg[1] === 'return' && seg[2]) page = <PayReturn bookingId={seg[2]} go={go} />
  else if (session && path === '/bookings') page = <MyBookings go={go} />
  else if (session && path === '/profile') page = <><ProfileView session={session} /><main className="screen market"><ClaimCoachCard onDone={roles.refresh} />{roles.admin && !roles.admin.aal2 && <p className="card muted">{t("حسابك مصرّح له بلوحة الإدارة؛ افتحها لإكمال التحقق الثنائي.")} <button className="link" onClick={() => go('/owner')}>{t("لوحة المالك")}</button></p>}</main></>
  else if (session && (path === '/coach' || path.startsWith('/coach/'))) page = <CoachArea roles={roles} go={go} sub={path} />
  else if (session && (path === '/owner' || path.startsWith('/owner/'))) page = <OwnerArea roles={roles} go={go} sub={path} />
  else if (needsLogin) page = null
  else page = <main className="screen market"><div className="page-title"><h1>{t("الصفحة غير موجودة")}</h1></div><button className="primary" onClick={() => go('/')}>{t("الرئيسية")}</button></main>

  const shell = <Shell items={items} path={path} go={go} email={session?.user.email ?? undefined}><Wait>{page}</Wait></Shell>
  // VORA: every private screen requires a verified (trusted) device; the server enforces the same rule independently.
  return VORA_ON && session ? <Wait><DeviceGate>{shell}</DeviceGate></Wait> : shell
}
