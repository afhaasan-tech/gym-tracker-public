// Account: wallet, plan, coach & privacy settings, trusted devices (max 2), support tickets, support, sign out.
import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, H1, H2, Screen, T, s } from '../../components/ui'
import { LangToggle } from '../../features/AuthScreens'
import { useI18n } from '../../lib/i18n'
import { useSession } from '../../lib/session'
import { useAccess } from '../../lib/access'
import { fn, supabase } from '../../lib/supabase'
import { fs } from '../../lib/theme'

type Ticket = { ticket_ref: string; category: string; status: string; created_at: string }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB')

export default function Profile() {
  const { L } = useI18n()
  const { session, signOut } = useSession()
  const router = useRouter()
  const { access } = useAccess()
  const [balance, setBalance] = useState<number | null>(null), [devices, setDevices] = useState<number | null>(null), [tickets, setTickets] = useState<Ticket[]>([])
  useFocusEffect(useCallback(() => {
    let alive = true
    supabase.rpc('my_credit_balance').then(({ data }) => { if (alive && data) setBalance(Number((data as { total?: number }).total ?? 0)) })
    fn<{ devices: { revoked_at: string | null }[] }>('device-auth', { action: 'list_devices' }).then((res) => { if (alive && res.data) setDevices(res.data.devices.filter((d) => !d.revoked_at).length) })
    supabase.from('support_tickets').select('ticket_ref,category,status,created_at').order('created_at', { ascending: false }).limit(5).then(({ data }) => { if (alive) setTickets((data ?? []) as Ticket[]) })
    return () => { alive = false }
  }, []))
  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 48 }]}>
        <H1>{L('حسابي', 'My account')}</H1>
        <T muted testID="profile-email" style={{ textAlign: 'left' }}>{session?.user.email ?? ''}</T>

        <H2>{L('ڤورا كوينز', 'VORA Coins')}</H2>
        <Card>
          <T bold size={32} testID="profile-balance" style={{ lineHeight: 40 }}>{balance === null ? '…' : new Intl.NumberFormat('en-US').format(balance)}</T>
          <Button testID="open-wallet" variant="outline" label={L('المحفظة والحركات', 'Wallet & activity')} onPress={() => router.push('/wallet')} />
        </Card>

        <H2>{L('الاشتراك', 'Subscription')}</H2>
        <Card>
          <T testID="profile-tier">{access?.tier === 'subscriber' ? L(`مشترك — باقة ${access.plan_key}`, `Subscriber — ${access.plan_key} plan`)
            : access?.tier === 'coins' ? L('بدون اشتراك: تدفع بڤورا كوينز على قد استخدامك.', 'No subscription: you pay as you go with VORA Coins.')
            : access?.tier === 'trial' ? L('حساب مجاني: عندك محادثة تجريبية وحدة مع المدرب.', 'Free account: you have one trial conversation with the trainer.')
            : access ? L('حساب مجاني: انتهت المحادثة التجريبية.', 'Free account: the trial conversation has ended.') : '…'}</T>
          <Button testID="open-store" variant="outline" label={L('⭐ الباقات وڤورا كوينز', '⭐ Plans & VORA Coins')} onPress={() => router.push('/store')} />
        </Card>

        <H2>{L('المدرب والخصوصية', 'Coach & privacy')}</H2>
        <Card>
          <Button testID="open-onboarding" variant="outline" label={L('المدرب والأسلوب والموافقات', 'Coach, tone & consents')} onPress={() => router.push('/onboarding')} />
          <LangToggle />
        </Card>

        <H2>{L(`أجهزتي (${devices ?? '…'}/2)`, `My devices (${devices ?? '…'}/2)`)}</H2>
        <Card><Button testID="open-devices" variant="outline" label={L('إدارة الأجهزة الموثوقة', 'Manage trusted devices')} onPress={() => router.push('/devices')} /></Card>

        {tickets.length > 0 ? (
          <>
            <H2>{L('تذاكر الدعم', 'Support tickets')}</H2>
            {tickets.map((t) => <Card key={t.ticket_ref} testID="ticket-row" style={{ paddingVertical: 12 }}><T size={fs.sm}>{t.ticket_ref} · {t.status} · {day(t.created_at)}</T></Card>)}
          </>
        ) : null}

        <View style={{ gap: 12, marginTop: 8 }}>
          <Button testID="open-support" variant="outline" label={L('🎧 خدمة العملاء', '🎧 Customer support')} onPress={() => router.push('/support')} />
          <Button testID="sign-out" variant="link" label={L('تسجيل الخروج', 'Sign out')} onPress={signOut} />
        </View>
      </ScrollView>
    </Screen>
  )
}
