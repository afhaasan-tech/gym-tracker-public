import { useState, type ReactNode } from 'react'
import { BookOpen, CalendarCheck, Dumbbell, Home, LogIn, MoreHorizontal, Salad, Shield, Target, User, Users, Trophy, Briefcase, type LucideIcon } from 'lucide-react'
import { Logo } from './App'
import { supabase } from './supabase'

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
        <button type="button" className="brand brand-btn" onClick={() => go('/')}><Logo /><span>جيم تراكر</span></button>
        <nav className="side-nav" aria-label="أقسام التطبيق">
          {items.map(({ to, label, Icon }) => (
            <button key={to} type="button" className={active(path, to) ? 'nav-item active' : 'nav-item'} aria-current={active(path, to) ? 'page' : undefined} onClick={() => go(to)}>
              <Icon size={20} aria-hidden="true" /><span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="content">
        <header className="topbar">
          <button type="button" className="brand brand-btn" onClick={() => go('/')}><Logo /><span>جيم تراكر</span></button>
          <div className="topbar-user">
            {email ? <><span className="who" dir="auto">{email}</span><button className="outline" onClick={() => supabase.auth.signOut()}>خروج</button></>
              : <button className="outline" onClick={() => go('/login')}>تسجيل الدخول</button>}
          </div>
        </header>
        {children}
      </div>
      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {primary.map(({ to, short, Icon }) => (
          <button key={to} type="button" className={active(path, to) ? 'active' : undefined} aria-current={active(path, to) ? 'page' : undefined} onClick={() => open(to)}>
            <Icon size={22} aria-hidden="true" /><span>{short}</span>
          </button>
        ))}
        {rest.length > 0 && <button type="button" className={more ? 'active' : undefined} aria-expanded={more} onClick={() => setMore((m) => !m)}><MoreHorizontal size={22} aria-hidden="true" /><span>المزيد</span></button>}
      </nav>
      {more && (
        <div className="more-sheet" role="dialog" aria-label="المزيد">
          {rest.map(({ to, label, Icon }) => <button key={to} type="button" className={active(path, to) ? 'active' : undefined} onClick={() => open(to)}><Icon size={20} aria-hidden="true" /><span>{label}</span></button>)}
          {email && <button type="button" onClick={() => supabase.auth.signOut()}><LogIn size={20} aria-hidden="true" /><span>خروج</span></button>}
        </div>
      )}
    </div>
  )
}

export const PUBLIC_NAV: NavItem[] = [
  { to: '/', label: 'الرئيسية', short: 'الرئيسية', Icon: Home, primary: true },
  { to: '/sports', label: 'اكتشف الرياضات', short: 'الرياضات', Icon: Trophy, primary: true },
  { to: '/coaches', label: 'المدربون', short: 'المدربون', Icon: Users, primary: true },
  { to: '/muscles', label: 'اختَر عضلتك', short: 'عضلتك', Icon: Target, primary: true },
  { to: '/login', label: 'تسجيل الدخول / إنشاء حساب', short: 'دخول', Icon: LogIn, primary: true },
  { to: '/self', label: 'أتمرن بروحي', short: 'بروحي', Icon: Dumbbell },
  { to: '/food', label: 'الغذاء', short: 'الغذاء', Icon: Salad },
]
export const memberNav = (coach: boolean, admin: boolean): NavItem[] => [
  { to: '/', label: 'الرئيسية', short: 'الرئيسية', Icon: Home, primary: true },
  { to: '/workouts', label: 'تماريني', short: 'تماريني', Icon: Dumbbell, primary: true },
  { to: '/sports', label: 'اكتشف الرياضات', short: 'اكتشف', Icon: Trophy, primary: true },
  { to: '/bookings', label: 'حجوزاتي', short: 'حجوزاتي', Icon: CalendarCheck, primary: true },
  { to: '/profile', label: 'حسابي', short: 'حسابي', Icon: User, primary: true },
  { to: '/coaches', label: 'المدربون', short: 'المدربون', Icon: Users },
  { to: '/food', label: 'الغذاء', short: 'الغذاء', Icon: Salad },
  { to: '/muscles', label: 'اختَر عضلتك', short: 'عضلتك', Icon: Target },
  { to: '/self', label: 'أتمرن بروحي', short: 'بروحي', Icon: BookOpen },
  ...(coach ? [{ to: '/coach', label: 'لوحة المدرب', short: 'المدرب', Icon: Briefcase }] : []),
  ...(admin ? [{ to: '/owner', label: 'لوحة المالك', short: 'المالك', Icon: Shield }] : []),
]
