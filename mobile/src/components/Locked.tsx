// Shown instead of subscriber-only content (nutrition, personalised plans).
import { useRouter } from 'expo-router'
import { Button, Card, T } from './ui'
import { useI18n } from '../lib/i18n'
import { fs } from '../lib/theme'

export function Locked({ title, body }: { title: string; body: string }) {
  const { L } = useI18n()
  const router = useRouter()
  return (
    <Card testID="locked">
      <T bold>🔒 {title}</T>
      <T muted size={fs.sm}>{body}</T>
      <Button testID="locked-plans" label={L('شوف الباقات', 'See plans')} onPress={() => router.push('/store')} />
    </Card>
  )
}
