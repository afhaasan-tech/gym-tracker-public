// ONE AI Personal Trainer conversation: text, voice message, photo or video in the same chat.
// The server decides access (one free trial conversation, then an active subscription), the price and what was really analysed.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio'
import * as Crypto from 'expo-crypto'
import { useRouter } from 'expo-router'
import * as Speech from 'expo-speech'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button, Card, Chip, ErrorText, Screen, T } from '../../components/ui'
import { refreshAccess, useAccess } from '../../lib/access'
import { useI18n } from '../../lib/i18n'
import { audioAttachment, MediaError, pickMedia, type Attachment } from '../../lib/media'
import { useTrainingEnv } from '../../lib/prefs'
import { useSession } from '../../lib/session'
import { fn, supabase } from '../../lib/supabase'
import { c, fs, r } from '../../lib/theme'
import { MealCard, WorkoutCard, WorkoutPlanCard } from './cards'
import type { ChatMessage, IngredientData, MealCardData, TrainerReply } from './types'

type Prefs = { coach_persona: 'rashid' | 'sarah'; coach_tone: string; coach_language: 'ar' | 'en'; coach_name: string | null }
type Draft = { text: string; attachment: Attachment | null }
const MAX_RECORD_MS = 30_000
const CHIPS: { id: string; ar: string; en: string; msgAr: string; msgEn: string }[] = [
  { id: 'explain', ar: 'اشرح لي تمرين 💪', en: 'Explain an exercise 💪', msgAr: 'اشرح لي تمرين مناسب لمستواي ووين أحس بالعضلة', msgEn: 'Explain an exercise suited to my level and where I should feel it' },
  { id: 'busy', ar: 'الجهاز مشغول 🔄', en: 'Machine busy 🔄', msgAr: 'الجهاز اللي أبيه مشغول، عطني تمرين بديل لنفس العضلة', msgEn: 'The machine I need is busy, give me an alternative exercise for the same muscle' },
  { id: 'home', ar: 'تمرين بالبيت 🏠', en: 'Home workout 🏠', msgAr: 'عطني تمرين بالبيت بدون أدوات', msgEn: 'Give me a home exercise with no equipment' },
  { id: 'pain', ar: 'أحس بألم ⚠️', en: 'I feel pain ⚠️', msgAr: 'أحس بألم وأبي تمرين ما يضغط على المنطقة', msgEn: 'I feel pain and want an exercise that avoids the area' },
]

