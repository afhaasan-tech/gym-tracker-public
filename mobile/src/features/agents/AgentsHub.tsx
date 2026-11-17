// The three AI employees in one chat hub: Fitness Coach | Nutrition Assistant | Customer Support.
// Layout follows the AI-agents hub reference (tabs, gym/home toggle, zero-typing chips, composer, cards);
// the money/safety rules are VORA's existing ones: trusted device, exact-cost confirmation, credit wallet.
import * as Crypto from 'expo-crypto'
import { useRouter } from 'expo-router'
import * as Speech from 'expo-speech'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, Chip, ErrorText, Screen, T } from '../../components/ui'
import { useI18n } from '../../lib/i18n'
import { useTrainingEnv } from '../../lib/prefs'
import { useSession } from '../../lib/session'
import { fn, supabase } from '../../lib/supabase'
import { c, fs, r } from '../../lib/theme'
import { MealCard, SupportTicketCard, WorkoutCard } from './cards'
import type { AgentReply, AgentRole, ChatMessage, IngredientData, MealCardData, SupportAction } from './types'

const ROLES: AgentRole[] = ['coach', 'nutritionist', 'support']
const EMOJI: Record<AgentRole, string> = { coach: '💪', nutritionist: '🥗', support: '🎧' }
type Prefs = { coach_persona: 'rashid' | 'sarah'; coach_tone: string; coach_language: 'ar' | 'en'; coach_name: string | null }
type Pending = { text: string; quickAction?: string; context?: { meal_name?: string; ingredient?: string } }
type ChipDef = { id: string; ar: string; en: string; msgAr: string; msgEn: string }

const CHIPS: Record<AgentRole, ChipDef[]> = {
  coach: [
    { id: 'swap_busy_machine', ar: 'بدّل الجهاز مشغول 🔄', en: 'Machine busy 🔄', msgAr: 'الجهاز اللي أبي أستخدمه مشغول، عطني تمرين بديل لنفس العضلة', msgEn: 'The machine I need is busy, give me an alternative exercise for the same muscle' },
    { id: 'home_version', ar: 'نسخة البيت بدون أدوات 🏠', en: 'Home, no equipment 🏠', msgAr: 'عطني تمرين نسخة البيت بدون أدوات', msgEn: 'Give me a home exercise with no equipment' },
    { id: 'explain_muscle', ar: 'وين أحس بالعضلة؟ 🔴', en: 'Where should I feel it? 🔴', msgAr: 'وين المفروض أحس بالعضلة في هذا التمرين؟', msgEn: 'Where should I feel the muscle in this exercise?' },
    { id: 'beginner_warmup', ar: 'إحماء هادئ للمبتدئين', en: 'Gentle beginner warm-up', msgAr: 'أنا مبتدئ، عطني تمرين إحماء هادئ', msgEn: 'I am a beginner, give me a gentle warm-up exercise' },
    { id: 'report_pain', ar: 'أحس بألم ⚠️', en: 'I feel pain ⚠️', msgAr: 'أحس بألم وأبي تمرين ما يضغط على المنطقة', msgEn: 'I feel pain and want an exercise that avoids the area' },
  ],
  nutritionist: [
    { id: 'protein_machboos', ar: 'مجبوس دجاج عالي بروتين 🍗', en: 'High-protein chicken machboos 🍗', msgAr: 'أبي وصفة مجبوس دجاج عالي بروتين', msgEn: 'I want a high-protein chicken machboos recipe' },
    { id: 'dorm_breakfast', ar: 'فطور سريع 🍳', en: 'Quick breakfast 🍳', msgAr: 'أبي وصفة فطور سريع وصحي', msgEn: 'I want a quick healthy breakfast recipe' },
    { id: 'light_harees', ar: 'هريس خفيف على السعرات', en: 'Lighter harees', msgAr: 'أبي وصفة هريس أخف على السعرات وأعلى بالبروتين', msgEn: 'I want a lighter, higher-protein harees recipe' },
    { id: 'calc_macros', ar: 'احسب ماكروز وجبتي 🧮', en: 'Estimate my meal macros 🧮', msgAr: 'احسب لي ماكروز وجبتي', msgEn: 'Estimate the macros of my meal' },
  ],
  support: [
    { id: 'manage_devices', ar: 'إدارة أجهزتي 📱', en: 'Manage my devices 📱', msgAr: 'أبي أدير أجهزتي وأشيل جهاز قديم', msgEn: 'I want to manage my devices and remove an old one' },
    { id: 'payment_failed', ar: 'مشكلة دفع KNET 💳', en: 'KNET payment problem 💳', msgAr: 'عملية الدفع بـ KNET ما كملت', msgEn: 'My KNET payment did not complete' },
    { id: 'credits_question', ar: 'سؤال عن الرصيد', en: 'Question about credits', msgAr: 'كيف يشتغل نظام الرصيد؟', msgEn: 'How do credits work?' },
    { id: 'open_ticket', ar: 'افتح تذكرة 🎫', en: 'Open a ticket 🎫', msgAr: 'أبي أفتح تذكرة دعم', msgEn: 'I want to open a support ticket' },
  ],
}

