// Trusted devices (max 2 active per account, enforced by the server). A member can remove a device from here.
import { useCallback, useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Button, Card, ErrorText, Loading, Note, T, s } from '../components/ui'
import { useI18n } from '../lib/i18n'
import { useSession } from '../lib/session'
import { fn } from '../lib/supabase'
import { c, fs } from '../lib/theme'

type Device = { id: string; label: string | null; created_at: string; last_seen_at: string; revoked_at: string | null }

export default function Devices() {
  const { L, rtl } = useI18n()
  const { recheckTrust } = useSession()
  const [list, setList] = useState<Device[] | null>(null), [err, setErr] = useState('')
  const load = useCallback(async () => {
    const res = await fn<{ devices: Device[] }>('device-auth', { action: 'list_devices' })
    if (res.data) setList(res.data.devices.filter((d) => !d.revoked_at)); else setErr(L('تعذر تحميل الأجهزة.', 'Could not load devices.'))
  }, [L])
  useEffect(() => { void load() }, [load])
  async function revoke(id: string) {
    const res = await fn('device-auth', { action: 'revoke_device', device_id: id })
    if (res.error) setErr(L('تعذر إزالة الجهاز.', 'Could not remove the device.'))
    await recheckTrust()            // if this very device was removed, the gate shows again
    void load()
  }
  return (
    <ScrollView style={{ backgroundColor: c.bg, direction: rtl ? 'rtl' : 'ltr' }} contentContainerStyle={s.pad}>
      <Note>{L('حسابك يشتغل على جهازين موثوقين كحد أقصى. توثيق جهاز ثالث يستبدل الأقدم.', 'Your account works on up to two trusted devices. Verifying a third replaces the oldest.')}</Note>
      {err ? <ErrorText>{err}</ErrorText> : null}
      {list === null ? <Loading /> : list.length === 0 ? <T muted>{L('لا أجهزة.', 'No devices.')}</T> : list.map((d) => (
        <Card key={d.id} testID="device-row" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T bold>{d.label || L('جهاز', 'Device')}</T>
            <T muted size={fs.xs}>{L('آخر استخدام', 'Last used')}: {new Date(d.last_seen_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</T>
          </View>
          <Button variant="link" label={L('إزالة', 'Remove')} onPress={() => revoke(d.id)} />
        </Card>
      ))}
    </ScrollView>
  )
}
