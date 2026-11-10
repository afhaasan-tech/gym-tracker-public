import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from './supabase'

/** Seconds before a new code may be requested (matches Supabase's per-user limit of one email every 60 s). */
export const RESEND_COOLDOWN_SECONDS = 60
const MAX_WRONG_ATTEMPTS = 5

const cooldownKey = (email: string) => `gt-resend-until:${email.toLowerCase()}`

/** Remember until when "send a new code" is locked, so a page refresh does not reset the timer. */
export function startResendCooldown(email: string, seconds = RESEND_COOLDOWN_SECONDS) {
  try { sessionStorage.setItem(cooldownKey(email), String(Date.now() + seconds * 1000)) } catch { /* storage may be blocked */ }
}
function remainingCooldown(email: string): number {
  try {
    const until = Number(sessionStorage.getItem(cooldownKey(email)) ?? 0)
    return Math.max(0, Math.ceil((until - Date.now()) / 1000))
  } catch { return 0 }
}

type Failure = { message?: string; code?: string; status?: number }
const isRateLimited = (e: Failure) =>
  e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit' || /rate limit|after \d+ seconds/i.test(e.message ?? '')

/** Arabic message for a failed code check. Supabase reports a wrong code and an expired code with the same error. */
export function otpErrorMessage(e: Failure): string {
  if (isRateLimited(e)) return 'حاولت مرات واجد. انتظر شوي وبعدين جرّب مرة ثانية.'
  if (e.code === 'otp_expired' || /expired|invalid/i.test(e.message ?? '')) return 'الرمز غلط أو انتهت صلاحيته. تأكد من الرمز، أو اطلب رمز جديد.'
  if (/failed to fetch|network/i.test(e.message ?? '')) return 'ما قدرنا نتصل. شيّك على الإنترنت وجرّب مرة ثانية.'
  return 'ما قدرنا نتحقق من الرمز. جرّب مرة ثانية.'
}

/** Arabic message for a failed "send a new code" request. */
export function resendErrorMessage(e: Failure): string {
  if (isRateLimited(e)) return 'ارسلنا لك رمز قبل شوي. انتظر الوقت المعروض وبعدين اطلب رمز جديد.'
  if (e.code === 'email_address_invalid' || e.code === 'email_address_not_authorized') return 'ما نقدر نرسل رمز لهذا الإيميل. تأكد إنه إيميل صحيح.'
  if (/failed to fetch|network/i.test(e.message ?? '')) return 'ما قدرنا نتصل. شيّك على الإنترنت وجرّب مرة ثانية.'
  return 'ما قدرنا نرسل الرمز. جرّب مرة ثانية بعد شوي.'
}

/**
 * Email verification screen: the user types the 6-digit code that Supabase Auth e-mailed them.
 * The account is only activated by `verifyOtp` on the server; nothing here grants access by itself.
 */
export default function VerifyEmail({ email, notice, onBack }: { email: string; notice?: string; onBack: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(notice ?? '')
  const [wrong, setWrong] = useState(0)
  const [cooldown, setCooldown] = useState(() => remainingCooldown(email))

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(remainingCooldown(email)), 1000)
    return () => clearTimeout(t)
  }, [cooldown, email])

  async function verify(e: FormEvent) {
    e.preventDefault()
    setError(''); setInfo('')
    if (!/^\d{6}$/.test(code)) { setError('اكتب الرمز المكوّن من 6 أرقام.'); return }
    if (wrong >= MAX_WRONG_ATTEMPTS) { setError('محاولات واجد غلط. اطلب رمز جديد أول.'); return }
    setBusy(true)
    const { error: err } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' })
    setBusy(false)
    if (err) {
      setWrong((n) => n + (isRateLimited(err) ? 0 : 1))
      setError(otpErrorMessage(err)); setCode('')
    }
    // On success Supabase returns a session; App sees it through onAuthStateChange and opens the app.
  }

  async function resend() {
    if (cooldown > 0 || busy) return
    setError(''); setInfo(''); setBusy(true)
    const { error: err } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (err) {
      const seconds = Number(/(\d+) seconds/.exec(err.message ?? '')?.[1])
      startResendCooldown(email, isRateLimited(err) && seconds > 0 ? seconds : RESEND_COOLDOWN_SECONDS)
      setCooldown(remainingCooldown(email))
      setError(resendErrorMessage(err)); return
    }
    startResendCooldown(email); setCooldown(RESEND_COOLDOWN_SECONDS); setWrong(0); setCode('')
    setInfo('أرسلنا لك رمز جديد. الرمز القديم ما عاد يشتغل.')
  }

  return (
    <main className="auth-shell">
      <section className="auth-hero">
        <div className="brand"><span>جيم تراكر</span></div>
        <div className="hero-copy"><h1>أكّد إيميلك</h1><p>آخر خطوة قبل ما تبدأ.</p></div>
      </section>
      <section className="auth-panel">
        <form className="card auth-card" onSubmit={verify} noValidate>
          <p>أرسلنا رمز من 6 أرقام إلى <strong dir="ltr" className="verify-email">{email}</strong>. اكتبه هنا لتفعيل حسابك.</p>
          <label>رمز التحقق
            <input className="otp-input" dir="ltr" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          {info && <p role="status" className="info">{info}</p>}
          <button className="primary" disabled={busy}>{busy ? 'لحظة…' : 'تحقّق'}</button>
          <button type="button" className="link" onClick={resend} disabled={cooldown > 0 || busy}>
            {cooldown > 0 ? `إعادة إرسال الرمز بعد ${cooldown} ثانية` : 'ما وصلك الرمز؟ أرسل رمز جديد'}
          </button>
          <button type="button" className="link" onClick={onBack}>رجوع</button>
        </form>
      </section>
    </main>
  )
}
