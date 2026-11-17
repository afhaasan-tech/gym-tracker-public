// Workouts: pick a muscle on the body map → free muscle basics for everyone; the advanced exercise library (set counter,
// rest timer, full details) for subscribers, read from the server. VORA's existing workout log is the second segment.
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Speech from 'expo-speech'
import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { MuscleSelector } from '../../components/BodyMap'
import { Button, Card, Chip, H1, H2, Loading, Screen, T, s } from '../../components/ui'
import { MUSCLE } from '../../features/trainer/cards'
import type { MuscleId } from '../../features/trainer/types'
import { WorkoutLog } from '../../features/WorkoutLog'
import { useAccess } from '../../lib/access'
import { useI18n } from '../../lib/i18n'
import { useMuscles, usePremiumExercises, type LibExercise, type Muscle } from '../../lib/library'
import { useTrainingEnv } from '../../lib/prefs'
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

const DIFF: Record<LibExercise['difficulty'], [string, string]> = { beginner: ['مبتدئ', 'Beginner'], intermediate: ['متوسط', 'Intermediate'], advanced: ['متقدم', 'Advanced'] }

function Lines({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return <View style={{ gap: 2 }}><T bold size={fs.sm}>{title}</T>{items.map((x, i) => <T key={i} size={fs.sm}>• {x}</T>)}</View>
}

/** One record of the advanced library (subscribers only): summary, set counter + rest timer, and the full details on demand. */
function ExerciseCard({ ex, names, onSwap }: { ex: LibExercise; names: Record<string, string>; onSwap: (e: LibExercise) => void }) {
  const { L, lang } = useI18n()
  const ar = lang === 'ar'
  const [done, setDone] = useState(0), [resting, setResting] = useState(false), [open, setOpen] = useState(false)
  const finished = done >= ex.default_sets
  const alts = ex.alternatives.map((id) => names[id]).filter(Boolean)
  return (
    <Card testID="exercise-card">
      <T bold size={fs.lg}>{ar ? ex.name_ar : ex.name_en}</T>
      <T muted size={fs.sm}>{ex.default_sets} {L('مجموعات', 'sets')} × {ex.default_reps} · {ar ? ex.equipment_ar : ex.equipment_en} · {DIFF[ex.difficulty][ar ? 0 : 1]}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <T bold size={fs.sm} testID="set-progress">{finished ? L('✅ خلصت التمرين', '✅ Exercise done') : L(`المجموعة ${done + 1} من ${ex.default_sets}`, `Set ${done + 1} of ${ex.default_sets}`)}</T>
        {!finished && !resting ? <Button testID="set-done" label={L('خلّصت مجموعة', 'Set done')} onPress={() => { const n = done + 1; setDone(n); if (n < ex.default_sets) setResting(true) }} /> : null}
      </View>
      {resting ? <RestTimer seconds={ex.rest_seconds} onDone={() => setResting(false)} /> : null}
      <Button testID="exercise-details" variant="outline" label={open ? L('إخفاء التفاصيل', 'Hide details') : L('طريقة الأداء والتفاصيل', 'How to do it & details')} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={{ gap: 10 }} testID="exercise-detail-body">
          <Lines title={L('طريقة الأداء', 'How to do it')} items={ar ? ex.instructions_ar : ex.instructions_en} />
          <Lines title={L('نقاط التكنيك', 'Technique cues')} items={ar ? ex.cues_ar : ex.cues_en} />
          <Lines title={L('أخطاء شائعة', 'Common mistakes')} items={ar ? ex.mistakes_ar : ex.mistakes_en} />
          <View style={{ gap: 2 }}><T bold size={fs.sm}>⚠️ {L('السلامة', 'Safety')}</T><T size={fs.sm}>{ar ? ex.safety_ar : ex.safety_en}</T></View>
          {alts.length > 0 ? <Lines title={L('بدائل', 'Alternatives')} items={alts} /> : null}
          {ex.sources.length > 0 ? (
            <View style={{ gap: 2 }} testID="exercise-sources">
              <T bold size={fs.xs}>{L('مراجع للاستزادة', 'References for further reading')}</T>
              {ex.sources.map((x, i) => <T key={i} muted size={fs.xs}>{x.org} — {x.title}{x.year ? ` (${x.year})` : ''}</T>)}
              <T muted size={fs.xs}>{ex.review_status === 'reviewed' ? '' : L('المحتوى تعليمي عام ولسا ما راجعه مختص، ومو بديل عن مدرب أو طبيب. المراجع مو تأييد رسمي من هالجهات.', 'General educational content, not yet reviewed by a professional, and not a substitute for a coach or doctor. References do not imply endorsement.')}</T>
            </View>
          ) : null}
        </View>
      ) : null}
      <Button testID="swap" variant="outline" label={L('🔄 الجهاز مشغول؟ اسأل المدرب', '🔄 Machine busy? Ask the coach')} onPress={() => onSwap(ex)} />
    </Card>
  )
}

