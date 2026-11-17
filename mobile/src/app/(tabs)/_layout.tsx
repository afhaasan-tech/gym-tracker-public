// Tab order follows the approved app reference: Home · Workouts · Nutrition · Trainer · Account.
// The Trainer tab is the ONE AI Personal Trainer; nutrition content is for eligible subscribers.
import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useI18n } from '../../lib/i18n'
import { c } from '../../lib/theme'

const icon = (e: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{e}</Text>

export default function TabsLayout() {
  const { L } = useI18n()
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line }, tabBarLabelStyle: { fontSize: 12, fontWeight: '600' }, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" options={{ title: L('الرئيسية', 'Home'), tabBarIcon: icon('🏠'), tabBarButtonTestID: 'nav-home' }} />
      <Tabs.Screen name="workouts" options={{ title: L('التمارين', 'Workouts'), tabBarIcon: icon('💪'), tabBarButtonTestID: 'nav-workouts' }} />
      <Tabs.Screen name="nutrition" options={{ title: L('التغذية', 'Nutrition'), tabBarIcon: icon('🥗'), tabBarButtonTestID: 'nav-nutrition' }} />
      <Tabs.Screen name="coach" options={{ title: L('مدربي', 'Trainer'), tabBarIcon: icon('🤖'), tabBarButtonTestID: 'nav-coach' }} />
      <Tabs.Screen name="profile" options={{ title: L('حسابي', 'Account'), tabBarIcon: icon('👤'), tabBarButtonTestID: 'nav-profile' }} />
    </Tabs>
  )
}
