// Home: greeting, daily line, quick actions and a simple weekly plan (built locally — no AI credits used).
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, H1, H2, Screen, T, s } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import { useTrainingEnv } from '../../lib/prefs'
import { supabase } from '../../lib/supabase'

const QUOTES: [string, string][] = [
  ['يلا ابدأ بخطوة صغيرة اليوم، والنتيجة تجي مع الاستمرار 💪', 'Start with one small step today; results come with consistency 💪'],
  ['ما عليك من الناس، نافس نفسك أمس بس 🔥', "Never mind anyone else — just beat yesterday's you 🔥"],
  ['شوي شوي… المهم تستمر وما توقف 🌟', 'Slow and steady… what matters is that you keep going 🌟'],
  ['تمرين تخلصه أحسن من تمرين مثالي تأجله ✅', 'A workout you finish beats a perfect one you postpone ✅'],
  ['جسمك أمانة، وكل حركة اليوم استثمار بصحتك 🤍', 'Your body is a trust; every move today is an investment in your health 🤍'],
  ['أبشر بالخير! اشرب مويه وتحرك شوي الحين 💧', 'Good things ahead! Drink some water and move a little now 💧'],
  ['لا تقارن بدايتك بنهاية غيرك، كل واحد بدأ من مكان 🙌', "Don't compare your start to someone else's finish 🙌"],
]
const DAYS: [string, string][] = [['السبت', 'Sat'], ['الأحد', 'Sun'], ['الاثنين', 'Mon'], ['الثلاثاء', 'Tue'], ['الأربعاء', 'Wed'], ['الخميس', 'Thu'], ['الجمعة', 'Fri']]
const PLAN: Record<'gym' | 'home', [string, string][]> = {
  gym: [['صدر + ترايسبس', 'Chest + triceps'], ['ظهر + بايسبس', 'Back + biceps'], ['راحة نشطة (مشي 30 د)', 'Active rest (30 min walk)'], ['أرجل + أرداف', 'Legs + glutes'], ['أكتاف + بطن', 'Shoulders + abs'], ['راحة', 'Rest'], ['كارديو خفيف', 'Light cardio']],
  home: [['ضغط + ترايسبس', 'Push-ups + triceps'], ['سوبرمان + بطن', 'Superman + abs'], ['راحة نشطة (مشي 30 د)', 'Active rest (30 min walk)'], ['جسر الأرداف + سمانة', 'Glute bridge + calves'], ['أكتاف + بلانك', 'Shoulders + plank'], ['راحة', 'Rest'], ['كارديو خفيف', 'Light cardio']],
}

export default function Home() {
  const { L, lang } = useI18n()
  const router = useRouter()
  const [env] = useTrainingEnv()
  const [beginner, setBeginner] = useState(false)
  useEffect(() => { supabase.from('member_preferences').select('experience').maybeSingle().then(({ data }) => setBeginner(data?.experience === 'beginner')) }, [])
  const i = lang === 'ar' ? 0 : 1
  const quote = useMemo(() => QUOTES[new Date().getDate() % QUOTES.length][i], [i])
  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
        <H1>{L('هلا فيك 👋', 'Welcome 👋')}</H1>
        <Card><T>{quote}</T></Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Button testID="home-workout" style={{ flex: 1 }} label={L('💪 تمرين اليوم', "💪 Today's workout")} onPress={() => router.push('/workouts')} />
          <Button testID="home-recipe" style={{ flex: 1 }} variant="outline" label={L('🥗 التغذية', '🥗 Nutrition')} onPress={() => router.push('/nutrition')} />
        </View>
        <Button testID="home-coach" variant="outline" label={L('🤖 مدربي الشخصي', '🤖 My personal trainer')} onPress={() => router.push('/coach')} />
        <H2>{L('خطتك لأسبوع', 'Your week plan')}</H2>
        {DAYS.map((d, k) => (
          <Card key={d[0]} testID="plan-day" style={{ paddingVertical: 12 }}>
            <T><T bold>{d[i]}: </T>{beginner && k === 6 ? L('راحة', 'Rest') : PLAN[env][k][i]}</T>
          </Card>
        ))}
        <Button testID="home-store" variant="link" label={L('⭐ الباقات والأسعار', '⭐ Plans & pricing')} onPress={() => router.push('/store')} />
      </ScrollView>
    </Screen>
  )
}