/** Free for everyone: beginner-friendly facts about the selected muscle. */
function MuscleInfo({ m }: { m: Muscle }) {
  const { L, lang } = useI18n()
  const ar = lang === 'ar'
  return (
    <Card testID="muscle-info">
      <T bold size={fs.lg}>{ar ? m.name_ar : m.name_en} <T muted size={fs.sm}>· {ar ? m.name_en : m.name_ar}</T></T>
      <T size={fs.sm}><T bold size={fs.sm}>{L('وين مكانها: ', 'Where it is: ')}</T>{ar ? m.location_ar : m.location_en}</T>
      <T size={fs.sm}><T bold size={fs.sm}>{L('شنو تسوي: ', 'What it does: ')}</T>{ar ? m.function_ar : m.function_en}</T>
      <T muted size={fs.sm}>{ar ? m.summary_ar : m.summary_en}</T>
    </Card>
  )
}

/** Shown to free and coin-only members instead of the library. States what Premium contains; shows no premium content. */
function LibraryPreview({ muscleName }: { muscleName: string }) {
  const { L } = useI18n()
  const router = useRouter()
  return (
    <Card testID="library-preview" style={{ borderColor: c.accent, borderWidth: 1 }}>
      <T bold>⭐ {L(`مكتبة تمارين ${muscleName} المتقدمة`, `Advanced ${muscleName} exercise library`)}</T>
      <T muted size={fs.sm}>{L('للمشتركين (شهري أو سنوي): تمارين للنادي والبيت مع خطوات الأداء، نقاط التكنيك، الأخطاء الشائعة، السلامة والبدائل — والمدرب يختار لك منها حسب هدفك ومستواك.', 'For subscribers (monthly or yearly): gym and home exercises with steps, technique cues, common mistakes, safety and alternatives — and the trainer picks from it for your goal and level.')}</T>
      <Button testID="library-upgrade" label={L('خلّ VORA يصمّم تمرينك', 'Let VORA design your workout')} onPress={() => router.push('/premium')} />
      <Button testID="library-ask" variant="outline" label={L('اسأل المدرب سؤال سريع', 'Ask the trainer a quick question')} onPress={() => router.push('/coach')} />
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
  const { access } = useAccess()
  const subscriber = access?.tier === 'subscriber'
  const { muscles, failed: musclesFailed } = useMuscles()
  const { list, failed } = usePremiumExercises(muscle, env, subscriber)
  useEffect(() => { if (params.muscle && params.muscle in MUSCLE) { setMuscle(params.muscle as MuscleId); setTab('train') } }, [params.muscle])
  const name = MUSCLE[muscle][lang === 'ar' ? 0 : 1]
  const info = muscles?.find((m) => m.id === muscle)
  const names: Record<string, string> = Object.fromEntries((list ?? []).map((e) => [e.id, lang === 'ar' ? e.name_ar : e.name_en]))
  const swap = (ex: LibExercise) => router.push({ pathname: '/coach', params: { msg: L(`الجهاز أو التمرين «${ex.name_ar}» مو متاح، عطني تمرين بديل لعضلة ${MUSCLE[ex.primary_muscle][0]}${env === 'home' ? ' بدون أدوات' : ''}`, `The machine or exercise "${ex.name_en}" is not available, give me an alternative for ${MUSCLE[ex.primary_muscle][1]}${env === 'home' ? ' without equipment' : ''}`) } })
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
            {info ? <MuscleInfo m={info} /> : musclesFailed ? <T muted>{L('معلومات العضلة غير متاحة حالياً.', 'Muscle information is not available right now.')}</T> : <Loading />}
            {!access ? null : !subscriber ? <LibraryPreview muscleName={name} /> : (
              <>
                <H2>{L(`تمارين ${name}`, `${name} exercises`)}</H2>
                {failed ? <T muted>{L('ما قدرنا نحمّل المكتبة. تأكد إن جهازك موثّق وجرّب مرة ثانية.', 'We could not load the library. Check that this device is verified and try again.')}</T>
                  : list === null ? <Loading />
                  : list.length === 0 ? <T muted>{L('ما في تمارين مناسبة لهذا الوضع. جرّب تبدّل المكان.', 'No suitable exercises for this setting. Try switching place.')}</T>
                  : list.map((ex) => <ExerciseCard key={ex.id + env} ex={ex} names={names} onSwap={swap} />)}
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  )
}