export default function AgentsHub({ initialAgent = 'coach', initialMessage = null }: { initialAgent?: AgentRole; initialMessage?: { text: string; nonce: string } | null }) {
  const { L, lang, rtl } = useI18n()
  const { recheckTrust } = useSession()
  const router = useRouter()
  const [agent, setAgent] = useState<AgentRole>(initialAgent)
  const [messages, setMessages] = useState<Record<AgentRole, ChatMessage[]>>({ coach: [], nutritionist: [], support: [] })
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [balance, setBalance] = useState<number | null>(null)
  const [env, setEnv] = useTrainingEnv()
  const [voice, setVoice] = useState(false)
  const [input, setInput] = useState(''), [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const messagesRef = useRef(messages); messagesRef.current = messages

  const loadBalance = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_credit_balance')
    if (!error && data) setBalance(Number((data as { total?: number }).total ?? 0))
  }, [])
  useEffect(() => {
    supabase.from('member_preferences').select('coach_persona,coach_tone,coach_language,coach_name').maybeSingle().then(({ data }) => setPrefs(data as Prefs | null))
    supabase.from('ai_operations').select('key,credits').like('key', 'agent_%').then(({ data }) => { const m: Record<string, number> = {}; (data ?? []).forEach((o) => { m[o.key] = o.credits }); setCosts(m) })
    void loadBalance()
    return () => { void Speech.stop() }
  }, [loadBalance])

  const cost = costs[`agent_${agent}`]
  const persona = prefs?.coach_persona ?? 'rashid'
  const coachName = prefs?.coach_name || (persona === 'sarah' ? L('سارة', 'Sarah') : L('راشد', 'Rashid'))
  const tab = (role: AgentRole) => role === 'coach' ? L('المدرب', 'Coach') : role === 'nutritionist' ? L('التغذية', 'Nutrition') : L('خدمة العملاء', 'Support')
  const greeting = agent === 'coach' ? L(`هلا والله 👋 أنا ${coachName}. قول لي شنو تبي نشتغل اليوم، وأشرح لك الحركة والعضلة المستهدفة. وإذا الجهاز مشغول أو أنت بالبيت، عندي لك بديل.`, `Hi 👋 I'm ${coachName}. Tell me what you want to train today and I'll explain the movement and the target muscle. Machine busy or at home? I have an alternative.`)
    : agent === 'nutritionist' ? L('هلا فيك 🥗 أحوّل أكلنا الخليجي لوجبات صحية عالية البروتين، بمقادير واضحة وخطوات بسيطة.', 'Welcome 🥗 I turn Gulf dishes into healthy high-protein meals, with clear amounts and simple steps.')
    : L('هلا فيك 🎧 أنا هنا لأي مشكلة بالدفع أو الأجهزة أو الرصيد. الدعم مجاني دايماً.', 'Welcome 🎧 I can help with payments, devices or credits. Support is always free.')

  const add = (role: AgentRole, ...ms: ChatMessage[]) => setMessages((p) => ({ ...p, [role]: [...p[role], ...ms] }))
  const patch = (role: AgentRole, id: string, f: (m: ChatMessage) => ChatMessage) => setMessages((p) => ({ ...p, [role]: p[role].map((m) => (m.id === id ? f(m) : m)) }))

  const errorText = useCallback((code: string | undefined, status: number) =>
    code === 'insufficient_credits' ? L('رصيدك غير كافٍ لهذا الطلب.', 'Not enough credits for this request.')
    : code === 'device_not_trusted' ? L('هذا الجهاز لم يعد موثّقاً. أكّد الجهاز مرة ثانية.', 'This device is no longer trusted. Verify it again.')
    : code === 'input_rejected' ? L('الرسالة فيها محتوى غير مسموح. اكتبها بصيغة ثانية.', 'That message contains content we cannot accept. Please rephrase.')
    : code === 'rate_limited' || status === 429 ? L('طلبات كثيرة. انتظر شوي.', 'Too many requests. Please wait.')
    : code === 'provider_unavailable' ? L('الخدمة مشغولة الحين. ما انخصم منك شي.', 'The service is busy. Nothing was charged.')
    : L('تعذر الطلب. جرّب مرة ثانية.', 'Request failed. Please try again.'), [L])

  const run = useCallback(async (role: AgentRole, p: Pending, credits: number) => {
    const userId = Crypto.randomUUID(), botId = Crypto.randomUUID()
    const history = messagesRef.current[role].filter((m) => !m.pending && !m.error && m.text).slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 600) }))
    add(role, { id: userId, role: 'user', text: p.text }, { id: botId, role: 'assistant', text: '', pending: true })
    setInput(''); setBusy(true); setNote(''); void Speech.stop()
    const idem = Crypto.randomUUID()
    const body = {
      agent_role: role, message: p.text, history, quick_action: p.quickAction, environment: role === 'coach' ? env : undefined, context: p.context,
      persona, tone: prefs?.coach_tone ?? 'friendly', language: prefs?.coach_language ?? lang, idempotency_key: idem, confirm_credits: credits,
    }
    let res = await fn<AgentReply>('ai-agents', body)
    if (res.error === 'confirmation_required' && typeof res.extra?.credits === 'number') {
      // the price changed since we showed it: never charge a different amount silently
      setCosts((m) => ({ ...m, [`agent_${role}`]: res.extra!.credits as number }))
      setMessages((prev) => ({ ...prev, [role]: prev[role].filter((m) => m.id !== userId && m.id !== botId) }))
      setPending(p); setBusy(false)
      return
    }
    setBusy(false)
    if (!res.data) {
      patch(role, botId, (m) => ({ ...m, pending: false, error: true, text: errorText(res.error, res.status) }))
      if (res.error === 'device_not_trusted') void recheckTrust()
      return
    }
    const d = res.data
    patch(role, botId, (m) => ({
      ...m, pending: false, text: d.chat_reply, mock: d.mock, charged: d.credits_charged, voiceScript: d.voice_script,
      injuredArea: d.safety?.injured_area ?? null, workoutCard: d.workout_card ?? null, mealCard: d.meal_card ?? null,
      ticketCard: d.support_ticket_card ?? null, actions: d.suggested_actions,
    }))
    if (d.ticket_failed) setNote(L('ما قدرنا نسجل التذكرة الحين، جرّب بعد شوي.', 'We could not log the ticket right now. Try again shortly.'))
    if (voice && d.voice_script) Speech.speak(d.voice_script, { language: (prefs?.coach_language ?? lang) === 'ar' ? 'ar-SA' : 'en-US', rate: 0.95 })
    void loadBalance()
  }, [env, persona, prefs, lang, voice, errorText, recheckTrust, loadBalance, L])

  const submit = useCallback((p: Pending) => {
    if (busy || !p.text.trim() || cost === undefined) return
    if (cost > 0) setPending(p)                 // paid request: show the exact cost first (existing VORA rule)
    else void run(agent, p, 0)                  // support is free: no confirmation needed
  }, [busy, cost, agent, run])

  const onMissingIngredient = useCallback((ing: IngredientData, card: MealCardData) => {
    submit({ text: L(`ما لقيت ${ing.name_ar}. عطني بديل متوفر وأعد حساب الماكروز لوصفة ${card.meal_name_ar}.`, `I can't find ${ing.name_ar}. Give me an available substitute and recalculate the macros for the ${card.meal_name_en} recipe.`), context: { meal_name: card.meal_name_ar, ingredient: ing.name_ar } })
  }, [submit, L])
  const onAction = useCallback((a: SupportAction) => {
    if (a === 'manage_devices') router.push('/devices')
    else router.push('/store')
  }, [router])

  useEffect(() => { setAgent(initialAgent) }, [initialAgent])
  const seen = useRef<string | null>(null)
  useEffect(() => {
    if (!initialMessage || seen.current === initialMessage.nonce || costs.agent_coach === undefined) return
    seen.current = initialMessage.nonce
    setAgent('coach')
    setPending({ text: initialMessage.text, quickAction: 'swap_busy_machine' })
  }, [initialMessage, costs])

  const chips = useMemo(() => CHIPS[agent], [agent])
  const list = messages[agent]
  const accent = c[agent]
  const canSend = input.trim().length > 0 && !busy && cost !== undefined

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.header}>
          <Pressable testID="voice-toggle" accessibilityRole="switch" accessibilityState={{ checked: voice }} accessibilityLabel={L('قراءة الرد بالصوت', 'Read replies aloud')} onPress={() => { if (voice) void Speech.stop(); setVoice((v) => !v) }} style={st.iconBtn}>
            <Text style={{ fontSize: 16 }}>{voice ? '🔊' : '🔇'}</Text>
          </Pressable>
          <View style={st.badge} testID="balance-badge">
            <Text style={st.badgeText}>{agent === 'support' ? L('الدعم مجاني', 'Support is free') : balance === null ? '…' : `${new Intl.NumberFormat('en-US').format(balance)} ${L('رصيد', 'credits')}`}</Text>
          </View>
        </View>

        <View style={st.tabs} accessibilityRole="tablist">
          {ROLES.map((role) => {
            const on = role === agent
            return (
              <Pressable key={role} testID={`tab-${role}`} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { setAgent(role); setPending(null); setNote('') }} style={[st.tab, { borderBottomColor: on ? c[role] : 'transparent' }]}>
                <Text style={{ color: on ? c.text : c.muted, fontWeight: on ? '800' : '500', fontSize: fs.sm, textAlign: 'center' }}>{EMOJI[role]} {tab(role)}</Text>
              </Pressable>
            )
          })}
        </View>

        {agent === 'coach' ? (
          <View style={st.envRow}>
            <Chip testID="env-gym" label={L('🏋️ نادي', '🏋️ Gym')} on={env === 'gym'} onPress={() => setEnv('gym')} />
            <Chip testID="env-home" label={L('🏠 بيت بدون أدوات', '🏠 Home, no equipment')} on={env === 'home'} onPress={() => setEnv('home')} />
          </View>
        ) : null}

        <FlatList ref={listRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }} data={list} keyExtractor={(m) => m.id} testID="chat"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled"
          ListHeaderComponent={list.length === 0 ? <View style={[st.bubble, st.bot]}><T>{greeting}</T></View> : undefined}
          renderItem={({ item: m }) => (
            <View style={{ marginBottom: 12, maxWidth: '92%', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={[st.bubble, m.role === 'user' ? { backgroundColor: accent } : m.error ? st.errBubble : st.bot]}>
                {m.pending ? <ActivityIndicator size="small" color={accent} /> : <T selectable style={m.role === 'user' ? { color: '#fff' } : m.error ? { color: c.danger } : undefined}>{m.text}</T>}
              </View>
              {m.role === 'assistant' && !m.pending && !m.error ? (
                <View style={st.meta}>
                  {m.mock ? <T muted size={fs.xs} testID="mock-label">{L('رد تجريبي (بدون ذكاء اصطناعي حقيقي)', 'Mock reply (no real AI)')}</T> : null}
                  {typeof m.charged === 'number' ? <T muted size={fs.xs}>{m.charged > 0 ? L(`خُصم ${m.charged} رصيد`, `${m.charged} credits charged`) : L('بدون خصم', 'No charge')}</T> : null}
                  {m.voiceScript ? <Pressable accessibilityRole="button" onPress={() => Speech.speak(m.voiceScript!, { language: (prefs?.coach_language ?? lang) === 'ar' ? 'ar-SA' : 'en-US', rate: 0.95 })}><T size={fs.xs} style={{ color: c.accent }}>🔊 {L('استمع', 'Listen')}</T></Pressable> : null}
                </View>
              ) : null}
              {m.workoutCard ? <WorkoutCard card={m.workoutCard} injuredArea={m.injuredArea} onOpenMuscleMap={(mu) => router.push({ pathname: '/workouts', params: { muscle: mu } })} /> : null}
              {m.mealCard ? <MealCard card={m.mealCard} onMissingIngredient={onMissingIngredient} /> : null}
              {m.ticketCard ? <SupportTicketCard card={m.ticketCard} /> : null}
              {m.actions && m.actions.length > 0 ? (
                <View style={[st.envRow, { paddingHorizontal: 0 }]}>{m.actions.map((a) => <Chip key={a.action} label={a.label_ar} onPress={() => onAction(a.action)} />)}</View>
              ) : null}
            </View>
          )} />

        {note ? <View style={{ paddingHorizontal: 12 }}><ErrorText>{note}</ErrorText></View> : null}

        {pending && cost !== undefined ? (
          <View style={st.confirm} accessibilityRole="alert" testID="confirm-bar">
            <T size={fs.sm}>{L(`سيتم خصم ${cost} رصيد لهذا الطلب. متابعة؟`, `This request will cost ${cost} credits. Continue?`)}</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button testID="confirm" label={L('تأكيد', 'Confirm')} style={{ flex: 1 }} onPress={() => { const p = pending; setPending(null); void run(agent, p, cost) }} />
              <Button variant="outline" label={L('إلغاء', 'Cancel')} style={{ flex: 1 }} onPress={() => setPending(null)} />
            </View>
          </View>
        ) : (
          <>
            <View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }} keyboardShouldPersistTaps="handled">
                {chips.map((ch) => <Chip key={ch.id} testID={`chip-${ch.id}`} disabled={busy} label={lang === 'ar' ? ch.ar : ch.en} onPress={() => submit({ text: lang === 'ar' ? ch.msgAr : ch.msgEn, quickAction: ch.id })} />)}
              </ScrollView>
            </View>
            <View style={st.composer}>
              <TextInput testID="msg" value={input} onChangeText={setInput} editable={!busy} multiline maxLength={600} accessibilityLabel={L('رسالة', 'Message')}
                placeholder={agent === 'support' ? L('اكتب مشكلتك…', 'Describe your issue…') : L('اسأل أو اختر من الاقتراحات…', 'Ask, or pick a suggestion…')} placeholderTextColor={c.placeholder}
                style={[st.input, { textAlign: rtl ? 'right' : 'left' }]} />
              <Pressable testID="send" accessibilityRole="button" accessibilityLabel={L('إرسال', 'Send')} disabled={!canSend} onPress={() => submit({ text: input.trim() })} style={[st.send, { backgroundColor: accent }, !canSend && { opacity: 0.4 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>}
              </Pressable>
            </View>
            <T muted size={fs.xs} style={{ paddingHorizontal: 12, paddingBottom: 6 }}>{agent === 'support' ? L('الدعم مجاني دائماً.', 'Support is always free.') : L(`كل طلب يكلف ${cost ?? '…'} رصيد ويظهر لك قبل الخصم. ليست نصيحة طبية.`, `Each request costs ${cost ?? '…'} credits, shown before charging. Not medical advice.`)}</T>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  )
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: c.surface2, borderRadius: r.pill, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { color: c.text, fontSize: fs.xs, fontWeight: '700' },
  tabs: { flexDirection: 'row', paddingHorizontal: 12 },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, paddingHorizontal: 2 },
  envRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bot: { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, alignSelf: 'flex-start', marginBottom: 12 },
  errBubble: { backgroundColor: c.dangerSoft, borderColor: c.danger, borderWidth: 1 },
  meta: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  confirm: { margin: 12, padding: 14, gap: 10, borderRadius: r.md, borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingBottom: 6, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 },
  input: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 16, backgroundColor: c.surface, color: c.text, paddingHorizontal: 14, paddingVertical: 10, fontSize: fs.md },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
})
