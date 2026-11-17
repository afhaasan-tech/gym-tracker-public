// Plans and the member's subscription. Prices come from the database and are provisional.
// Checkout is NOT enabled: no payment is started from this screen until the subscription payment flow is approved and tested.
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, ErrorText, H2, Loading, Note, T, s } from '../components/ui'
import { refreshAccess, useAccess } from '../lib/access'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { c, fs } from '../lib/theme'

type Plan = { key: string; name_ar: string; name_en: string; price_kwd: number; monthly_credits: number | null; pause_eligible: boolean; includes_nutrition?: boolean }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB')

export default function Store() {
  const { L, rtl } = useI18n()
  const { access, loaded } = useAccess()
  const [plans, setPlans] = useState<Plan[] | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => { supabase.rpc('public_plans').then(({ data }) => setPlans((data as Plan[] | null) ?? [])) }, [])
  async function cancelRenewal() {
    setBusy(true); setMsg('')
    const { error } = await supabase.rpc('cancel_auto_renewal')
    setBusy(false)
    if (error) setMsg(L('ما قدرنا نلغي التجديد. جرّب مرة ثانية.', 'We could not cancel the renewal. Try again.')); else refreshAccess()
  }
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad}>
      {loaded && access?.tier === 'subscriber' ? (
        <Card testID="my-subscription">
          <H2>{L('اشتراكك', 'Your subscription')}</H2>
          <T>{L('الباقة', 'Plan')}: {access.plan_key} · {L('تنتهي', 'ends')} {access.period_end ? day(access.period_end) : '—'}</T>
          <T muted size={fs.sm}>{L('التجديد التلقائي', 'Auto-renewal')}: {access.auto_renew ? L('مفعّل', 'on') : L('متوقف', 'off')}</T>
          {access.auto_renew ? <Button testID="cancel-renewal" variant="outline" busy={busy} label={L('إلغاء التجديد التلقائي', 'Cancel auto-renewal')} onPress={cancelRenewal} /> : <T muted size={fs.sm}>{L('باقتك تبقى شغالة لين نهاية الفترة.', 'Your plan stays active until the end of the period.')}</T>}
          {msg ? <ErrorText>{msg}</ErrorText> : null}
        </Card>
      ) : null}
      <Note>{L('الأسعار والحدود مؤقتة وقابلة للتعديل. الدفع والاشتراك غير مفعّلين حالياً.', 'Prices and limits are provisional. Checkout and subscriptions are not enabled yet.')}</Note>
      {plans === null ? <Loading /> : plans.map((p) => (
        <Card key={p.key} testID="plan-card">
          <H2>{L(p.name_ar, p.name_en)}</H2>
          <T bold size={fs.xl} style={{ color: c.accent }}>{Number(p.price_kwd).toFixed(3)} KWD <T muted size={fs.sm}>/ {L('شهر', 'month')}</T></T>
          <View style={{ gap: 2 }}>
            <T size={fs.sm}>• {L('مدربك الشخصي بالذكاء الاصطناعي', 'Your AI personal trainer')}</T>
            <T size={fs.sm}>• {p.monthly_credits ? `${new Intl.NumberFormat('en-US').format(p.monthly_credits)} ${L('رصيد شهرياً', 'credits / month')}` : L('استخدام عادل (حدود قابلة للتعديل)', 'Fair use (configurable limits)')}</T>
            <T size={fs.sm}>• {p.includes_nutrition ? L('يشمل إرشاد التغذية', 'Includes nutrition guidance') : L('بدون إرشاد التغذية', 'No nutrition guidance')}</T>
            <T size={fs.sm}>• {p.pause_eligible ? L('إيقاف مؤقت حتى 14 يوماً', 'Pause up to 14 days') : L('بدون إيقاف مؤقت', 'No pause')}</T>
          </View>
          <Button variant="outline" disabled label={L('الدفع غير متاح حالياً', 'Checkout not available yet')} />
        </Card>
      ))}
    </ScrollView>
  )
}
