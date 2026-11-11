import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ageFromDob } from './age'
import { t } from './i18n'

type ProfileRow = {
  full_name: string | null
  date_of_birth: string | null
  height_cm: number | null
  weight_kg: number | null
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Returns an Arabic error message, or null when the values are acceptable. Empty optional fields are fine. */
function validate(name: string, dob: string, height: string, weight: string): string | null {
  if (name.trim().length > 80) return t("الاسم طويل واجد (80 حرف كحد أقصى).")
  if (dob) {
    if (dob < '1900-01-01' || dob > todayIso()) return t("تاريخ الميلاد مب منطقي. اختر تاريخ من الماضي.")
  }
  if (height) {
    const h = Number(height)
    if (!Number.isFinite(h) || h < 50 || h > 260) return t("الطول لازم يكون بين 50 و260 سم.")
  }
  if (weight) {
    const w = Number(weight)
    if (!Number.isFinite(w) || w < 20 || w > 400) return t("الوزن لازم يكون بين 20 و400 كجم.")
  }
  return null
}

/** «حسابي»: personal details saved in public.profiles (one row per user, protected by RLS) so they load on any device. */
export default function ProfileView({ session }: { session: Session }) {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    let active = true
    supabase.from('profiles').select('full_name,date_of_birth,height_cm,weight_kg').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setMsg({ ok: false, text: t("تعذر تحميل بياناتك. حدّث الصفحة وجرّب مرة ثانية.") })
        else if (data) {
          const p = data as ProfileRow
          setName(p.full_name ?? ''); setDob(p.date_of_birth ?? '')
          setHeight(p.height_cm == null ? '' : String(p.height_cm)); setWeight(p.weight_kg == null ? '' : String(p.weight_kg))
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [session.user.id])

  async function save(e: FormEvent) {
    e.preventDefault()
    setMsg(null)
    const problem = validate(name, dob, height, weight)
    if (problem) { setMsg({ ok: false, text: problem }); return }
    setBusy(true)
    const { error } = await supabase.from('profiles').upsert({
      user_id: session.user.id,
      full_name: name.trim() || null,
      date_of_birth: dob || null,
      height_cm: height ? Number(height) : null,
      weight_kg: weight ? Number(weight) : null,
    }, { onConflict: 'user_id' })
    if (error) setMsg({ ok: false, text: t("تعذر حفظ بياناتك. تأكد من القيم وجرّب مرة ثانية.") })
    else {
      // Keep the name shown in the top bar in sync (stored in Auth metadata too; failure here is harmless).
      await supabase.auth.updateUser({ data: { display_name: name.trim() } })
      setMsg({ ok: true, text: t("تم حفظ بياناتك بنجاح ✓") })
    }
    setBusy(false)
  }

  const age = dob ? ageFromDob(dob) : null

  return (
    <main className="screen">
      <div className="page-title">
        <span className="eyebrow">{t("حسابي")}</span>
        <h1>{name.trim() || t("حسابي")}</h1>
      </div>
      <form className="card" onSubmit={save} style={{ maxWidth: 560 }} aria-busy={loading}>
        <label>{t("الاسم الكامل")} <input maxLength={80} value={name} disabled={loading} onChange={(e) => setName(e.target.value)} placeholder={t("مثال: فهد العتيبي")} autoComplete="name" />
        </label>
        <label>{t("الإيميل")} <input type="email" dir="ltr" value={session.user.email ?? ''} readOnly aria-readonly="true" />
        </label>
        <label>{t("تاريخ الميلاد (اختياري)")} <input type="date" dir="ltr" min="1900-01-01" max={todayIso()} value={dob} disabled={loading} onChange={(e) => setDob(e.target.value)} />
        </label>
        <p className="muted small" aria-live="polite">{t("العمر:")} {age == null ? '—' : t("{0} سنة", [age])} {t("(يُحسب تلقائياً من تاريخ الميلاد)")}</p>
        <div className="grid3" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <label>{t("الطول (سم) (اختياري)")} <input type="number" dir="ltr" inputMode="decimal" min={50} max={260} step="0.1" value={height} disabled={loading} onChange={(e) => setHeight(e.target.value)} placeholder="175" />
          </label>
          <label>{t("الوزن (كجم) (اختياري)")} <input type="number" dir="ltr" inputMode="decimal" min={20} max={400} step="0.1" value={weight} disabled={loading} onChange={(e) => setWeight(e.target.value)} placeholder="75" />
          </label>
        </div>
        <p className="muted small">{t("بياناتك محفوظة في حسابك على Supabase ومحمية بحيث ما يشوفها غيرك، وتظهر لك على أي جهاز تسجّل منه.")}</p>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'info' : 'error'}>{msg.text}</p>}
        <button className="primary" disabled={busy || loading}>{busy ? t("يحفظ…") : t("احفظ التغييرات")}</button>
      </form>
    </main>
  )
}
