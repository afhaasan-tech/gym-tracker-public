// Workouts: pick a muscle on the body map → exercises with a set counter and rest timer (reference flow),
// plus VORA's existing workout log (table `workouts`) under the second segment.
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Speech from 'expo-speech'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { MuscleSelector } from '../../components/BodyMap'
import { Button, Card, Chip, H1, H2, Screen, T, s } from '../../components/ui'
import { exercisesFor, type Exercise } from '../../data/exercises'
import { MUSCLE } from '../../features/trainer/cards'
import type { MuscleId } from '../../features/trainer/types'
import { WorkoutLog } from '../../features/WorkoutLog'
import { useI18n } from '../../lib/i18n'
import { useTrainingEnv } from '../../lib/prefs'
import { supabase } from '../../lib/supabase'
import { c, fs, r } from '../../lib/theme'

const mmss = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const { L, lang } = useI18n()
  const [left, setLeft] = useState(seconds)
  const fired = useRef(false)
  useEffect(() => { const id = setInterval(() => setLeft((l) => l - 1), 1000); return () => clearInterval(id) }, [])
  useEffect(() => {
    if (left <= 0 && !fired.current) { fired.current = true; Speech.speak(L('يلا نكمل', "Let's go"), { language: lang === 'ar' ? 'ar-SA' : 'en-US' }); onDone() }
  }, [left, onDone, L, lang])
  return (
    <View accessibilityLiveRegion="polite" style={{ alignItems: 'center', borderRadius: r.sm, backgroundColor: c.bg2, padding: 12, gap: 4 }}>
      <T muted size={fs.xs}>{L('راحة', 'Rest')}</T>
      <T bold size={30} style={{ lineHeight: 36 }}>{mmss(Math.max(left, 0))}</T>
      <Button variant="link" label={L('تخطي', 'Skip')} onPress={onDone} />
    </View>
  )
}

function ExerciseCard({ ex, onSwap }: { ex: Exercise; onSwap: (e: Exercise) => void }) {
  const { L } = useI18n()
  const [done, setDone] = useState(0), [resting, setResting] = useState(false)
  const finished = done >= ex.sets
  return (
    <Card testID="exercise-card">
      <T bold size={fs.lg}>{ex.name}</T>
      <T muted size={fs.sm}>{ex.sets} {L('مجموعات', 'sets')} × {ex.reps} · {ex.equipment}</T>
      <T size={fs.sm}>💡 {ex.tip}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <T bold size={fs.sm} testID="set-progress">{finished ? L('✅ خلصت التمرين', '✅ Exercise done') : L(`المجموعة ${done + 1} من ${ex.sets}`, `Set ${done + 1} of ${ex.sets}`)}</T>
        {!finished && !resting ? <Button testID="set-done" label={L('خلّصت مجموعة', 'Set done')} onPress={() => { const n = done + 1; setDone(n); if (n < ex.sets) setResting(true) }} /> : null}
      </View>
      {resting ? <RestTimer seconds={ex.rest} onDone={() => setResting(false)} /> : null}
      <Button testID="swap" variant="outline" label={L('🔄 الجهاز مشغول؟ اسأل المدرب', '🔄 Machine busy? Ask the coach')} onPress={() => onSwap(ex)} />
    </Card>
  )
}

export default function Workouts() {
  const { L, lang } = useI18n()
  const router = useRouter()
  const params = useLocalSearchParams<{ muscle?: string }>()
  const [tab, setTab] = useState<'train' | 'log'>('train')
  const [muscle, setMuscle] = useState<MuscleId>('chest')
  const [env, setEnv] = useTrainingEnv()
  const [beginner, setBeginner] = useState(false)
  useEffect(() => { supabase.from('member_preferences').select('experience').maybeSingle().then(({ data }) => setBeginner(data?.experience === 'beginner')) }, [])
  useEffect(() => { if (params.muscle && params.muscle in MUSCLE) { setMuscle(params.muscle as MuscleId); setTab('train') } }, [params.muscle])
  const list = exercisesFor(muscle, env, beginner)
  const name = MUSCLE[muscle][lang === 'ar' ? 0 : 1]
  const swap = (ex: Exercise) => router.push({ pathname: '/coach', params: { msg: L(`الجهاز أو التمرين «${ex.name}» مو متاح، عطني تمرين بديل لعضلة ${MUSCLE[ex.muscle][0]}${env === 'home' ? ' بدون أدوات' : ''}`, `The machine or exercise "${ex.name}" is not available, give me an alternative exercise for ${MUSCLE[ex.muscle][1]}${env === 'home' ? ' with no equipment' : ''}`), n: String(Date.now()) } })
  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <View style={s.row}>
          <Chip testID="seg-train" label={L('التمارين', 'Exercises')} on={tab === 'train'} onPress={() => setTab('train')} />
          <Chip testID="seg-log" label={L('سجلّي', 'My log')} on={tab === 'log'} onPress={() => setTab('log')} />
        </View>
        {tab === 'log' ? (<><H1>{L('سجل تماريني', 'My workout log')}</H1><WorkoutLog /></>) : (
          <>
            <H1>{L('اختر عضلتك', 'Pick your muscle')}</H1>
            <T muted>{L('اضغط على العضلة أو اخترها من الأزرار وبتتظلل بالأحمر.', 'Tap a muscle or pick it from the buttons; it is highlighted in red.')}</T>
            <View style={s.row}>
              <Chip testID="env-gym" label={L('🏋️ النادي', '🏋️ Gym')} on={env === 'gym'} onPress={() => setEnv('gym')} />
              <Chip testID="env-home" label={L('🏠 البيت بدون أدوات', '🏠 Home, no equipment')} on={env === 'home'} onPress={() => setEnv('home')} />
            </View>
            <MuscleSelector value={muscle} onChange={setMuscle} />
            <H2>{L(`تمارين ${name}`, `${name} exercises`)}</H2>
            {list.length === 0 ? <T muted>{L('ما في تمارين مناسبة لهذا الوضع. جرّب تبدّل المكان.', 'No suitable exercises for this setting. Try switching place.')}</T>
              : list.map((ex) => <ExerciseCard key={ex.id + env} ex={ex} onSwap={swap} />)}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
