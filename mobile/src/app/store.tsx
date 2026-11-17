// Plans come from the database (public_plans). Display only: checkout stays disabled until the payment flow for subscriptions is approved.
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { Button, Card, H2, Loading, Note, T, s } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { c, fs } from '../lib/theme'

type Plan = { key: string; name_ar: string; name_en: string; price_kwd: number; monthly_credits: number | null; pause_eligible: boolean }

export default function Plans() {
  const { L, rtl } = useI18n()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  useEffect(() => { supabase.rpc('public_plans').then(({ data }) => setPlans((data as Plan[] | null) ?? [])) }, [])
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad}>
                <Note>{L('الأسعار والحدود مؤقتة وقابلة للتعديل. الدفع والاشتراك غير مفعّلين.', 'Prices and limits are provisional. Checkout and subscriptions are not enabled.')}</Note>
        {plans === null ? <Loading /> : plans.map((p) => (
          <Card key={p.key} testID="plan-card">
            <H2>{L(p.name_ar, p.name_en)}</H2>
            <T bold size={fs.xl} style={{ color: c.accent }}>{Number(p.price_kwd).toFixed(3)} KWD <T muted size={fs.sm}>/ {L('شهر', 'month')}</T></T>
            <T size={fs.sm}>• {p.monthly_credits ? `${new Intl.NumberFormat('en-US').format(p.monthly_credits)} ${L('رصيد شهرياً', 'credits / month')}` : L('استخدام عادل (حدود قابلة للتعديل)', 'Fair use (configurable limits)')}</T>
            <T size={fs.sm}>• {p.pause_eligible ? L('إيقاف مؤقت حتى 14 يوماً', 'Pause up to 14 days') : L('بدون إيقاف مؤقت', 'No pause')}</T>
            <Button variant="outline" disabled label={L('الدفع غير متاح', 'Checkout unavailable')} />
          </Card>
        ))}
    </ScrollView>
  )
}
