// VORA AI-first screens (minimal functional UI). Enabled only when VITE_VORA_AI=1; production build is unaffected.
// Bilingual inline (Arabic/English) via L(); no payments, no real AI provider (Edge Function runs in mock mode unless the owner enables it).
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { useLang } from './i18n'
import { Page } from './ui'
import { Coins, Mail, Send, ShieldCheck, Sparkles } from 'lucide-react'

// The VORA AI screens are shown when the database flag `ai_coach_enabled` is on (owner-controlled, off by default),
// or when a build sets VITE_VORA_AI=1 (staging). While it is off, the app behaves exactly as before.
export const VORA_ENV_ON = import.meta.env.VITE_VORA_AI === '1'
let voraCache: boolean | null = VORA_ENV_ON ? true : null
export function useVoraOn(): boolean | null {
  const [on, setOn] = useState<boolean | null>(voraCache)
  useEffect(() => {
    if (voraCache !== null) return
    supabase.rpc('public_flags').then(({ data, error }) => { voraCache = !error && Boolean((data as Record<string, boolean> | null)?.ai_coach_enabled); setOn(voraCache) })
  }, [])
  return on
}
const useL = () => { const lang = useLang(); return (ar: string, en: string) => (lang === 'ar' ? ar : en) }

// ------------------------------------------------------------ device secret + Edge Function helpers
function deviceSecret(): string {
  try {
    let s = localStorage.getItem('vora_device_secret')
    if (!s || !/^[A-Za-z0-9_-]{32,128}$/.test(s)) {
      const b = crypto.getRandomValues(new Uint8Array(32))
      s = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      localStorage.setItem('vora_device_secret', s)
    }
    return s
  } catch { return 'x'.repeat(43) }
}
async function fn<T>(name: string, body: object): Promise<{ data?: T; status: number; error?: string; extra?: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return { data: data as T, status: 200 }
  const res = (error as { context?: Response }).context
  const j = res && typeof res.json === 'function' ? await res.json().catch(() => ({})) : {}
  return { status: res?.status ?? 0, error: (j as { error?: string }).error ?? error.message, extra: j }
}

// ------------------------------------------------------------ trusted-device gate
export function DeviceGate({ children }: { children: React.ReactNode }) {
  const L = useL()
  const [state, setState] = useState<'loading' | 'trusted' | 'challenge'>('loading')
  const [sent, setSent] = useState(false), [code, setCode] = useState(''), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const check = useCallback(async () => {
    const r = await fn<{ state: string }>('device-auth', { action: 'status', device_secret: deviceSecret() })
    setState(r.data?.state === 'trusted' ? 'trusted' : 'challenge')
  }, [])
  useEffect(() => { check() }, [check])
  async function send() {
    setBusy(true); setMsg('')
    const r = await fn('device-auth', { action: 'send_code', device_secret: deviceSecret(), language: L('ar', 'en') === 'ar' ? 'ar' : 'en' })
    setBusy(false)
    if (r.error) setMsg(r.error === 'too_many_requests' ? L('طلبات كثيرة، انتظر قليلاً.', 'Too many requests. Please wait.') : L('تعذر إرسال الرمز.', 'Could not send the code.'))
    else setSent(true)
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg('')
    const r = await fn<{ state: string }>('device-auth', { action: 'verify_code', device_secret: deviceSecret(), code, label: navigator.userAgent.slice(0, 50) })
    setBusy(false)
    if (r.data?.state === 'trusted') { setState('trusted'); return }
    setMsg(L('الرمز غير صحيح أو منتهي.', 'Invalid or expired code.'))
  }
  if (state === 'loading') return <p className="loading-state" role="status"><span className="spinner" aria-hidden="true" /></p>
  if (state === 'trusted') return <>{children}</>
  return (
    <main className="screen market vora-center">
      <section className="card vora-gate">
        <div className="vora-gate-icon" aria-hidden="true"><ShieldCheck size={28} /></div>
        <h1>{L('تأكيد هذا الجهاز', 'Verify this device')}</h1>
        <p className="muted">{L('لحماية حسابك، نرسل رمزاً من 6 أرقام إلى بريدك. بعد التأكيد يتم إنهاء جلساتك على الأجهزة الأخرى.', 'To protect your account we email you a 6-digit code. Once confirmed, sessions on other devices are signed out.')}</p>
        {!sent ? <button className="primary vora-wide" disabled={busy} onClick={send}><Mail size={18} aria-hidden="true" />{busy ? L('جاري الإرسال…', 'Sending…') : L('أرسل الرمز', 'Send code')}</button> : (
          <form onSubmit={verify} className="vora-stack">
            <input className="vora-otp" data-testid="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="••••••" aria-label={L('الرمز', 'Code')} dir="ltr" autoFocus />
            <button className="primary vora-wide" disabled={busy || code.length !== 6}>{L('تأكيد', 'Verify')}</button>
            <button type="button" className="link" onClick={send} disabled={busy}>{L('إعادة الإرسال', 'Resend')}</button>
          </form>)}
        {msg && <p className="vora-error" role="alert">{msg}</p>}
      </section>
    </main>
  )
}

