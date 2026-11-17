// VORA mobile theme. Palette and red accent follow the approved app reference (slate neutrals, #EF4444 accent),
// in light and dark according to the device setting (read once at launch).
import { Appearance } from 'react-native'

export const dark = Appearance.getColorScheme() === 'dark'
const light = {
  bg: '#F8FAFC', bg2: '#F1F5F9', surface: '#FFFFFF', surface2: '#F1F5F9', line: '#E2E8F0', line2: '#CBD5E1',
  text: '#0F172A', muted: '#475569', accent: '#EF4444', accent2: '#F87171', accentInk: '#FFFFFF', accentSoft: 'rgba(239,68,68,0.10)',
  gold: '#B45309', goldSoft: 'rgba(245,158,11,0.16)', danger: '#B91C1C', dangerSoft: 'rgba(239,68,68,0.10)', placeholder: '#64748B',
  bodyBase: '#CBD5E1', bodyStroke: '#94A3B8', bodySkin: '#E2E8F0',
}
const night: typeof light = {
  bg: '#020617', bg2: '#0F172A', surface: '#1E293B', surface2: '#0F172A', line: '#334155', line2: '#475569',
  text: '#F8FAFC', muted: '#CBD5E1', accent: '#EF4444', accent2: '#F87171', accentInk: '#FFFFFF', accentSoft: 'rgba(239,68,68,0.18)',
  gold: '#FCD34D', goldSoft: 'rgba(245,158,11,0.18)', danger: '#FCA5A5', dangerSoft: 'rgba(239,68,68,0.18)', placeholder: '#94A3B8',
  bodyBase: '#334155', bodyStroke: '#64748B', bodySkin: '#1E293B',
}
export const c = { ...(dark ? night : light), coach: '#EF4444', nutritionist: '#059669', support: '#0284C7' } as const
export const r = { md: 16, sm: 12, pill: 999 } as const
export const fs = { xs: 12, sm: 13, md: 15, lg: 17, xl: 22, xxl: 27 } as const
