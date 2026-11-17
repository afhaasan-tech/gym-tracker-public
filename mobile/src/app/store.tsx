// Plans, VORA Coins packs and the member's subscription. Prices come from the database and are provisional.
// Paying happens on the hosted UPayments page; the result is confirmed by the server, never by this screen.
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Button, Card, ErrorText, H2, Loading, Note, T, s } from '../components/ui'
import { refreshAccess, useAccess } from '../lib/access'
import { useI18n } from '../lib/i18n'
import { checkoutAvailable, orderStatus, startCheckout, takePendingOrder, type OrderKind, type OrderStatus } from '../lib/purchase'
import { supabase } from '../lib/supabase'
import { c, fs } from '../lib/theme'

type Pack = { key: string; name_ar: string; name_en: string; coins: number; price_kwd: number }
type Plan = { key: string; name_ar: string; name_en: string; price_kwd: number; monthly_credits: number | null; pause_eligible: boolean; includes_nutrition?: boolean; period_days?: number; ai_daily_requests?: number | null; ai_daily_media?: number | null }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB')

export default function Store() {
  const { L, rtl } = useI18n()
  const { access, loaded } = useAccess()
  const [plans, setPlans] = useState<Plan[] | null>(null), [packs, setPacks] = useState<Pack[] | null>(null), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)
  const [buying, setBuying] = useState(''), [buyErr, setBuyErr] = useState(''), [order, setOrder] = useState<{ id: string; status: OrderStatus | null | 'checking' } | null>(null)
  useEffect(() => {
    supabase.rpc('public_plans').then(({ data }) => setPlans((data as Plan[] | null) ?? []))
    supabase.rpc('public_coin_packs').then(({ data }) => setPacks((data as Pack[] | null) ?? []))
  }, [])
  // After coming back from the checkout page: ask the server (which asks the payment provider) what happened.
  const check = useCallback(async (id: string) => {
    setOrder({ id, status: 'checking' })
    const status = await orderStatus(id)
    setOrder({ id, status }); if (status === 'paid') refreshAccess()
  }, [])
  useEffect(() => { const id = takePendingOrder(); if (id) void check(id) }, [check])
  useFocusEffect(useCallback(() => { if (order && order.status !== 'paid' && order.status !== 'checking') void check(order.id) }, [order, check]))
  async function buy(kind: OrderKind, key: string) {
    setBuying(kind + ':' + key); setBuyErr('')
    const r = await startCheckout(kind, key)
    setBuying('')
    if (r.error) setBuyErr(r.error === 'device_not_trusted' ? L('وثّق جهازك أول.', 'Verify this device first.') : L('ما قدرنا نفتح صفحة الدفع. جرّب مرة ثانية.', 'We could not open the payment page. Try again.'))
    else if (r.orderId) setOrder({ id: r.orderId, status: 'pending' })
  }
  const orderText = !order ? '' : order.status === 'checking' ? L('نتأكد من الدفع…', 'Checking the payment…')
    : order.status === 'paid' ? L('تم الدفع وتفعّل طلبك ✅', 'Payment confirmed and your order is active ✅')
    : order.status === 'pending' ? L('الدفع لسا ما تأكد. إذا دفعت، اضغط «تحقق» بعد لحظات.', 'The payment is not confirmed yet. If you paid, tap “Check” in a moment.')
    : order.status === null ? L('ما قدرنا نتأكد من الدفع الحين. جرّب «تحقق» مرة ثانية.', 'We could not verify the payment right now. Tap “Check” again.')
    : L('الدفع ما تم. ما انخصم منك شي، وتقدر تحاول مرة ثانية.', 'The payment did not go through. Nothing was activated; you can try again.')
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
      {order ? (
        <Card testID="order-result">
          <T bold testID="order-status">{orderText}</T>
          {order.status !== 'paid' && order.status !== 'checking' ? <Button testID="order-check" variant="outline" label={L('تحقق', 'Check')} onPress={() => { void check(order.id) }} /> : null}
        </Card>
      ) : null}
      <Note>{checkoutAvailable ? L('الأسعار مؤقتة وقابلة للتعديل. الدفع عبر صفحة UPayments الآمنة، والتجديد يدوي (ما في خصم تلقائي).', 'Prices are provisional. Payment is on the secure UPayments page, and renewal is manual (no automatic charge).')
        : L('الأسعار مؤقتة وقابلة للتعديل. الشراء غير متاح داخل هذا التطبيق.', 'Prices are provisional. Purchases are not available inside this app.')}</Note>
      {buyErr ? <ErrorText>{buyErr}</ErrorText> : null}
      <H2>{L('ڤورا كوينز', 'VORA Coins')}</H2>
      <T muted size={fs.sm}>{L('ادفع على قد استخدامك: كل رسالة للمدرب لها سعر يظهر لك قبل الخصم. الكوينز المشتراة ما تنتهي. الخطط الشخصية والتغذية مع الاشتراك فقط.', 'Pay as you go: each trainer request shows its price before charging. Purchased coins do not expire. Personal plans and nutrition come with a subscription only.')}</T>
      {packs === null ? <Loading /> : packs.map((p) => (
        <Card key={p.key} testID="pack-card">
          <H2>{L(p.name_ar, p.name_en)}</H2>
          <T bold size={fs.xl} style={{ color: c.accent }}>{Number(p.price_kwd).toFixed(3)} KWD</T>
          <T size={fs.sm}>• {new Intl.NumberFormat('en-US').format(p.coins)} {L('ڤورا كوينز', 'VORA Coins')}</T>
          {checkoutAvailable ? <Button testID={`buy-pack-${p.key}`} busy={buying === 'coins:' + p.key} disabled={Boolean(buying)} label={L('اشترِ', 'Buy')} onPress={() => { void buy('coins', p.key) }} /> : null}
        </Card>
      ))}
      <H2>{L('الباقات', 'Plans')}</H2>
      {plans === null ? <Loading /> : plans.map((p) => (
        <Card key={p.key} testID="plan-card">
          <H2>{L(p.name_ar, p.name_en)}</H2>
          <T bold size={fs.xl} style={{ color: c.accent }}>{Number(p.price_kwd).toFixed(3)} KWD <T muted size={fs.sm}>/ {Number(p.period_days ?? 30) >= 360 ? L('سنة', 'year') : L('شهر', 'month')}</T></T>
          <View style={{ gap: 2 }}>
            <T size={fs.sm}>• {L('مدربك الشخصي بالذكاء الاصطناعي', 'Your AI personal trainer')}</T>
            <T size={fs.sm}>• {p.monthly_credits ? `${new Intl.NumberFormat('en-US').format(p.monthly_credits)} ${L('ڤورا كوينز شهرياً', 'VORA Coins / month')}` : p.ai_daily_requests ? L(`المدرب مشمول: لين ${p.ai_daily_requests} طلب باليوم (حد مؤقت)`, `Trainer included: up to ${p.ai_daily_requests} requests a day (provisional cap)`) : L('استخدام عادل (حدود قابلة للتعديل)', 'Fair use (configurable limits)')}</T>
            <T size={fs.sm}>• {p.includes_nutrition ? L('يشمل إرشاد التغذية', 'Includes nutrition guidance') : L('بدون إرشاد التغذية', 'No nutrition guidance')}</T>
            <T size={fs.sm}>• {L('مكتبة التمارين المتقدمة والخطط الشخصية', 'Advanced exercise library and personal plans')}</T>
          </View>
          {checkoutAvailable ? <Button testID={`buy-plan-${p.key}`} busy={buying === 'subscription:' + p.key} disabled={Boolean(buying)} label={access?.tier === 'subscriber' && access.plan_key === p.key ? L(`جدّد ${p.period_days ?? 30} يوم`, `Renew ${p.period_days ?? 30} days`) : L(`اشترك ${p.period_days ?? 30} يوم`, `Subscribe for ${p.period_days ?? 30} days`)} onPress={() => { void buy('subscription', p.key) }} /> : null}
        </Card>
      ))}
    </ScrollView>
  )
}