// ------------------------------------------------------------ onboarding + consents
const CONSENTS = ['health_data_storage', 'ai_health_sharing', 'marketing_notifications'] as const
function Choice({ value, set, options, label }: { value: string; set: (v: string) => void; options: [string, string][]; label: string }) {
  return <div className="vora-field"><span className="vora-label">{label}</span><div className="vora-choices" role="radiogroup" aria-label={label}>
    {options.map(([v, t]) => <button type="button" key={v} role="radio" aria-checked={value === v} className={value === v ? 'chip-btn on' : 'chip-btn'} onClick={() => set(v)}>{t}</button>)}
  </div></div>
}
export function Onboarding({ session, go }: { session: Session; go: (to: string) => void }) {
  const L = useL()
  const [goal, setGoal] = useState('fat_loss'), [exp, setExp] = useState('beginner'), [persona, setPersona] = useState('rashid')
  const [tone, setTone] = useState('friendly'), [lang, setLang] = useState('ar'), [name, setName] = useState('')
  const [consents, setConsents] = useState<Record<string, boolean>>({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('consents').select('purpose,granted,id').order('id').then(({ data }) => { const m: Record<string, boolean> = {}; (data ?? []).forEach((c) => { m[c.purpose] = c.granted }); setConsents(m) }) }, [])
  const label: Record<string, [string, string]> = {
    health_data_storage: [L('حفظ بياناتي الصحية', 'Store my health data'), L('الوزن والطول وأي ملاحظات صحية تضيفها.', 'Weight, height and any health notes you add.')],
    ai_health_sharing: [L('مشاركة بياناتي الصحية مع المدرب الذكي', 'Share my health data with the AI coach'), L('ليعطيك نصائح أدق. يمكنك إيقافه في أي وقت.', 'For more relevant advice. You can turn it off any time.')],
    marketing_notifications: [L('إشعارات العروض', 'Offers and news'), L('اختياري.', 'Optional.')],
  }
  async function toggle(p: string, v: boolean) {
    setConsents((c) => ({ ...c, [p]: v }))
    const { error } = await supabase.rpc('consent_set', { p_purpose: p, p_granted: v, p_version: 'v1' })
    if (error) { setConsents((c) => ({ ...c, [p]: !v })); setMsg(L('تعذر حفظ الموافقة.', 'Could not save consent.')) }
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg(''); setBusy(true)
    const { error } = await supabase.from('member_preferences').upsert({
      user_id: session.user.id, goals: [goal], experience: exp, coach_persona: persona, coach_tone: tone, coach_language: lang,
      coach_name: name.trim() || null, onboarding: { done: true },
    })
    setBusy(false)
    if (error) setMsg(L('تعذر الحفظ.', 'Could not save.')); else go('/ai-coach')
  }
  const coaches: [string, string, string][] = [['rashid', L('راشد', 'Rashid'), L('مدرب قوة وتمارين', 'Strength & training')], ['sarah', L('سارة', 'Sarah'), L('لياقة وتغذية متوازنة', 'Fitness & balanced nutrition')]]
  return (
    <Page title={L('إعداد حسابك', 'Set up your profile')} kicker={L('خطوة واحدة وتبدأ', 'One step to start')}>
      <form className="vora-stack" onSubmit={save}>
        <section className="card vora-stack">
          <h2>{L('اختر مدربك', 'Choose your coach')}</h2>
          <div className="vora-coaches" role="radiogroup" aria-label={L('المدرب', 'Coach')}>
            {coaches.map(([k, n, d]) => <button type="button" key={k} role="radio" aria-checked={persona === k} data-testid={`coach-${k}`} className={persona === k ? 'vora-coach on' : 'vora-coach'} onClick={() => setPersona(k)}>
              <span className="vora-avatar" aria-hidden="true">{n.slice(0, 1)}</span><span><b>{n}</b><small className="muted">{d}</small></span></button>)}
          </div>
          <label className="vora-field"><span className="vora-label">{L('اسم مخصص للمدرب (اختياري)', 'Custom coach name (optional)')}</span><input value={name} maxLength={30} onChange={(e) => setName(e.target.value)} /></label>
          <Choice label={L('الأسلوب', 'Tone')} value={tone} set={setTone} options={[['friendly', L('ودّي', 'Friendly')], ['direct', L('مباشر', 'Direct')], ['playful', L('مرح', 'Playful')]]} />
          <Choice label={L('لغة المدرب', 'Coach language')} value={lang} set={setLang} options={[['ar', 'العربية'], ['en', 'English']]} />
        </section>
        <section className="card vora-stack">
          <h2>{L('هدفك ومستواك', 'Your goal and level')}</h2>
          <Choice label={L('هدفك', 'Goal')} value={goal} set={setGoal} options={[['fat_loss', L('خسارة الدهون', 'Fat loss')], ['muscle', L('بناء العضل', 'Build muscle')], ['fitness', L('لياقة عامة', 'General fitness')]]} />
          <Choice label={L('مستواك', 'Experience')} value={exp} set={setExp} options={[['beginner', L('مبتدئ', 'Beginner')], ['intermediate', L('متوسط', 'Intermediate')], ['advanced', L('متقدم', 'Advanced')]]} />
        </section>
        <section className="card vora-stack">
          <h2>{L('الخصوصية والموافقات', 'Privacy & consents')}</h2>
          <p className="muted small">{L('كل موافقة اختيارية ويمكن سحبها في أي وقت. سحب موافقة البيانات الصحية يحذفها فوراً.', 'Every consent is optional and can be withdrawn. Withdrawing health-data consent deletes it immediately.')}</p>
          {CONSENTS.map((p) => <label key={p} className="vora-switch"><input type="checkbox" checked={Boolean(consents[p])} onChange={(e) => toggle(p, e.target.checked)} /><span><b>{label[p][0]}</b><small className="muted">{label[p][1]}</small></span></label>)}
        </section>
        {msg && <p className="vora-error" role="alert">{msg}</p>}
        <button className="primary vora-wide" disabled={busy}>{L('حفظ ومتابعة', 'Save and continue')}</button>
      </form>
    </Page>
  )
}

