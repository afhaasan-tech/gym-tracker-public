// Coach choice, tone, language, goal and consents — same tables and RPCs as the VORA web app (member_preferences, consent_set).
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Switch, View } from 'react-native'
import { Button, Card, Chip, ErrorText, Field, H2, T, s } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { c, fs, r } from '../lib/theme'

const CONSENTS = ['health_data_storage', 'ai_health_sharing', 'marketing_notifications'] as const

function Choice({ label, value, set, options, id }: { label: string; value: string; set: (v: string) => void; options: [string, string][]; id: string }) {
  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <T muted bold size={fs.sm}>{label}</T>
      <View style={s.row}>{options.map(([v, t]) => <Chip key={v} testID={`${id}-${v}`} label={t} on={value === v} onPress={() => set(v)} />)}</View>
    </View>
  )
}

export default function Onboarding() {
  const { L, rtl } = useI18n()
  const { session } = useSession()
  const router = useRouter()
  const [goal, setGoal] = useState('fat_loss'), [exp, setExp] = useState('beginner'), [persona, setPersona] = useState('rashid')
  const [tone, setTone] = useState('friendly'), [lang, setLang] = useState('ar'), [name, setName] = useState('')
  const [consents, setConsents] = useState<Record<string, boolean>>({}), [msg, setMsg] = useState(''), [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('member_preferences').select('goals,experience,coach_persona,coach_tone,coach_language,coach_name').maybeSingle().then(({ data }) => {
      if (!data) return
      if (Array.isArray(data.goals) && data.goals[0]) setGoal(data.goals[0])
      if (data.experience) setExp(data.experience)
      setPersona(data.coach_persona); setTone(data.coach_tone); setLang(data.coach_language); setName(data.coach_name ?? '')
    })
    supabase.from('consents').select('purpose,granted,id').order('id').then(({ data }) => { const m: Record<string, boolean> = {}; (data ?? []).forEach((x) => { m[x.purpose] = x.granted }); setConsents(m) })
  }, [])

  const label: Record<string, [string, string]> = {
    health_data_storage: [L('حفظ بياناتي الصحية', 'Store my health data'), L('الوزن والطول وأي ملاحظات صحية تضيفها.', 'Weight, height and any health notes you add.')],
    ai_health_sharing: [L('مشاركة بياناتي الصحية مع المدرب الذكي', 'Share my health data with the AI coach'), L('لنصائح أدق. تقدر توقفه أي وقت.', 'For more relevant advice. Turn it off any time.')],
    marketing_notifications: [L('إشعارات العروض', 'Offers and news'), L('اختياري.', 'Optional.')],
  }
  async function toggle(p: string, v: boolean) {
    setConsents((x) => ({ ...x, [p]: v }))
    const { error } = await supabase.rpc('consent_set', { p_purpose: p, p_granted: v, p_version: 'v1' })
    if (error) { setConsents((x) => ({ ...x, [p]: !v })); setMsg(L('تعذر حفظ الموافقة.', 'Could not save consent.')) }
  }
  async function save() {
    if (!session) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('member_preferences').upsert({
      user_id: session.user.id, goals: [goal], experience: exp, coach_persona: persona, coach_tone: tone, coach_language: lang,
      coach_name: name.trim() || null, onboarding: { done: true },
    })
    setBusy(false)
    if (error) setMsg(L('تعذر الحفظ.', 'Could not save.')); else router.back()
  }
  const coaches: [string, string, string][] = [['rashid', L('راشد', 'Rashid'), L('مدرب قوة وتمارين', 'Strength & training')], ['sarah', L('سارة', 'Sarah'), L('لياقة وتغذية متوازنة', 'Fitness & balanced nutrition')]]
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Card>
        <H2>{L('اختر مدربك', 'Choose your coach')}</H2>
        <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup">
          {coaches.map(([k, n, d]) => (
            <Pressable key={k} testID={`coach-${k}`} accessibilityRole="radio" accessibilityState={{ checked: persona === k }} onPress={() => setPersona(k)}
              style={{ flex: 1, padding: 12, borderRadius: r.md, borderWidth: 1, borderColor: persona === k ? c.accent : c.line2, backgroundColor: persona === k ? c.accentSoft : c.surface2, gap: 2 }}>
              <T bold>{n}</T><T muted size={fs.xs}>{d}</T>
            </Pressable>
          ))}
        </View>
        <Field label={L('اسم مخصص للمدرب (اختياري)', 'Custom coach name (optional)')} value={name} onChangeText={setName} maxLength={30} />
        <Choice id="tone" label={L('الأسلوب', 'Tone')} value={tone} set={setTone} options={[['friendly', L('ودّي', 'Friendly')], ['direct', L('مباشر', 'Direct')], ['playful', L('مرح', 'Playful')]]} />
        <Choice id="lang" label={L('لغة المدرب', 'Coach language')} value={lang} set={setLang} options={[['ar', 'العربية'], ['en', 'English']]} />
      </Card>
      <Card>
        <H2>{L('هدفك ومستواك', 'Your goal and level')}</H2>
        <Choice id="goal" label={L('هدفك', 'Goal')} value={goal} set={setGoal} options={[['fat_loss', L('خسارة الدهون', 'Fat loss')], ['muscle', L('بناء العضل', 'Build muscle')], ['fitness', L('لياقة عامة', 'General fitness')]]} />
        <Choice id="exp" label={L('مستواك', 'Experience')} value={exp} set={setExp} options={[['beginner', L('مبتدئ', 'Beginner')], ['intermediate', L('متوسط', 'Intermediate')], ['advanced', L('متقدم', 'Advanced')]]} />
      </Card>
      <Card>
        <H2>{L('الخصوصية والموافقات', 'Privacy & consents')}</H2>
        <T muted size={fs.sm}>{L('كل موافقة اختيارية ويمكن سحبها أي وقت. سحب موافقة البيانات الصحية يحذفها فوراً.', 'Every consent is optional and can be withdrawn. Withdrawing health-data consent deletes it immediately.')}</T>
        {CONSENTS.map((p) => (
          <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopColor: c.line, borderTopWidth: 1, paddingTop: 10 }}>
            <View style={{ flex: 1 }}><T bold size={fs.sm}>{label[p][0]}</T><T muted size={fs.xs}>{label[p][1]}</T></View>
            <Switch testID={`consent-${p}`} accessibilityLabel={label[p][0]} value={Boolean(consents[p])} onValueChange={(v) => toggle(p, v)} trackColor={{ true: c.accent, false: c.line2 }} />
          </View>
        ))}
      </Card>
      {msg ? <ErrorText>{msg}</ErrorText> : null}
      <Button testID="save-onboarding" busy={busy} label={L('حفظ', 'Save')} onPress={save} />
    </ScrollView>
  )
}
