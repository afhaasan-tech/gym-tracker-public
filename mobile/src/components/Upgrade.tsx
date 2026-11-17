// Invitation to VORA Premium shown after a useful free answer. It can always be dismissed, never blocks the answer,
// and never shows countdowns or pressure. The server decides WHEN it is relevant (`upgrade.reason`); the wording lives here.
import { useRouter } from 'expo-router'
import { View } from 'react-native'
import { Button, Card, T } from './ui'
import { useI18n } from '../lib/i18n'
import { c, fs } from '../lib/theme'

export type UpgradeReason = 'plan' | 'nutrition' | 'library' | 'personalised'

export function UpgradePrompt({ reason, onDismiss }: { reason: UpgradeReason; onDismiss: () => void }) {
  const { L } = useI18n()
  const router = useRouter()
  const text: Record<UpgradeReason, string> = {
    personalised: L('تبي تعرف أي تمرين يناسبك بالضبط؟ مدرب VORA يقدر يختار لك التمارين حسب هدفك، مستواك، والمعدات المتوفرة عندك.', 'Want to know exactly which exercise suits you? The VORA trainer can pick exercises for your goal, your level and the equipment you have.'),
    library: L('مع VORA Premium تفتح لك مكتبة التمارين المتقدمة: خطوات الأداء، الأخطاء الشائعة، البدائل، ونصايح السلامة لكل تمرين.', 'VORA Premium opens the advanced exercise library: steps, common mistakes, alternatives and safety notes for every exercise.'),
    plan: L('مدرب VORA يصمّم لك برنامج تمرين كامل حسب هدفك ووقتك ومكان تمرينك، ويعدّله وياك أسبوع بأسبوع.', 'The VORA trainer builds a full training plan for your goal, schedule and place, and adjusts it with you week by week.'),
    nutrition: L('مع VORA Premium المدرب يساعدك بالأكل المناسب لتمرينك وهدفك.', 'With VORA Premium the trainer also helps with food that fits your training and goal.'),
  }
  return (
    <Card testID="upgrade-prompt" style={{ marginTop: 8, borderColor: c.accent, borderWidth: 1 }}>
      <T bold size={fs.sm} style={{ color: c.accent }}>⭐ VORA Premium</T>
      <T size={fs.sm}>{text[reason]}</T>
      <Button testID="upgrade-cta" label={L('خلّ VORA يصمّم تمرينك', 'Let VORA design your workout')} onPress={() => router.push('/premium')} />
      <View style={{ alignItems: 'center' }}><Button testID="upgrade-dismiss" variant="link" label={L('مو الحين', 'Not now')} onPress={onDismiss} /></View>
    </Card>
  )
}
