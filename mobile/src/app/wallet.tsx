// Credit wallet: balance from my_credit_balance() and the member's own ledger rows (both require a trusted device server-side).
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Card, ErrorText, H2, Loading, T, s } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import { c, fs } from '../lib/theme'

type Balance = { total?: number; held?: number; promo?: number; purchased?: number; reward?: number; subscription?: number }
type Row = { id: number; source: string; entry_type: string; amount: number; created_at: string }
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

export default function Wallet() {
  const { L, rtl } = useI18n()
  const [bal, setBal] = useState<Balance | null>(null), [rows, setRows] = useState<Row[]>([]), [err, setErr] = useState('')
  useFocusEffect(useCallback(() => {
    let alive = true
    supabase.rpc('my_credit_balance').then(({ data, error }) => { if (!alive) return; if (error) setErr(L('تعذر تحميل الرصيد.', 'Could not load balance.')); else { setErr(''); setBal(data as Balance) } })
    supabase.from('credit_ledger').select('id,source,entry_type,amount,created_at').order('id', { ascending: false }).limit(30).then(({ data }) => { if (alive) setRows((data ?? []) as Row[]) })
    return () => { alive = false }
  }, [L]))
  const src: Record<string, string> = { promo: L('رصيد تجريبي', 'Trial credits'), purchased: L('مشترى', 'Purchased'), reward: L('مكافآت', 'Rewards'), subscription: L('الاشتراك', 'Subscription') }
  const kind: Record<string, string> = { grant: L('إضافة', 'Added'), purchase: L('شراء', 'Purchase'), reserve: L('طلب ذكاء اصطناعي', 'AI request'), release: L('استرجاع', 'Refund'), expire: L('انتهاء صلاحية', 'Expired'), adjust: L('تعديل', 'Adjustment') }
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad}>
                {err ? <ErrorText>{err}</ErrorText> : null}
        <Card>
          <T muted size={fs.sm}>{L('الرصيد المتاح', 'Available balance')}</T>
          {bal ? <T bold size={40} testID="balance-total" style={{ lineHeight: 48 }}>{fmt(Number(bal.total ?? 0))}</T> : <Loading />}
          {bal ? (
            <View style={s.row}>
              {(['promo', 'purchased', 'reward', 'subscription'] as const).map((k) => Number(bal[k] ?? 0) > 0 ? <View key={k} style={{ backgroundColor: c.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><T size={fs.xs} style={{ color: c.accent }}>{src[k]}: {fmt(Number(bal[k]))}</T></View> : null)}
              {Number(bal.held ?? 0) > 0 ? <View style={{ backgroundColor: c.goldSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><T size={fs.xs} style={{ color: c.gold }}>{L('محجوز', 'On hold')}: {fmt(Number(bal.held))}</T></View> : null}
            </View>
          ) : null}
          <T muted size={fs.sm}>{L('لا توجد مدفوعات حقيقية حالياً. الرصيد التجريبي يُمنح مرة واحدة.', 'No real payments yet. Trial credits are granted once.')}</T>
        </Card>
        <Card>
          <H2>{L('آخر الحركات', 'Recent activity')}</H2>
          {rows.length === 0 ? <T muted>{L('لا حركات بعد.', 'No activity yet.')}</T> : rows.map((row) => (
            <View key={row.id} testID="ledger-row" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopColor: c.line, borderTopWidth: 1, paddingTop: 8 }}>
              <View style={{ flex: 1 }}>
                <T bold size={fs.sm}>{kind[row.entry_type] ?? row.entry_type}</T>
                <T muted size={fs.xs}>{src[row.source] ?? row.source} · {new Date(row.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</T>
              </View>
              <T bold style={{ color: row.amount < 0 ? c.danger : c.accent }}>{row.amount > 0 ? '+' : ''}{fmt(row.amount)}</T>
            </View>
          ))}
        </Card>
    </ScrollView>
  )
}
