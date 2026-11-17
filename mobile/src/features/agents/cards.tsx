// Interactive cards rendered inside the chat (ported from the AI-agents reference; StyleSheet instead of NativeWind).
import { memo, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, Vibration, View } from 'react-native'
import { T } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import { c, fs, r } from '../../lib/theme'
import type { IngredientData, Macros, MealCardData, MuscleId, SupportTicketCardData, WorkoutCardData } from './types'

export const MUSCLE: Record<MuscleId, [string, string]> = {
  back: ['الظهر', 'Back'], chest: ['الصدر', 'Chest'], shoulders: ['الأكتاف', 'Shoulders'], biceps: ['البايسبس', 'Biceps'],
  triceps: ['الترايسبس', 'Triceps'], forearms: ['الساعدين', 'Forearms'], hips: ['الأرداف', 'Hips'], calf: ['السمانة', 'Calves'], abs: ['البطن', 'Abs'],
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const mmss = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(Math.floor(x % 60)).padStart(2, '0')}`

function Stat({ k, v, tint }: { k: string; v: string; tint?: string }) {
  return <View style={[st.stat, tint ? { backgroundColor: tint } : null]}><Text style={st.statV}>{v}</Text><Text style={st.statK}>{k}</Text></View>
}

export const WorkoutCard = memo(function WorkoutCard({ card, injuredArea, onOpenMuscleMap }: { card: WorkoutCardData; injuredArea?: string | null; onOpenMuscleMap?: (m: MuscleId) => void }) {
  const { L, lang } = useI18n()
  const m = (id: MuscleId) => MUSCLE[id]?.[lang === 'ar' ? 0 : 1] ?? id
  return (
    <View style={st.card} testID="workout-card">
      <View style={st.rowBetween}>
        <View style={{ flex: 1 }}><T bold>{card.exercise_name_ar}</T><T muted size={fs.xs}>{card.exercise_name_en}</T></View>
        <Text style={{ fontSize: 20 }}>{card.environment === 'gym' ? '🏋️' : '🏠'}</Text>
      </View>
      {injuredArea ? <View style={st.warn}><T size={fs.xs} style={{ color: c.gold }}>⚠️ {L('التمرين مختار بدون ضغط على:', 'Chosen to avoid loading:')} {injuredArea}</T></View> : null}
      <Pressable testID="open-muscle-map" accessibilityRole="button" accessibilityLabel={L(`العضلة المستهدفة ${m(card.target_muscle)}، افتح خريطة الجسم`, `Target muscle ${m(card.target_muscle)}, open the body map`)} onPress={() => onOpenMuscleMap?.(card.target_muscle)} style={st.target}><Text style={st.targetText}>🔴 {L('الهدف', 'Target')}: {m(card.target_muscle)}</Text></Pressable>
      {card.secondary_muscles.length > 0 ? <T muted size={fs.xs}>{L('يشتغل معها', 'Also works')}: {card.secondary_muscles.map(m).join(lang === 'ar' ? '، ' : ', ')}</T> : null}
      <View style={st.stats}>
        <Stat k={L('مجموعات', 'Sets')} v={String(card.sets)} /><Stat k={L('تكرارات', 'Reps')} v={card.reps} /><Stat k={L('راحة', 'Rest')} v={`${card.rest_seconds}s`} />
      </View>
      <T muted size={fs.xs}>🧰 {card.equipment}</T>
      <T bold size={fs.sm}>{L('نقاط الوضعية', 'Form cues')}</T>
      {card.posture_cues.map((cue, i) => <T key={i} size={fs.sm}>✅ {cue}</T>)}
      {card.alternative ? <View style={st.alt}><T bold size={fs.xs}>🔄 {L('بديل', 'Alternative')}: {card.alternative.name_ar}</T><T muted size={fs.xs}>{card.alternative.reason_ar}</T></View> : null}
    </View>
  )
})

function MacroRow({ m, label }: { m: Macros; label: string }) {
  const { L } = useI18n()
  return (
    <View style={{ gap: 4 }}>
      <T muted size={fs.xs}>{label}</T>
      <View style={st.stats}>
        <Stat tint={c.accentSoft} k={L('سعرات', 'kcal')} v={fmt(m.calories)} /><Stat tint={c.accentSoft} k={L('بروتين', 'Protein')} v={`${fmt(m.protein_g)}g`} />
        <Stat tint={c.accentSoft} k={L('كارب', 'Carbs')} v={`${fmt(m.carbs_g)}g`} /><Stat tint={c.accentSoft} k={L('دهون', 'Fat')} v={`${fmt(m.fat_g)}g`} />
      </View>
    </View>
  )
}

function StepTimer({ seconds }: { seconds: number }) {
  const { L } = useI18n()
  const [left, setLeft] = useState(seconds), [running, setRunning] = useState(false)
  const endAt = useRef(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const l = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000))
      setLeft(l)
      if (l === 0) { clearInterval(id); setRunning(false); Vibration.vibrate([0, 400, 200, 400]) }
    }, 250)
    return () => clearInterval(id)
  }, [running])
  const toggle = () => {
    if (running) { setRunning(false); return }
    const from = left === 0 ? seconds : left
    endAt.current = Date.now() + from * 1000; setLeft(from); setRunning(true)
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={L('مؤقت الخطوة', 'Step timer')} onPress={toggle} style={[st.timer, left === 0 && { backgroundColor: c.nutritionist }]}>
      <Text style={{ color: c.text, fontSize: fs.xs, fontWeight: '700' }}>{left === 0 ? `✅ ${L('خلص الوقت', 'Done')}` : `⏱ ${mmss(left)} · ${running ? L('إيقاف', 'Pause') : L('ابدأ', 'Start')}`}</Text>
    </Pressable>
  )
}

export const MealCard = memo(function MealCard({ card, onMissingIngredient }: { card: MealCardData; onMissingIngredient?: (ing: IngredientData, card: MealCardData) => void }) {
  const { L } = useI18n()
  const [done, setDone] = useState<Record<number, boolean>>({})
  const [subs, setSubs] = useState(Boolean(card.macros_with_substitutes))
  const macros = subs && card.macros_with_substitutes ? card.macros_with_substitutes : card.macros_per_serving
  return (
    <View style={st.card} testID="meal-card">
      <T bold>{card.meal_name_ar}</T>
      <T muted size={fs.xs}>{card.meal_name_en} · {card.servings} {L('حصص', 'servings')} · {L('تحضير', 'prep')} {card.prep_minutes}m · {L('طبخ', 'cook')} {card.cook_minutes}m</T>
      <MacroRow m={macros} label={subs && card.macros_with_substitutes ? L('الماكروز للحصة (مع البدائل)', 'Macros per serving (with substitutes)') : L('الماكروز للحصة (تقديري)', 'Macros per serving (estimate)')} />
      {card.macros_with_substitutes ? <Pressable accessibilityRole="button" onPress={() => setSubs((v) => !v)}><T size={fs.xs} style={{ color: c.accent }}>{subs ? L('عرض الوصفة الأصلية', 'Show original recipe') : L('عرض الماكروز مع البدائل', 'Show macros with substitutes')}</T></Pressable> : null}
      <T bold size={fs.sm}>{L('المكونات', 'Ingredients')}</T>
      {card.ingredients.map((ing, i) => (
        <View key={i} style={st.ing}>
          <View style={st.rowBetween}>
            <View style={{ flex: 1 }}><T bold size={fs.sm}>{ing.name_ar}</T><T muted size={fs.xs}>{fmt(ing.grams)} g · {ing.household_unit}</T></View>
            {onMissingIngredient ? <Pressable accessibilityRole="button" onPress={() => onMissingIngredient(ing, card)} style={st.missing}><Text style={{ color: c.gold, fontSize: fs.xs, fontWeight: '700' }}>{L('غير متوفر؟', 'Not available?')}</Text></Pressable> : null}
          </View>
          {ing.substitute ? <View style={st.alt}><T bold size={fs.xs}>🔁 {L('البديل', 'Substitute')}: {ing.substitute.name_ar} — {fmt(ing.substitute.grams)} g ({ing.substitute.household_unit})</T><T muted size={fs.xs}>🛒 {ing.substitute.store_hint}</T></View> : null}
        </View>
      ))}
      <View style={st.rowBetween}><T bold size={fs.sm}>{L('وضع الطبخ', 'Cooking mode')}</T><T muted size={fs.xs}>{Object.values(done).filter(Boolean).length}/{card.steps.length}</T></View>
      {card.steps.map((step, i) => {
        const checked = Boolean(done[i])
        return (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setDone((d) => ({ ...d, [i]: !d[i] }))} style={[st.check, checked && { backgroundColor: c.nutritionist, borderColor: c.nutritionist }]}>
              {checked ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <T size={fs.sm} style={checked ? { color: c.muted, textDecorationLine: 'line-through' } : undefined}>{i + 1}. {step.text_ar}</T>
              {step.timer_seconds ? <StepTimer seconds={step.timer_seconds} /> : null}
            </View>
          </View>
        )
      })}
    </View>
  )
})

export const SupportTicketCard = memo(function SupportTicketCard({ card }: { card: SupportTicketCardData }) {
  const { L } = useI18n()
  const cat: Record<string, string> = { billing: L('الفواتير والدفع', 'Billing'), technical: L('مشكلة تقنية', 'Technical'), device_limit: L('حد الأجهزة', 'Device limit'), renewal: L('التجديد', 'Renewal'), other: L('أخرى', 'Other') }
  const stt: Record<string, string> = { open: L('مفتوحة', 'Open'), in_progress: L('قيد المعالجة', 'In progress'), resolved: L('تم الحل', 'Resolved'), closed: L('مغلقة', 'Closed') }
  return (
    <View style={[st.card, { borderColor: c.support }]} testID="ticket-card">
      <View style={st.rowBetween}><T bold size={fs.sm}>🎫 {L('تذكرة دعم', 'Support ticket')}</T><View style={st.status}><Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{stt[card.status] ?? card.status}</Text></View></View>
      <Text selectable style={{ color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: 2 }}>{card.ticket_ref}</Text>
      <T muted size={fs.xs}>{cat[card.category] ?? card.category} · {L('أولوية', 'Priority')} {card.priority === 'high' ? L('عاجلة', 'high') : L('عادية', 'normal')}</T>
      <T size={fs.sm}>{card.summary}</T><T size={fs.sm}>{card.message_ar}</T><T muted size={fs.xs}>{card.retention_note_ar}</T>
    </View>
  )
})

const st = StyleSheet.create({
  card: { marginTop: 8, backgroundColor: c.surface2, borderColor: c.line, borderWidth: 1, borderRadius: r.md, padding: 14, gap: 8, alignSelf: 'stretch' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, alignItems: 'center', borderRadius: r.sm, backgroundColor: c.bg2, paddingVertical: 8 },
  statV: { color: c.text, fontWeight: '700', fontSize: fs.md }, statK: { color: c.muted, fontSize: 11 },
  target: { alignSelf: 'flex-start', backgroundColor: c.coach, borderRadius: r.pill, paddingHorizontal: 12, paddingVertical: 6 },
  targetText: { color: '#fff', fontSize: fs.xs, fontWeight: '700' },
  warn: { backgroundColor: c.goldSoft, borderRadius: r.sm, padding: 8 },
  alt: { backgroundColor: c.bg2, borderRadius: r.sm, padding: 10, gap: 2 },
  ing: { borderColor: c.line, borderWidth: 1, borderRadius: r.sm, padding: 10, gap: 8 },
  missing: { backgroundColor: c.goldSoft, borderRadius: r.pill, paddingHorizontal: 12, paddingVertical: 8 },
  timer: { alignSelf: 'flex-start', backgroundColor: c.line, borderRadius: r.pill, paddingHorizontal: 12, paddingVertical: 6 },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: c.line2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  status: { backgroundColor: c.support, borderRadius: r.pill, paddingHorizontal: 10, paddingVertical: 4 },
})
