import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Loading, Screen, T, s } from '../components/ui'
import { AuthScreen, DeviceGateScreen, VerifyEmailScreen } from '../features/AuthScreens'
import { I18nProvider, useI18n } from '../lib/i18n'
import { SessionProvider, useSession } from '../lib/session'
import { configured } from '../lib/supabase'
import { c } from '../lib/theme'

function Gate() {
  const { ready, session, trust } = useSession()
  const { L } = useI18n()
  if (!configured) return <Screen><View style={s.pad}><T>{L('إعدادات الاتصال ناقصة (EXPO_PUBLIC_SUPABASE_URL).', 'Missing connection settings (EXPO_PUBLIC_SUPABASE_URL).')}</T></View></Screen>
  if (!ready) return <Screen><Loading /></Screen>
  if (!session) return <AuthScreen />
  if (!session.user.email_confirmed_at) return <VerifyEmailScreen email={session.user.email ?? ''} />
  if (trust === 'loading') return <Screen><Loading /></Screen>
  if (trust !== 'trusted') return <DeviceGateScreen />          // the server enforces the same rule independently
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ title: L('إعداد حسابك', 'Set up your profile'), presentation: 'modal' }} />
      <Stack.Screen name="devices" options={{ title: L('أجهزتي', 'My devices') }} />
      <Stack.Screen name="wallet" options={{ title: L('محفظة الرصيد', 'Credit wallet') }} />
      <Stack.Screen name="store" options={{ title: L('الباقات', 'Plans') }} />
      <Stack.Screen name="recipe/[id]" options={{ title: L('وصفة', 'Recipe') }} />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <Gate />
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  )
}
