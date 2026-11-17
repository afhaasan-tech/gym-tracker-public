// Recipe detail: per-serving macros, ingredients with an optional substitute, steps with timers (reference flow).
import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import * as Speech from 'expo-speech'
import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Locked } from '../../components/Locked'
import { Button, Card, H1, H2, Loading, T, s } from '../../components/ui'
import { useAccess } from '../../lib/access'
import { getRecipe, perServing, whereToBuy } from '../../data/recipes'
import { useI18n } from '../../lib/i18n'
import { c, fs, r } from '../../lib/theme'

const mmss = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`

function StepTimer({ minutes }: { minutes: number }) {
  const { L } = useI18n()
  const [left, setLeft] = useState<number | null>(null)
  const said = useRef(false)
  useEffect(() => {
    if (left === null) return
    if (left <= 0) { if (!said.current) { said.current = true; Speech.speak(L('انتهى وقت الخطوة', 'Step time is up')) } return }
    const id = setTimeout(() => setLeft((l) => (l === null ? l : l - 1)), 1000)
    return () => clearTimeout(id)
  }, [left, L])
  if (left === null) return <Button variant="outline" label={L(`⏱ ابدأ المؤقت (${minutes} د)`, `⏱ Start timer (${minutes} min)`)} onPress={() => { said.current = false; setLeft(minutes * 60) }} />
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T bold size={24} style={{ lineHeight: 30 }}>{left <= 0 ? L('✅ خلص', '✅ Done') : mmss(left)}</T>
      <Button variant="link" label={left <= 0 ? L('إغلاق', 'Close') : L('إيقاف', 'Stop')} onPress={() => setLeft(null)} />
    </View>
  )
}

export default function RecipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { L, rtl } = useI18n()
  const router = useRouter()
  const recipe = getRecipe(String(id))
  const { access, loaded } = useAccess()
  const [swapped, setSwapped] = useState<Set<string>>(new Set()), [shown, setShown] = useState<Set<string>>(new Set()), [checked, setChecked] = useState<Set<number>>(new Set())
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => () => { void Speech.stop() }, [])
  if (!recipe) return <View style={[s.pad, { flex: 1, backgroundColor: c.bg }]}><T>{L('الوصفة غير موجودة.', 'Recipe not found.')}</T><Button label={L('رجوع', 'Back')} onPress={() => router.back()} /></View>
  if (!loaded) return <View style={{ flex: 1, backgroundColor: c.bg }}><Loading /></View>
  if (!(access?.tier === 'subscriber' && access.nutrition)) return <View style={[s.pad, { flex: 1, backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }]}><Locked title={L('التغذية للمشتركين', 'Nutrition is for subscribers')} body={L('هذي الوصفة ضمن الباقات اللي تشمل التغذية.', 'This recipe is part of plans that include nutrition.')} /></View>
  const m = perServing(recipe, swapped)
  const flip = <K,>(set: Set<K>, k: K) => { const n = new Set(set); if (n.has(k)) n.delete(k); else n.add(k); return n }
  const read = () => {
    if (speaking) { void Speech.stop(); setSpeaking(false); return }
    setSpeaking(true)
    Speech.speak(recipe.steps.map((st, i) => `الخطوة ${i + 1}. ${st.text}`).join(' '), { language: 'ar-SA', rate: 0.95, onDone: () => setSpeaking(false), onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) })
  }
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
      <Stack.Screen options={{ title: recipe.title }} />
      <H1>{recipe.emoji} {recipe.title}</H1>
      <T muted>{recipe.blurb}</T>
      <Card testID="macros">
        <T bold size={fs.sm}>{L(`لكل حصة (${recipe.serves} حصص) — تقديري`, `Per serving (${recipe.serves} servings) — estimate`)}</T>
        <T>{m.kcal} {L('سعرة', 'kcal')} · {L('بروتين', 'protein')} {m.p}g · {L('كارب', 'carbs')} {m.c}g · {L('دهون', 'fat')} {m.f}g</T>
        {swapped.size > 0 ? <T size={fs.xs} style={{ color: c.gold }}>{L('محسوبة مع البدائل اللي اخترتها.', 'Calculated with the substitutes you chose.')}</T> : null}
      </Card>
      <H2>{L('المقادير', 'Ingredients')}</H2>
      {recipe.ingredients.map((ing) => {
        const isSwapped = swapped.has(ing.id), open = shown.has(ing.id)
        return (
          <Card key={ing.id} style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <T style={{ flex: 1 }}>{isSwapped && ing.sub ? ing.sub.name : ing.name} — {ing.grams} g</T>
              {ing.sub ? <Pressable testID={`missing-${ing.id}`} accessibilityRole="button" onPress={() => setShown(flip(shown, ing.id))} style={{ minHeight: 40, justifyContent: 'center', borderRadius: r.pill, backgroundColor: c.goldSoft, paddingHorizontal: 12 }}><T bold size={fs.sm} style={{ color: c.gold }}>{L('غير متوفر؟', 'Not available?')}</T></Pressable> : null}
            </View>
            {open && ing.sub ? (
              <View style={{ borderRadius: r.sm, backgroundColor: c.bg2, padding: 12, gap: 4 }}>
                <T bold size={fs.sm}>{L('البديل', 'Substitute')}: {ing.sub.name}</T>
                <T size={fs.sm}>{ing.sub.note}</T>
                <T muted size={fs.xs}>🛒 {whereToBuy(ing.sub, null)}</T>
                <Button testID={`use-sub-${ing.id}`} variant="outline" label={isSwapped ? L('ارجع للمكوّن الأصلي', 'Back to the original') : L('استخدم البديل', 'Use the substitute')} onPress={() => setSwapped(flip(swapped, ing.id))} />
              </View>
            ) : null}
          </Card>
        )
      })}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <H2>{L('الخطوات', 'Steps')}</H2>
        <Button variant="link" label={speaking ? L('⏹ إيقاف', '⏹ Stop') : L('🔊 اقرأ الوصفة', '🔊 Read aloud')} onPress={read} />
      </View>
      {recipe.steps.map((st, i) => (
        <Card key={i} style={{ paddingVertical: 12 }}>
          <Pressable testID={`step-${i}`} accessibilityRole="checkbox" accessibilityState={{ checked: checked.has(i) }} onPress={() => setChecked(flip(checked, i))} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <T size={20}>{checked.has(i) ? '✅' : '⬜'}</T>
            <T style={[{ flex: 1 }, checked.has(i) ? { color: c.muted, textDecorationLine: 'line-through' } : null]}>{i + 1}. {st.text}</T>
          </Pressable>
          {st.minutes ? <StepTimer minutes={st.minutes} /> : null}
        </Card>
      ))}
    </ScrollView>
  )
}
