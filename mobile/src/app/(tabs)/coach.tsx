import { useLocalSearchParams } from 'expo-router'
import AgentsHub from '../../features/agents/AgentsHub'

export default function Coach() {
  const { msg, n, agent } = useLocalSearchParams<{ msg?: string; n?: string; agent?: string }>()
  return <AgentsHub initialAgent={agent === 'nutritionist' || agent === 'support' ? agent : 'coach'} initialMessage={msg ? { text: msg, nonce: n ?? msg } : null} />
}
