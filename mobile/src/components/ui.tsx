// Shared building blocks so every screen uses the same buttons, cards and text styles.
import { type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useI18n } from '../lib/i18n'
import { c, fs, r } from '../lib/theme'

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { rtl } = useI18n()
  return <SafeAreaView style={[s.screen, { direction: rtl ? 'rtl' : 'ltr' }, style]} edges={['top']}>{children}</SafeAreaView>
}
export function T({ children, style, muted, bold, size, ...rest }: { children: ReactNode; style?: StyleProp<TextStyle>; muted?: boolean; bold?: boolean; size?: number } & React.ComponentProps<typeof Text>) {
  const { rtl } = useI18n()
  return <Text {...rest} style={[{ color: muted ? c.muted : c.text, fontSize: size ?? fs.md, fontWeight: bold ? '700' : '400', textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr', lineHeight: (size ?? fs.md) * 1.55 }, style]}>{children}</Text>
}
export const H1 = ({ children }: { children: ReactNode }) => <T bold size={fs.xl} accessibilityRole="header">{children}</T>
export const H2 = ({ children }: { children: ReactNode }) => <T bold size={fs.lg} accessibilityRole="header">{children}</T>

export function Card({ children, style, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return <View testID={testID} style={[s.card, style]}>{children}</View>
}
export function Button({ label, onPress, variant = 'primary', disabled, busy, testID, style }: { label: string; onPress?: () => void; variant?: 'primary' | 'outline' | 'link'; disabled?: boolean; busy?: boolean; testID?: string; style?: StyleProp<ViewStyle> }) {
  const off = disabled || busy
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!busy }} disabled={off} onPress={onPress}
      style={({ pressed }) => [variant === 'primary' ? s.primary : variant === 'outline' ? s.outline : s.link, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }, style]}>
      {busy ? <ActivityIndicator color={variant === 'primary' ? c.accentInk : c.accent} />
        : <Text style={{ color: variant === 'primary' ? c.accentInk : variant === 'outline' ? c.text : c.accent, fontWeight: '700', fontSize: fs.md }}>{label}</Text>}
    </Pressable>
  )
}
export function Field({ label, style, ...rest }: { label: string } & TextInputProps) {
  const { rtl } = useI18n()
  return (
    <View style={{ gap: 6 }}>
      <T muted size={fs.sm} bold>{label}</T>
      <TextInput accessibilityLabel={label} placeholderTextColor={c.placeholder} {...rest} style={[s.input, { textAlign: rtl ? 'right' : 'left' }, style]} />
    </View>
  )
}
export function Chip({ label, on, onPress, testID, disabled }: { label: string; on?: boolean; onPress?: () => void; testID?: string; disabled?: boolean }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!on, disabled: !!disabled }} disabled={disabled} onPress={onPress} style={[s.chip, on && s.chipOn, disabled && { opacity: 0.5 }]}>
      <Text style={{ color: on ? c.accentInk : c.text, fontSize: fs.sm, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}
export const ErrorText = ({ children }: { children: ReactNode }) => (
  <View accessibilityRole="alert" style={s.err}><T style={{ color: c.danger }} size={fs.sm}>{children}</T></View>
)
export const Note = ({ children }: { children: ReactNode }) => <Card style={{ backgroundColor: c.bg2 }}><T muted size={fs.sm}>{children}</T></Card>
export const Loading = () => <View style={{ padding: 24, alignItems: 'center' }}><ActivityIndicator color={c.accent} /></View>

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  pad: { padding: 16, gap: 12 },
  card: { backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: r.md, padding: 16, gap: 12 },
  primary: { minHeight: 46, borderRadius: r.sm, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  outline: { minHeight: 46, borderRadius: r.sm, borderColor: c.line2, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  link: { minHeight: 40, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  input: { minHeight: 46, borderRadius: r.sm, borderWidth: 1, borderColor: c.line2, backgroundColor: c.bg2, color: c.text, paddingHorizontal: 12, fontSize: fs.md },
  chip: { minHeight: 36, borderRadius: r.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, paddingHorizontal: 14, justifyContent: 'center' },
  chipOn: { backgroundColor: c.accent, borderColor: c.accent },
  err: { backgroundColor: c.dangerSoft, borderColor: c.danger, borderWidth: 1, borderRadius: r.sm, padding: 10 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
})
