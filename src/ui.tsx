import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { getLang, setLang, t, useLang } from './i18n'

/** Shared building blocks so every screen uses the same header, state and badge patterns. */
export function PageHeader({ title, kicker, children }: { title: string; kicker?: string; children?: ReactNode }) {
  return <div className="page-title">{kicker && <span className="eyebrow">{kicker}</span>}<h1>{title}</h1>{children}</div>
}
export const Page = ({ title, kicker, children }: { title: string; kicker?: string; children: ReactNode }) => (
  <main className="screen market"><PageHeader title={title} kicker={kicker} />{children}</main>
)
export const LoadingState = () => <p className="loading-state" role="status"><span className="spinner" aria-hidden="true" /> {t('جاري التحميل…')}</p>
export const ErrorState = ({ msg }: { msg: string }) => msg ? <p role="alert" className="banner error">{msg}</p> : null
export function EmptyState({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return <div className="empty-state"><strong>{title}</strong>{hint && <p className="small">{hint}</p>}{children}</div>
}
export const DemoBadge = () => <span className="chip chip-demo">{t('تجريبي')}</span>
export const LockBadge = ({ label }: { label: string }) => <span className="chip chip-lock"><Lock size={11} aria-hidden="true" />&nbsp;{label}</span>

/** العربية | English — persisted, applies dir/lang to <html>, re-renders the whole app. */
export function LangSwitch() {
  const lang = useLang()
  return (
    <div className="lang-switch" role="group" aria-label={t('اللغة')}>
      <button type="button" aria-pressed={lang === 'ar'} lang="ar" onClick={() => setLang('ar')}>العربية</button>
      <button type="button" aria-pressed={lang === 'en'} lang="en" onClick={() => setLang('en')}>English</button>
    </div>
  )
}
export const currentLang = getLang