// ------------------------------------------------------------ wallet
type Balance = { total?: number; held?: number; promo?: number; purchased?: number; reward?: number; subscription?: number; [k: string]: unknown }
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)
export function Wallet() {
  const L = useL()
  const [bal, setBal] = useState<Balance | null>(null), [rows, setRows] = useState<{ id: number; source: string; entry_type: string; amount: number; created_at: string }[]>([]), [err, setErr] = useState('')
  useEffect(() => {
    supabase.rpc('my_credit_balance').then(({ data, error }) => { if (error) setErr(L('تعذر تحميل الرصيد.', 'Could not load balance.')); else setBal(data as Balance) })
    supabase.from('credit_ledger').select('id,source,entry_type,amount,created_at').order('id', { ascending: false }).limit(20).then(({ data }) => setRows(data ?? []))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  const src: Record<string, string> = { promo: L('رصيد تجريبي', 'Trial credits'), purchased: L('مشترى', 'Purchased'), reward: L('مكافآت', 'Rewards'), subscription: L('الاشتراك', 'Subscription') }
  const kind: Record<string, string> = { grant: L('إضافة', 'Added'), reserve: L('خصم طلب ذكاء اصطناعي', 'AI request'), release: L('استرجاع', 'Refund'), settle: L('تأكيد الخصم', 'Charge settled'), expire: L('انتهاء صلاحية', 'Expired'), adjust: L('تعديل', 'Adjustment') }
  return (
    <Page title={L('محفظة الرصيد', 'Credit wallet')}>
      {err && <p className="vora-error" role="alert">{err}</p>}
      <section className="card vora-balance" data-testid="wallet">
        <span className="muted small">{L('الرصيد المتاح', 'Available balance')}</span>
        <p className="vora-big" dir="ltr">{bal ? fmt(Number(bal.total ?? 0)) : '…'} <small>{L('رصيد', 'credits')}</small></p>
        {bal && <div className="vora-chips">{Object.keys(src).map((k) => Number(bal[k] ?? 0) > 0 && <span key={k} className="chip">{src[k]}: {fmt(Number(bal[k]))}</span>)}{Number(bal.held ?? 0) > 0 && <span className="chip chip-warn">{L('محجوز', 'On hold')}: {fmt(Number(bal.held))}</span>}</div>}
        <p className="muted small">{L('لا توجد مدفوعات حقيقية حالياً. الرصيد التجريبي يُمنح مرة واحدة.', 'No real payments yet. Trial credits are granted once.')}</p>
      </section>
      <section className="card"><h2>{L('آخر الحركات', 'Recent activity')}</h2>
        {rows.length === 0 ? <p className="muted">{L('لا حركات بعد.', 'No activity yet.')}</p> : <ul className="vora-ledger">{rows.map((r) => <li key={r.id}>
          <span><b>{kind[r.entry_type] ?? r.entry_type}</b><small className="muted">{src[r.source] ?? r.source} · <span dir="ltr">{new Date(r.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</span></small></span>
          <b dir="ltr" className={r.amount < 0 ? 'vora-neg' : 'vora-pos'}>{r.amount > 0 ? '+' : ''}{fmt(r.amount)}</b></li>)}</ul>}
      </section>
    </Page>
  )
}

// ------------------------------------------------------------ AI coach chat
type Msg = { who: 'me' | 'coach'; text: string; mock?: boolean }
export function CoachChat() {
  const L = useL()
  const [prefs, setPrefs] = useState<{ coach_persona: string; coach_tone: string; coach_language: string; coach_name: string | null } | null>(null)
  const [ops, setOps] = useState<{ key: string; credits: number; enabled: boolean }[]>([])
  const [op, setOp] = useState(''), [text, setText] = useState(''), [msgs, setMsgs] = useState<Msg[]>([]), [pending, setPending] = useState<string | null>(null), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  useEffect(() => {
    supabase.from('member_preferences').select('coach_persona,coach_tone,coach_language,coach_name').maybeSingle().then(({ data }) => setPrefs(data))
    supabase.from('ai_operations').select('key,credits,enabled').eq('enabled', true).order('credits').then(({ data }) => { setOps(data ?? []); if (data?.[0]) setOp(data[0].key) })
  }, [])
  const opName: Record<string, string> = { quick_question: L('سؤال سريع', 'Quick question'), meal_image_analysis: L('تحليل صورة وجبة', 'Meal photo analysis'), partial_modification: L('تعديل على خطتي', 'Adjust my plan'), full_workout_plan: L('خطة تمارين كاملة', 'Full workout plan'), full_food_plan: L('خطة أكل كاملة', 'Full meal plan') }
  const cur = ops.find((o) => o.key === op)
  const name = prefs?.coach_name || (prefs?.coach_persona === 'sarah' ? L('سارة', 'Sarah') : L('راشد', 'Rashid'))
  async function ask(confirmed: boolean, idem: string) {
    if (!cur) return
    setBusy(true); setNote('')
    const r = await fn<{ text: string; credits_charged: number; mock?: boolean }>('ai-coach', {
      operation: op, message: pending ?? text, persona: prefs?.coach_persona ?? 'rashid', tone: prefs?.coach_tone ?? 'friendly', language: prefs?.coach_language ?? 'ar',
      idempotency_key: idem, confirm_credits: confirmed ? cur.credits : -1 })
    setBusy(false)
    if (r.data) { setMsgs((m) => [...m, { who: 'coach', text: r.data!.text, mock: r.data!.mock }]); setPending(null); setText(''); return }
    if (r.error === 'confirmation_required') { setPending(pending ?? text); return }
    setPending(null)
    setNote(r.error === 'insufficient_credits' ? L('رصيدك غير كافٍ.', 'Insufficient credits.') : r.error === 'device_not_trusted' ? L('الجهاز غير موثّق.', 'Device not verified.') : r.error === 'rate_limited' || r.status === 429 ? L('انتظر قليلاً.', 'Please slow down.') : L('تعذر الطلب: ', 'Request failed: ') + (r.error ?? ''))
  }
  const [idem, setIdem] = useState(() => crypto.randomUUID())
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setMsgs((m) => [...m, { who: 'me', text }]); const k = crypto.randomUUID(); setIdem(k); ask(false, k)
  }
  async function confirm() { await ask(true, idem); setIdem(crypto.randomUUID()) }
  return (
    <main className="screen market">
      <div className="vora-coach-head">
        <span className="vora-avatar lg" aria-hidden="true">{name.slice(0, 1)}</span>
        <div><span className="eyebrow">{L('المدرب الذكي', 'AI Coach')}</span><h1>{name}</h1></div>
        <span className="chip chip-warn vora-push">{L('وضع تجريبي', 'Mock mode')}</span>
      </div>
      <section className="card vora-chat" data-testid="chat" aria-live="polite">
        {msgs.length === 0 && <p className="muted vora-empty"><Sparkles size={18} aria-hidden="true" /> {L('اسأل مدربك…', 'Ask your coach…')}</p>}
        {msgs.map((m, i) => <div key={i} className={m.who === 'me' ? 'vora-bubble me' : 'vora-bubble'} dir="auto">{m.text}{m.mock && <small className="vora-mock">[mock]</small>}</div>)}
        {busy && <div className="vora-bubble typing" aria-label={L('يكتب…', 'Typing…')}><span /><span /><span /></div>}
      </section>
      {pending !== null && cur && (
        <section className="card vora-confirm" role="dialog" aria-label={L('تأكيد الخصم', 'Confirm charge')}>
          <p><Coins size={18} aria-hidden="true" /> {L(`سيتم خصم ${cur.credits} رصيد لهذا الطلب. متابعة؟`, `This request will cost ${cur.credits} credits. Continue?`)}</p>
          <div className="vora-row"><button className="primary" data-testid="confirm" disabled={busy} onClick={confirm}>{L('تأكيد', 'Confirm')}</button>
            <button className="outline" onClick={() => setPending(null)}>{L('إلغاء', 'Cancel')}</button></div>
        </section>)}
      {note && <p className="vora-error" role="alert">{note}</p>}
      <form className="card vora-composer" onSubmit={submit}>
        <div className="vora-chips" role="radiogroup" aria-label={L('نوع الطلب', 'Request type')}>{ops.map((o) => <button type="button" key={o.key} role="radio" aria-checked={op === o.key} className={op === o.key ? 'chip-btn on' : 'chip-btn'} onClick={() => setOp(o.key)}>{opName[o.key] ?? o.key} · {o.credits}</button>)}</div>
        <div className="vora-row">
          <textarea data-testid="msg" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} rows={2} placeholder={L('اكتب سؤالك…', 'Type your question…')} />
          <button className="primary" disabled={busy || !cur || !text.trim()} aria-label={L('إرسال', 'Send')}><Send size={18} aria-hidden="true" />{cur ? cur.credits : ''}</button>
        </div>
        <small className="muted">{L('الردود محاكاة ولا تُستخدم أي خدمة ذكاء اصطناعي مدفوعة. ليست نصيحة طبية.', 'Replies are simulated; no paid AI service is used. Not medical advice.')}</small>
      </form>
    </main>
  )
}

// ------------------------------------------------------------ plans (provisional, display only)
export function VoraPlans() {
  const L = useL()
  const [plans, setPlans] = useState<{ key: string; name_ar: string; name_en: string; price_kwd: number; monthly_credits: number | null; provisional: boolean; pause_eligible: boolean }[]>([])
  useEffect(() => { supabase.rpc('public_plans').then(({ data }) => setPlans((data as typeof plans) ?? [])) }, [])
  return (
    <Page title={L('الباقات', 'Plans')} kicker={L('أسعار مبدئية', 'Provisional pricing')}>
      <p className="card soft muted small" role="note">{L('الأسعار والحدود مؤقتة وقابلة للتعديل. الدفع غير مفعّل.', 'Prices and limits are provisional and configurable. Checkout is not enabled.')}</p>
      <div className="plan-grid">{plans.map((p, i) => (
        <section className={i === 1 ? 'card plan feature' : 'card plan'} key={p.key}>
          <div><h2>{L(p.name_ar, p.name_en)}</h2>{i === 1 && <span className="chip">{L('الأكثر طلباً', 'Most popular')}</span>}</div>
          <p className="price" dir="ltr">{Number(p.price_kwd).toFixed(3)} <small>KWD / {L('شهر', 'mo')}</small></p>
          <ul>
            <li>{p.monthly_credits ? `${fmt(p.monthly_credits)} ${L('رصيد شهرياً', 'credits / month')}` : L('استخدام عادل (حدود قابلة للتعديل)', 'Fair use (configurable limits)')}</li>
            <li>{L('المدرب الذكي راشد أو سارة', 'AI coach Rashid or Sarah')}</li>
            {p.pause_eligible ? <li>{L('إيقاف مؤقت حتى 14 يوماً', 'Pause up to 14 days')}</li> : <li className="no">{L('بدون إيقاف مؤقت', 'No pause')}</li>}
          </ul>
          <button className="outline soon" disabled>{L('الدفع غير متاح', 'Checkout unavailable')}</button></section>))}
      </div>
    </Page>
  )
}

// ------------------------------------------------------------ owner commerce panel
type Cfg = { operations: { key: string; credits: number; enabled: boolean }[]; budget: { live: boolean; monthly_cap_micro: number; per_call_cap_micro: number } | null; credit_settings: { trial_credits?: number } | null; flags: { key: string; enabled: boolean }[]; plans: { key: string; name_en: string; price_kwd: number; monthly_credits: number }[]; step_up_ok: boolean }
export function OwnerCommerce() {
  const L = useL()
  const [cfg, setCfg] = useState<Cfg | null>(null), [err, setErr] = useState(''), [ev, setEv] = useState<{ at: string; event: string }[]>([]), [cost, setCost] = useState<Record<string, string>>({}), [reason, setReason] = useState('')
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('owner_get_commerce_config')
    if (error) { setErr(L('هذه الصفحة للمالك فقط.', 'Owner access only.')); return }
    setCfg(data as Cfg)
    const e = await supabase.rpc('owner_list_security_events', { p_limit: 10 }); setEv((e.data as typeof ev) ?? [])
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  async function saveCost(key: string, enabled: boolean) {
    const n = Number(cost[key]); if (!Number.isInteger(n) || n < 0) return
    const { error } = await supabase.rpc('owner_set_operation_cost', { p_key: key, p_credits: n, p_enabled: enabled })
    setErr(error ? (/step|mfa|aal/i.test(error.message) ? L('يتطلب تحققاً ثنائياً حديثاً.', 'Recent two-factor verification required.') : L('تعذر الحفظ.', 'Could not save.')) : ''); load()
  }
  async function flag(key: string, enabled: boolean) { const { error } = await supabase.rpc('owner_set_flag', { p_key: key, p_enabled: enabled }); setErr(error ? L('تعذر الحفظ.', 'Could not save.') : ''); load() }
  if (err && !cfg) return <Page title={L('لوحة المالك', 'Owner panel')}><p role="alert">{err}</p></Page>
  if (!cfg) return <Page title={L('لوحة المالك', 'Owner panel')}><p>…</p></Page>
  return (
    <Page title={L('لوحة المالك — التسعير والذكاء الاصطناعي', 'Owner — pricing & AI controls')}>
      {err && <p role="alert">{err}</p>}
      <p className="card soft muted small">{L('التحقق الثنائي الحديث:', 'Recent MFA step-up:')} {cfg.step_up_ok ? '✔' : '✖'} · {L('كل القيم مؤقتة.', 'All values provisional.')}</p>
      <section className="card" data-testid="owner-ops"><h2>{L('تكلفة العمليات (رصيد)', 'Operation costs (credits)')}</h2>
        {cfg.operations.map((o) => <div key={o.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><code>{o.key}</code>
          <input style={{ width: 90 }} inputMode="numeric" placeholder={String(o.credits)} value={cost[o.key] ?? ''} onChange={(e) => setCost({ ...cost, [o.key]: e.target.value })} aria-label={o.key} />
          <button className="outline" onClick={() => saveCost(o.key, o.enabled)}>{L('حفظ', 'Save')}</button></div>)}</section>
      <section className="card"><h2>{L('بوابة ميزانية الذكاء الاصطناعي', 'AI budget gate')}</h2>
        <p dir="ltr">live: {String(cfg.budget?.live)} · monthly cap (µ$): {cfg.budget?.monthly_cap_micro} · per call: {cfg.budget?.per_call_cap_micro}</p>
        <p className="muted small">{L('مغلقة افتراضياً؛ المزوّد الحقيقي لا يعمل بدون موافقة وميزانية.', 'Closed by default; no real provider without approval and budget.')}</p></section>
      <section className="card"><h2>{L('الباقات (مؤقتة)', 'Plans (provisional)')}</h2>
        <ul>{cfg.plans.map((p) => <li key={p.key} dir="ltr">{p.key} · {p.name_en} · {p.price_kwd} KWD · {p.monthly_credits} cr</li>)}</ul></section>
      <section className="card"><h2>{L('مفاتيح الميزات', 'Feature flags')}</h2>
        {cfg.flags.map((f) => <label key={f.key} style={{ display: 'flex', gap: 8 }}><input type="checkbox" checked={f.enabled} onChange={(e) => flag(f.key, e.target.checked)} />{f.key}</label>)}</section>
      <section className="card"><h2>{L('أحداث أمنية', 'Security events')}</h2>
        <ul>{ev.map((e, i) => <li key={i} dir="ltr">{e.at?.slice(0, 16)} · {e.event}</li>)}</ul>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={L('سبب (للإجراءات الحساسة)', 'Reason (for sensitive actions)')} /></section>
    </Page>
  )
}

