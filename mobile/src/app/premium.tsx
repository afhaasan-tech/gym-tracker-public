// VORA Premium preview: what the subscription really adds, with the monthly and yearly options read from the server.
// No personal analysis is shown here (nothing has been collected yet), no countdowns, and the screen can simply be closed.
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, H1, H2, Loading, Note, T, s } from '../components/ui'
import { useAccess } from '../lib/access'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { c, fs } from '../lib/theme'

type Plan = { key: string; name_ar: string; name_en: string; price_kwd: number; period_days?: number }

export default function Premium() {
  const { L, rtl } = useI18n()
  const router = useRouter()
  const { access } = useAccess()
  const [plans, setPlans] = useState<Plan[] | null>(null)
  useEffect(() => { supabase.rpc('public_plans').then(({ data }) => setPlans((data as Plan[] | null) ?? [])) }, [])
  const items: [string, string, string][] = [
    ['🎯', L('برنامج على مقاسك', 'A plan that fits you'), L('المدرب يسألك عن هدفك، مستواك، وقتك ومعداتك، وبعدها يبني برنامجك.', 'The trainer asks about your goal, level, time and equipment, then builds your plan.')],
    ['📚', L('مكتبة التمارين المتقدمة', 'Advanced exercise library'), L('لكل تمرين: خطوات الأداء، نقاط التكنيك، الأخطاء الشائعة، السلامة والبدائل للنادي والبيت.', 'For every exercise: steps, technique cues, common mistakes, safety and alternatives for gym and home.')],
    ['🔄', L('تعديل ومتابعة', 'Adjustments and follow-up'), L('الجهاز مشغول؟ التمرين صعب؟ المدرب يبدّل ويعدّل ويتابع تقدمك.', 'Machine busy? Exercise too hard? The trainer swaps, adjusts and follows your progress.')],
    ['🥗', L('أكل يخدم تمرينك', 'Food that supports training'), L('إرشاد تغذية مرتبط بهدفك ووصفات بمقادير واضحة.', 'Nutrition guidance tied to your goal, and recipes with clear quantities.')],
    ['🎙️', L('صوت وصورة وفيديو', 'Voice, photo and video'), L('كلّم مدربك بالصوت أو صوّر الجهاز واسأل عنه. وإذا ما قدر يحلل ملف، يقول لك بصراحة.', 'Talk to your trainer or photograph a machine and ask. If a file cannot be analysed, it says so plainly.')],
  ]
  const per = (p: Plan) => (Number(p.period_days ?? 30) >= 360 ? L('سنة', 'year') : L('شهر', 'month'))
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad}>
      <H1>{L('VORA Premium — مدربك الشخصي الكامل', 'VORA Premium — your complete personal trainer')}</H1>
      <T muted>{L('نفس جودة التدريب بالشهري والسنوي؛ الفرق بالمدة والسعر بس.', 'The same coaching quality on monthly and yearly; only the duration and price differ.')}</T>
      {items.map(([icon, title, body]) => (
        <Card key={title} testID="premium-benefit">
          <T bold>{icon} {title}</T>
          <T muted size={fs.sm}>{body}</T>
        </Card>
      ))}
      <H2>{L('اختر المدة', 'Choose a duration')}</H2>
      {plans === null ? <Loading /> : plans.length === 0 ? <T muted>{L('الباقات غير متاحة حالياً.', 'Plans are not available right now.')}</T> : (
        <View style={{ gap: 12 }}>
          {plans.map((p) => (
            <Card key={p.key} testID={`premium-plan-${p.key}`}>
              <T bold size={fs.lg}>{L(p.name_ar, p.name_en)}</T>
              <T bold size={fs.xl} style={{ color: c.accent }}>{Number(p.price_kwd).toFixed(3)} KWD <T muted size={fs.sm}>/ {per(p)}</T></T>
            </Card>
          ))}
        </View>
      )}
      <Note>{L('الأسعار مؤقتة. الدفع يدوي لكل مدة، وما في تجديد أو خصم تلقائي.', 'Prices are provisional. Each period is paid manually; there is no automatic renewal or charge.')}</Note>
      {access?.tier === 'subscriber' ? <T bold testID="premium-active">{L('اشتراكك مفعّل ✅', 'Your subscription is active ✅')}</T>
        : <Button testID="premium-go-store" label={L('كمّل للاشتراك', 'Continue to subscribe')} onPress={() => router.replace('/store')} />}
      <Button testID="premium-close" variant="link" label={L('رجوع', 'Back')} onPress={() => router.back()} />
    </ScrollView>
  )
}