export default function TrainerChat({ initialMessage = null }: { initialMessage?: { text: string; nonce: string } | null }) {
  const { L, lang, rtl } = useI18n()
  const { recheckTrust } = useSession()
  const { access, loaded, unavailable, refresh } = useAccess()
  const router = useRouter()
  const [env, setEnv] = useTrainingEnv()
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversation, setConversation] = useState<string | null>(null)
  const [input, setInput] = useState(''), [attachment, setAttachment] = useState<Attachment | null>(null)
  const [busy, setBusy] = useState(false), [note, setNote] = useState('')
  const [confirm, setConfirm] = useState<{ draft: Draft; credits: number } | null>(null)
  const [voiceOut, setVoiceOut] = useState(false)
  const [consent, setConsent] = useState<boolean | null>(null), [askConsent, setAskConsent] = useState<null | (() => void)>(null)
  const [recording, setRecording] = useState(false), [recMs, setRecMs] = useState(0)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const messagesRef = useRef(messages); messagesRef.current = messages

  useEffect(() => {
    supabase.from('member_preferences').select('coach_persona,coach_tone,coach_language,coach_name').maybeSingle().then(({ data }) => setPrefs(data as Prefs | null))
    AsyncStorage.getItem('vora_media_consent').then((v) => setConsent(v === 'yes')).catch(() => setConsent(false))
    return () => { void Speech.stop(); if (recTimer.current) clearInterval(recTimer.current) }
  }, [])
  // The free trial is bound to ONE conversation id on the server: reuse it; otherwise keep one id per install.
  useEffect(() => {
    if (!loaded) return
    const bound = access?.trial.conversation_id
    if (bound && access?.tier === 'trial') { setConversation(bound); return }
    AsyncStorage.getItem('vora_conversation').then((v) => {
      const id = v && /^[0-9a-f-]{36}$/i.test(v) ? v : Crypto.randomUUID()
      setConversation(id); if (id !== v) AsyncStorage.setItem('vora_conversation', id).catch(() => {})
    }).catch(() => setConversation(Crypto.randomUUID()))
  }, [loaded, access?.trial.conversation_id, access?.tier])

  const persona = prefs?.coach_persona ?? 'rashid'
  const name = prefs?.coach_name || (persona === 'sarah' ? L('سارة', 'Sarah') : L('راشد', 'Rashid'))
  const speechLang = (prefs?.coach_language ?? lang) === 'ar' ? 'ar-SA' : 'en-US'
  const tier = access?.tier ?? 'none'
  const blocked = loaded && !unavailable && tier === 'none'

  const patch = (id: string, f: (m: ChatMessage) => ChatMessage) => setMessages((p) => p.map((m) => (m.id === id ? f(m) : m)))
  const errorText = useCallback((code: string | undefined, status: number) =>
    code === 'insufficient_credits' ? L('رصيدك غير كافٍ لهذا الطلب.', 'Not enough credits for this request.')
    : code === 'device_not_trusted' ? L('هذا الجهاز لم يعد موثّقاً. أكّد الجهاز مرة ثانية.', 'This device is no longer trusted. Verify it again.')
    : code === 'input_rejected' ? L('الرسالة فيها محتوى غير مسموح. اكتبها بصيغة ثانية.', 'That message contains content we cannot accept. Please rephrase.')
    : code === 'attachment_too_large' ? L('الملف كبير. الحد: صورة 4 ميغا، صوت 5، فيديو 12.', 'File too large. Limits: photo 4 MB, audio 5 MB, video 12 MB.')
    : code === 'attachment_type_not_supported' ? L('نوع الملف غير مدعوم.', 'This file type is not supported.')
    : code === 'trial_ended' || code === 'subscription_required' ? L('انتهت تجربتك المجانية. اشترك عشان تكمل مع مدربك.', 'Your free trial has ended. Subscribe to continue with your trainer.')
    : code === 'rate_limited' || status === 429 ? L('طلبات كثيرة. انتظر شوي.', 'Too many requests. Please wait.')
    : code === 'provider_unavailable' ? L('الخدمة مشغولة الحين. ما انخصم منك شي.', 'The service is busy. Nothing was charged.')
    : L('تعذر الطلب. جرّب مرة ثانية.', 'Request failed. Please try again.'), [L])

  const run = useCallback(async (draft: Draft, credits: number) => {
    if (!conversation) return
    const userId = Crypto.randomUUID(), botId = Crypto.randomUUID()
    const history = messagesRef.current.filter((m) => !m.pending && !m.error && m.text).slice(-8).map((m) => ({ role: m.role, text: m.text.slice(0, 600) }))
    const label = draft.text || (draft.attachment?.kind === 'audio' ? L('🎤 رسالة صوتية', '🎤 Voice message') : draft.attachment?.kind === 'video' ? L('🎬 فيديو', '🎬 Video') : L('📷 صورة', '📷 Photo'))
    setMessages((p) => [...p, { id: userId, role: 'user', text: label, attachment: draft.attachment?.kind }, { id: botId, role: 'assistant', text: '', pending: true }])
    setInput(''); setAttachment(null); setBusy(true); setNote(''); void Speech.stop()
    const res = await fn<TrainerReply>('ai-trainer', {
      conversation_id: conversation, message: draft.text || undefined,
      attachments: draft.attachment ? [{ kind: draft.attachment.kind, mime_type: draft.attachment.mime_type, data_base64: draft.attachment.data_base64 }] : undefined,
      history, environment: env, persona, tone: prefs?.coach_tone ?? 'friendly', language: prefs?.coach_language ?? lang,
      idempotency_key: Crypto.randomUUID(), confirm_credits: credits,
    })
    setBusy(false)
    if (res.error === 'confirmation_required' && typeof res.extra?.credits === 'number') {
      // paid request: show the EXACT cost first; nothing has been charged or sent to the trainer yet
      setMessages((p) => p.filter((m) => m.id !== userId && m.id !== botId))
      setInput(draft.text); setConfirm({ draft, credits: res.extra.credits as number })
      return
    }
    if (!res.data) {
      patch(botId, (m) => ({ ...m, pending: false, error: true, text: errorText(res.error, res.status) }))
      if (res.error === 'device_not_trusted') void recheckTrust()
      if (res.error === 'trial_ended' || res.error === 'subscription_required') refreshAccess()
      return
    }
    const d = res.data
    patch(botId, (m) => ({
      ...m, pending: false, text: d.chat_reply, mock: d.mock, charged: d.credits_charged, voiceScript: d.voice_script, injuredArea: d.safety?.injured_area ?? null,
      locked: d.locked, mediaNote: d.media?.note ?? null, workoutCard: d.workout_card, workoutPlan: d.workout_plan, mealCard: d.meal_card,
    }))
    if (voiceOut && d.voice_script) Speech.speak(d.voice_script, { language: speechLang, rate: 0.95 })
    refreshAccess()
  }, [conversation, env, persona, prefs, lang, voiceOut, speechLang, errorText, recheckTrust, L])

  const submit = useCallback((draft: Draft) => {
    if (busy || blocked || !conversation || (!draft.text.trim() && !draft.attachment)) return
    // trial: free, no confirmation. subscriber: ask the server for the exact price first (it answers 409 with the amount).
    void run({ text: draft.text.trim(), attachment: draft.attachment }, tier === 'subscriber' ? -1 : 0)
  }, [busy, blocked, conversation, tier, run])

  // ---- media: explicit one-time consent, then the system permission prompt
  const withConsent = (go: () => void) => { if (consent) go(); else setAskConsent(() => go) }
  const acceptConsent = () => { setConsent(true); AsyncStorage.setItem('vora_media_consent', 'yes').catch(() => {}); const go = askConsent; setAskConsent(null); go?.() }
  const mediaProblem = (e: unknown) => {
    const code = e instanceof MediaError ? e.code : 'read'
    setNote(code === 'permission' ? L('ما عندنا إذن. فعّله من إعدادات الجهاز.', 'Permission was not granted. Enable it in the device settings.')
      : code === 'too_large' ? L('الملف كبير. الحد: صورة 4 ميغا، صوت 5، فيديو 12 (تقريباً 30 ثانية).', 'File too large. Limits: photo 4 MB, audio 5 MB, video 12 MB (about 30 seconds).')
      : code === 'type' ? L('نوع الملف غير مدعوم.', 'This file type is not supported.') : L('ما قدرنا نقرأ الملف.', 'We could not read the file.'))
  }
  const pick = (kind: 'image' | 'video') => withConsent(async () => {
    setNote('')
    try { const a = await pickMedia(kind); if (a) setAttachment(a) } catch (e) { mediaProblem(e) }
  })
  const stopRecording = useCallback(async () => {
    if (recTimer.current) { clearInterval(recTimer.current); recTimer.current = null }
    setRecording(false)
    try {
      await recorder.stop()
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {})
      const uri = recorder.uri
      if (!uri) throw new MediaError('read')
      setAttachment(await audioAttachment(uri, Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4'))
    } catch (e) { mediaProblem(e) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder])
  const startRecording = () => withConsent(async () => {
    setNote('')
    try {
      const perm = await requestRecordingPermissionsAsync()
      if (!perm.granted) throw new MediaError('permission')
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync(); recorder.record()
      const t0 = Date.now(); setRecMs(0); setRecording(true)
      recTimer.current = setInterval(() => { const ms = Date.now() - t0; setRecMs(ms); if (ms >= MAX_RECORD_MS) void stopRecording() }, 250)
    } catch (e) { setRecording(false); mediaProblem(e) }
  })

  // a message handed over from another tab (e.g. "machine busy" on an exercise): prefill only — the member still presses send
  const seen = useRef<string | null>(null)
  useEffect(() => { if (initialMessage && seen.current !== initialMessage.nonce) { seen.current = initialMessage.nonce; setInput(initialMessage.text) } }, [initialMessage])

  const onMissingIngredient = useCallback((ing: IngredientData, card: MealCardData) => {
    submit({ text: L(`ما لقيت ${ing.name_ar}. عطني بديل متوفر وأعد حساب الماكروز لوصفة ${card.meal_name_ar}.`, `I can't find ${ing.name_ar}. Give me an available substitute and recalculate the macros for the ${card.meal_name_en} recipe.`), attachment: null })
  }, [submit, L])

  const canSend = (input.trim().length > 0 || attachment !== null) && !busy && !blocked && !unavailable && !recording && conversation !== null
  const kindLabel = (k: Attachment['kind']) => k === 'image' ? L('صورة', 'Photo') : k === 'video' ? L('فيديو', 'Video') : L('رسالة صوتية', 'Voice message')
  const badge = !loaded ? '…' : unavailable ? '—' : tier === 'subscriber' ? L('مشترك', 'Subscriber')
    : tier === 'trial' ? (access?.trial.started ? L(`تجربة مجانية: باقي ${access.trial.remaining}`, `Free trial: ${access.trial.remaining} left`) : L('تجربة مجانية وحدة', 'One free trial')) : L('انتهت التجربة', 'Trial ended')

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={st.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <View style={st.avatar}><Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>{name.slice(0, 1)}</Text></View>
            <View style={{ flex: 1 }}><T muted size={fs.xs}>{L('مدربك الشخصي', 'Your personal trainer')}</T><T bold size={fs.lg} testID="trainer-name">{name}</T></View>
          </View>
          <Pressable testID="voice-toggle" accessibilityRole="switch" accessibilityState={{ checked: voiceOut }} accessibilityLabel={L('قراءة الرد بالصوت', 'Read replies aloud')} onPress={() => { if (voiceOut) void Speech.stop(); setVoiceOut((v) => !v) }} style={st.iconBtn}>
            <Text style={{ fontSize: 16 }}>{voiceOut ? '🔊' : '🔇'}</Text>
          </Pressable>
          <View style={st.badge} testID="access-badge"><Text style={st.badgeText}>{badge}</Text></View>
        </View>

        <View style={st.envRow}>
          <Chip testID="env-gym" label={L('🏋️ نادي', '🏋️ Gym')} on={env === 'gym'} onPress={() => setEnv('gym')} />
          <Chip testID="env-home" label={L('🏠 بيت بدون أدوات', '🏠 Home, no equipment')} on={env === 'home'} onPress={() => setEnv('home')} />
        </View>

        <FlatList ref={listRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 8 }} data={messages} keyExtractor={(m) => m.id} testID="chat"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled"
          ListHeaderComponent={messages.length === 0 ? (
            <View style={[st.bubble, st.bot]}>
              <T>{L(`هلا والله 👋 أنا ${name}، مدربك الشخصي. قول لي هدفك أو اسألني عن أي تمرين، وتقدر تدز لي صوت أو صورة أو فيديو.`, `Hi 👋 I'm ${name}, your personal trainer. Tell me your goal or ask about any exercise — you can also send a voice message, a photo or a video.`)}</T>
            </View>) : undefined}
          renderItem={({ item: m }) => (
            <View style={{ marginBottom: 12, maxWidth: '92%', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <View style={[st.bubble, m.role === 'user' ? { backgroundColor: c.accent } : m.error ? st.errBubble : st.bot]}>
                {m.pending ? <ActivityIndicator size="small" color={c.accent} /> : <T selectable style={m.role === 'user' ? { color: '#fff' } : m.error ? { color: c.danger } : undefined}>{m.text}</T>}
              </View>
              {m.role === 'assistant' && !m.pending && !m.error ? (
                <View style={st.meta}>
                  {m.mock ? <T muted size={fs.xs} testID="mock-label">{L('رد تجريبي (بدون ذكاء اصطناعي حقيقي)', 'Mock reply (no real AI)')}</T> : null}
                  {typeof m.charged === 'number' && m.charged > 0 ? <T muted size={fs.xs}>{L(`خُصم ${m.charged} رصيد`, `${m.charged} credits charged`)}</T> : null}
                  {m.voiceScript ? <Pressable accessibilityRole="button" onPress={() => Speech.speak(m.voiceScript!, { language: speechLang, rate: 0.95 })}><T size={fs.xs} style={{ color: c.accent }}>🔊 {L('استمع', 'Listen')}</T></Pressable> : null}
                </View>
              ) : null}
              {m.mediaNote ? <View style={st.info} testID="media-note"><T size={fs.xs} style={{ color: c.gold }}>ℹ️ {m.mediaNote}</T></View> : null}
              {m.workoutCard ? <WorkoutCard card={m.workoutCard} injuredArea={m.injuredArea} onOpenMuscleMap={(mu) => router.push({ pathname: '/workouts', params: { muscle: mu } })} /> : null}
              {m.workoutPlan ? <WorkoutPlanCard plan={m.workoutPlan} /> : null}
              {m.mealCard ? <MealCard card={m.mealCard} onMissingIngredient={onMissingIngredient} /> : null}
              {m.locked && m.locked.length > 0 ? (
                <View style={st.info} testID="locked-note">
                  <T size={fs.xs} style={{ color: c.gold }}>🔒 {m.locked.includes('nutrition') ? L('التغذية ضمن الباقات اللي تشملها.', 'Nutrition is included in eligible plans.') : L('الخطط الشخصية الكاملة للمشتركين.', 'Full personalised plans are for subscribers.')}</T>
                  <Button variant="link" label={L('شوف الباقات', 'See plans')} onPress={() => router.push('/store')} />
                </View>
              ) : null}
            </View>
          )} />

        {note ? <View style={{ paddingHorizontal: 12, paddingBottom: 6 }}><ErrorText>{note}</ErrorText></View> : null}
        {unavailable ? <View style={{ paddingHorizontal: 12, paddingBottom: 6 }} testID="trainer-unavailable"><ErrorText>{L('المدرب الشخصي غير مفعّل على هذا الخادم بعد.', 'The personal trainer is not enabled on this server yet.')}</ErrorText></View> : null}

        {blocked ? (
          <Card style={{ margin: 12 }} testID="paywall">
            <T bold>{L('انتهت تجربتك المجانية', 'Your free trial has ended')}</T>
            <T muted size={fs.sm}>{L('عشان تكمل مع مدربك الشخصي وخططك، اشترك بباقة.', 'Subscribe to a plan to continue with your personal trainer and plans.')}</T>
            <Button testID="paywall-plans" label={L('شوف الباقات', 'See plans')} onPress={() => router.push('/store')} />
          </Card>
        ) : askConsent ? (
          <Card style={{ margin: 12 }} testID="media-consent">
            <T bold>{L('إرسال وسائط للمدرب', 'Sending media to your trainer')}</T>
            <T muted size={fs.sm}>{L('الصورة أو الفيديو أو الصوت اللي تختاره يُرسل لخادم ڤورا ولمزوّد الذكاء الاصطناعي عشان يحلله لهذا الطلب فقط، وما نخزّنه. لا ترسل وسائط فيها أشخاص غيرك بدون إذنهم.', 'The photo, video or audio you choose is sent to the VORA server and the AI provider to analyse it for this request only; we do not store it. Do not send media showing other people without their permission.')}</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button testID="media-consent-yes" style={{ flex: 1 }} label={L('موافق', 'I agree')} onPress={acceptConsent} />
              <Button variant="outline" style={{ flex: 1 }} label={L('إلغاء', 'Cancel')} onPress={() => setAskConsent(null)} />
            </View>
          </Card>
        ) : confirm ? (
          <View style={st.confirm} accessibilityRole="alert" testID="confirm-bar">
            <T size={fs.sm}>{L(`سيتم خصم ${confirm.credits} رصيد لهذا الطلب. متابعة؟`, `This request will cost ${confirm.credits} credits. Continue?`)}</T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button testID="confirm" style={{ flex: 1 }} label={L('تأكيد', 'Confirm')} onPress={() => { const x = confirm; setConfirm(null); void run(x.draft, x.credits) }} />
              <Button variant="outline" style={{ flex: 1 }} label={L('إلغاء', 'Cancel')} onPress={() => setConfirm(null)} />
            </View>
          </View>
        ) : (
          <>
            {messages.length === 0 ? (
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 8 }} keyboardShouldPersistTaps="handled">
                  {CHIPS.map((ch) => <Chip key={ch.id} testID={`chip-${ch.id}`} disabled={busy || unavailable} label={lang === 'ar' ? ch.ar : ch.en} onPress={() => submit({ text: lang === 'ar' ? ch.msgAr : ch.msgEn, attachment: null })} />)}
                </ScrollView>
              </View>
            ) : null}
            {attachment ? (
              <View style={st.attach} testID="attachment-chip">
                <T size={fs.sm} style={{ flex: 1 }}>📎 {kindLabel(attachment.kind)} · {(attachment.bytes / 1024 / 1024).toFixed(1)} MB</T>
                <Button variant="link" label={L('إزالة', 'Remove')} onPress={() => setAttachment(null)} />
              </View>
            ) : null}
            {recording ? (
              <View style={st.attach} testID="recording-bar">
                <T size={fs.sm} style={{ flex: 1, color: c.danger }}>🔴 {L('جاري التسجيل', 'Recording')} {Math.floor(recMs / 1000)}s / 30s</T>
                <Button testID="rec-stop" label={L('إيقاف', 'Stop')} onPress={() => void stopRecording()} />
              </View>
            ) : (
              <View style={st.composer}>
                <Pressable testID="add-photo" accessibilityRole="button" accessibilityLabel={L('أرسل صورة', 'Send a photo')} disabled={busy || unavailable} onPress={() => pick('image')} style={st.tool}><Text style={st.toolIcon}>📷</Text></Pressable>
                <Pressable testID="add-video" accessibilityRole="button" accessibilityLabel={L('أرسل فيديو', 'Send a video')} disabled={busy || unavailable} onPress={() => pick('video')} style={st.tool}><Text style={st.toolIcon}>🎬</Text></Pressable>
                <Pressable testID="add-voice" accessibilityRole="button" accessibilityLabel={L('سجّل رسالة صوتية', 'Record a voice message')} disabled={busy || unavailable} onPress={startRecording} style={st.tool}><Text style={st.toolIcon}>🎙️</Text></Pressable>
                <TextInput testID="msg" value={input} onChangeText={setInput} editable={!busy} multiline maxLength={1000} accessibilityLabel={L('رسالة', 'Message')}
                  placeholder={L('اكتب لمدربك…', 'Message your trainer…')} placeholderTextColor={c.placeholder} style={[st.input, { textAlign: rtl ? 'right' : 'left' }]} />
                <Pressable testID="send" accessibilityRole="button" accessibilityLabel={L('إرسال', 'Send')} disabled={!canSend} onPress={() => submit({ text: input, attachment })} style={[st.send, !canSend && { opacity: 0.4 }]}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>}
                </Pressable>
              </View>
            )}
            <T muted size={fs.xs} style={{ paddingHorizontal: 12, paddingBottom: 6 }}>
              {tier === 'subscriber' ? L('سعر كل طلب يظهر لك قبل الخصم. مدربك للياقة فقط، وليس بديلاً عن الطبيب.', 'The price of each request is shown before charging. Your trainer covers fitness only and is not a substitute for a doctor.')
                : L('تجربة مجانية: محادثة وحدة بعدد رسائل محدود. مدربك للياقة فقط، وليس بديلاً عن الطبيب.', 'Free trial: one conversation with a limited number of messages. Your trainer covers fitness only and is not a substitute for a doctor.')}
            </T>
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  )
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line, borderRadius: r.pill, paddingHorizontal: 12, paddingVertical: 6 },
  badgeText: { color: c.text, fontSize: fs.xs, fontWeight: '700' },
  envRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 4 },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bot: { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, alignSelf: 'flex-start', marginBottom: 12 },
  errBubble: { backgroundColor: c.dangerSoft, borderColor: c.danger, borderWidth: 1 },
  meta: { flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  info: { marginTop: 6, backgroundColor: c.goldSoft, borderRadius: r.sm, padding: 8 },
  confirm: { margin: 12, padding: 14, gap: 10, borderRadius: r.md, borderWidth: 1, borderColor: c.accent, backgroundColor: c.surface },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: r.sm, backgroundColor: c.surface2, borderWidth: 1, borderColor: c.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 10, paddingBottom: 6, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 8 },
  tool: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  toolIcon: { fontSize: 20 },
  input: { flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, color: c.text, paddingHorizontal: 14, paddingVertical: 10, fontSize: fs.md },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accent },
})
