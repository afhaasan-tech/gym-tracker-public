// Customer support is a normal app feature: a short form that opens a ticket, and the member's recent tickets. Always free.
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, TextInput, View } from 'react-native'
import { Button, Card, Chip, ErrorText, H2, Note, T, s } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { c, fs, r } from '../lib/theme'

type Ticket = { ticket_ref: string; category: string; status: string; created_at: string }
const CATS = ['billing', 'technical', 'device_limit', 'renewal', 'other'] as const

export default function Support() {
  const { L, rtl } = useI18n()
  const [cat, setCat] = useState<(typeof CATS)[number]>('technical'), [text, setText] = useState(''), [busy, setBusy] = useState(false), [msg, setMsg] = useState(''), [done, setDone] = useState('')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const label: Record<string, string> = { billing: L('الدفع والفواتير', 'Billing'), technical: L('مشكلة تقنية', 'Technical'), device_limit: L('الأجهزة', 'Devices'), renewal: L('الاشتراك والتجديد', 'Subscription'), other: L('أخرى', 'Other') }
  const status: Record<string, string> = { open: L('مفتوحة', 'Open'), in_progress: L('قيد المعالجة', 'In progress'), resolved: L('تم الحل', 'Resolved'), closed: L('مغلقة', 'Closed') }
  const load = useCallback(() => { supabase.from('support_tickets').select('ticket_ref,category,status,created_at').order('created_at', { ascending: false }).limit(10).then(({ data }) => setTickets((data ?? []) as Ticket[])) }, [])
  useEffect(() => { load() }, [load])
  async function send() {
    setBusy(true); setMsg(''); setDone('')
    const { data, error } = await supabase.rpc('support_ticket_open', { p_category: cat, p_summary: text.trim() })
    setBusy(false)
    if (error || !data) { setMsg(/limit|too many/i.test(error?.message ?? '') ? L('وصلت الحد اليومي للتذاكر. جرّب باجر.', 'You reached the daily ticket limit. Try tomorrow.') : L('ما قدرنا نسجل التذكرة. جرّب مرة ثانية.', 'We could not log the ticket. Try again.')); return }
    setDone(String(data)); setText(''); load()
  }
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
      <Note>{L('الدعم مجاني. لا تكتب أرقام بطاقات أو كلمات سر. نحتفظ بالتذاكر 6 أشهر.', 'Support is free. Never write card numbers or passwords. Tickets are kept for 6 months.')}</Note>
      <Card>
        <H2>{L('افتح تذكرة', 'Open a ticket')}</H2>
        <View style={s.row} accessibilityRole="radiogroup">{CATS.map((k) => <Chip key={k} testID={`cat-${k}`} label={label[k]} on={cat === k} onPress={() => setCat(k)} />)}</View>
        <TextInput testID="ticket-text" value={text} onChangeText={setText} multiline maxLength={1000} accessibilityLabel={L('اشرح المشكلة', 'Describe the issue')} placeholder={L('اشرح المشكلة باختصار…', 'Briefly describe the issue…')} placeholderTextColor={c.placeholder}
          style={{ minHeight: 110, borderRadius: r.sm, borderWidth: 1, borderColor: c.line2, backgroundColor: c.bg2, color: c.text, padding: 12, fontSize: fs.md, textAlign: rtl ? 'right' : 'left', textAlignVertical: 'top' }} />
        <Button testID="ticket-send" busy={busy} disabled={text.trim().length < 10} label={L('إرسال', 'Send')} onPress={send} />
        {msg ? <ErrorText>{msg}</ErrorText> : null}
        {done ? <T testID="ticket-done" style={{ color: c.accent }}>{L('سجّلنا تذكرتك برقم', 'Your ticket was logged as')} {done}</T> : null}
      </Card>
      {tickets.length > 0 ? <H2>{L('تذاكري', 'My tickets')}</H2> : null}
      {tickets.map((t) => <Card key={t.ticket_ref} testID="ticket-row" style={{ paddingVertical: 12 }}><T size={fs.sm}>{t.ticket_ref} · {label[t.category] ?? t.category} · {status[t.status] ?? t.status} · {new Date(t.created_at).toLocaleDateString('en-GB')}</T></Card>)}
    </ScrollView>
  )
}
