import { useLocalSearchParams } from 'expo-router'
import TrainerChat from '../../features/trainer/TrainerChat'

export default function Coach() {
  const { msg, n } = useLocalSearchParams<{ msg?: string; n?: string }>()
  return <TrainerChat initialMessage={msg ? { text: msg, nonce: n ?? msg } : null} />
}
