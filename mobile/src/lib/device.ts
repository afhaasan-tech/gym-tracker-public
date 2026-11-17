// Per-install device secret for the trusted-device flow. Stored in the OS keychain/keystore on iOS/Android
// (expo-secure-store) and in localStorage on web. Only its SHA-256 hash is ever stored server-side.
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const KEY = 'vora_device_secret'
const OK = /^[A-Za-z0-9_-]{32,128}$/
let cached: string | null = null

function generate(): string {
  const bytes = Crypto.getRandomBytes(32)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function deviceSecret(): Promise<string> {
  if (cached) return cached
  let s: string | null = null
  try {
    s = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY)
  } catch { s = null }
  if (!s || !OK.test(s)) {
    s = generate()
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, s)
      else await SecureStore.setItemAsync(KEY, s, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
    } catch { /* keep in memory for this run */ }
  }
  cached = s
  return s
}

export const deviceLabel = () => `${Platform.OS} · VORA app`.slice(0, 50)
