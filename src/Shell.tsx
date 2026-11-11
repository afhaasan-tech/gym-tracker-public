import { useState, type ReactNode } from 'react'
import { BookOpen, CalendarCheck, Dumbbell, Home, LogIn, MoreHorizontal, Salad, Shield, Target, User, Users, Trophy, Briefcase, Tag, type LucideIcon } from 'lucide-react'
import { Brand } from './brand'
import { supabase } from './supabase'
import { t } from './i18n'
import { LangSwitch } from './ui'

export type NavItem = { to: string; label: string; short: string; Icon: LucideIcon; primary?: boolean }
type Props = { items: NavItem[]; path: string; go: (to: string) => void; email?: string; children: ReactNode }

const active = (path: string, to: string) => to === '/' ? path === '/' : path === to || path.startsWith(to + '/')

/** Sidebar on desktop, bottom bar (with a "more" sheet) on mobile. The same items are used for both. */
export default function Shell({ items, path, go, email, children }: Props) {
  const [more, setMore] = useState(false)
  const primary = items.filter((i) => i.primary)
  const rest = items.filter((i) => !i.primary)
  const open = (to: string) => { setMore(false); go(to) }
  return (
    <div className="app shell">
      <aside className="sidebar">
        <button type="button" className="brand brand-btn" aria-label={t("الرئيسية")} onClick={() => go('/')}><Brand /></button>
        <nav className="side-nav" aria-label={t("أقسام التطبيق")}>
          {items.map(({ to, label, Icon }) => (
            <button key={to} type="button" className={active(path, to) ? 'nav-item active' : 'nav-item'} aria-current={active(path, to) ? 'page' : undefined} onClick={() => go(to)}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="content">
        <header className="topbar">
          <button type="button" className="brand brand-btn" aria-label={t("الرئيسية")} onClick={() => go('/')}><Brand /></button>
          <div className="topbar-user">
            <LangSwitch />
            {email ? <><span className="who" dir="auto">{email}</span><button className="outline" onClick={() => supabase.auth.signOut()}>{t("خروج")}</button></>
              : <button className="outline" onClick={() => go('/login')}>{t("تسجيل الدخول")}</button>}
          </div>
        </header>
        {children}
      </div>
      <nav className="bottom-nav" aria-label={t("التنقل الرئيسي")}>
        {primary.map(({ to, short, Icon }) => (
          <button key={to} type="button" className={active(path, to) ? 'active' : undefined} aria-current={active(path, to) ? 'page' : undefined} onClick={() => open(to)}>
            <Icon size={22} aria-hidden="true" /><span>{short}</span>
          </button>
        ))}
        {rest.length > 0 && <button type="button" className={more ? 'active' : undefined} aria-expanded={more} onClick={() => setMore((m) => !m)}><MoreHorizontal size={22} aria-hidden="true" /><span>{t("المزيد")}</span></button>}
      </nav>
      {more && (
        <div className="more-sheet" role="dialog" aria-label={t("المزيد")}>
          {rest.map(({ to, label, Icon }) => <button key={to} type="button" className={active(path, to) ? 'active' : undefined} onClick={() => open(to)}><Icon size={20} aria-hidden="true" /><span>{label}</span></button>)}
          {email && <button type="button" onClick={() => supabase.auth.signOut()}><LogIn size={20} aria-hidden="true" /><span>{t("خروج")}</span></button>}
        </div>
      )}
    </div>
  )
}

export const publicNav = (): NavItem[] => [
  { to: '/', label: t('الرئيسية'), short: t('الرئيسية'), Icon: Home, primary: true },
  { to: '/sports', label: t('اكتشف الرياضات'), short: t('الرياضات'), Icon: Trophy, primary: true },
  { to: '/coaches', label: t('المدربون'), short: t('المدربون'), Icon: Users, primary: true },
  { to: '/muscles', label: t('اختَر عضلتك'), short: t('عضلتك'), Icon: Target, primary: true },
  { to: '/login', label: t('تسجيل الدخول / إنشاء حساب'), short: t('دخول'), Icon: LogIn, primary: true },
  { to: '/self', label: t('أتمرن بروحي'), short: t('بروحي'), Icon: Dumbbell },
  { to: '/food', label: t('الغذاء'), short: t('الغذاء'), Icon: Salad },
  { to: '/plans', label: t('الباقات والأسعار'), short: t('الباقات'), Icon: Tag },
]
export const memberNav = (coach: boolean, admin: boolean): NavItem[] => [
  { to: '/', label: t("الرئيسية"), short: t("الرئيسية"), Icon: Home, primary: true },
  { to: '/workouts', label: t("تماريني"), short: t("تماريني"), Icon: Dumbbell, primary: true },
  { to: '/sports', label: t("اكتشف الرياضات"), short: t("اكتشف"), Icon: Trophy, primary: true },
  { to: '/bookings', label: t("حجوزاتي"), short: t("حجوزاتي"), Icon: CalendarCheck, primary: true },
  { to: '/profile', label: t("حسابي"), short: t("حسابي"), Icon: User, primary: true },
  { to: '/coaches', label: t("المدربون"), short: t("المدربون"), Icon: Users },
  { to: '/food', label: t("الغذاء"), short: t("الغذاء"), Icon: Salad },
  { to: '/muscles', label: t("اختَر عضلتك"), short: t("عضلتك"), Icon: Target },
  { to: '/self', label: t("أتمرن بروحي"), short: t("بروحي"), Icon: BookOpen },
  { to: '/plans', label: t('الباقات والأسعار'), short: t('الباقات'), Icon: Tag },
  ...(coach ? [{ to: '/coach', label: t("لوحة المدرب"), short: t("المدرب"), Icon: Briefcase }] : []),
  ...(admin ? [{ to: '/owner', label: t("لوحة المالك"), short: t("المالك"), Icon: Shield }] : []),
]
