// Stylised body map: 9 muscle groups, the selected one highlighted in red. Shapes come from the approved app reference
// (pure react-native-svg, works offline); styling uses VORA's StyleSheet tokens.
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Svg, { Ellipse, G, Path, Rect } from 'react-native-svg'
import { MUSCLE } from '../features/trainer/cards'
import type { MuscleId } from '../features/trainer/types'
import { useI18n } from '../lib/i18n'
import { c, fs, r } from '../lib/theme'

export const RED = '#EF4444'
export const MUSCLES: MuscleId[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'hips', 'calf']
const FRONT: MuscleId[] = ['chest', 'shoulders', 'biceps', 'forearms', 'abs', 'hips', 'calf']
const BACK: MuscleId[] = ['back', 'shoulders', 'triceps', 'forearms', 'hips', 'calf']
export const viewFor = (m: MuscleId): 'front' | 'back' => (FRONT.includes(m) ? 'front' : 'back')

type Shape = { d?: string; e?: [number, number, number, number]; r?: [number, number, number, number, number] };
// viewBox 0 0 200 400. Left/right pairs mirrored around x=100.
const SHAPES: Record<"front" | "back", Partial<Record<MuscleId, Shape[]>>> = {
  front: {
    chest: [{ d: "M100 92 C88 88 70 90 62 100 C60 116 74 128 100 128 Z" }, { d: "M100 92 C112 88 130 90 138 100 C140 116 126 128 100 128 Z" }],
    shoulders: [{ e: [52, 96, 14, 14] }, { e: [148, 96, 14, 14] }],
    biceps: [{ d: "M40 112 C34 130 36 146 44 156 L56 152 C58 138 58 124 54 112 Z" }, { d: "M160 112 C166 130 164 146 156 156 L144 152 C142 138 142 124 146 112 Z" }],
    forearms: [{ d: "M42 160 C36 184 34 204 38 220 L50 220 C54 200 56 180 56 158 Z" }, { d: "M158 160 C164 184 166 204 162 220 L150 220 C146 200 144 180 144 158 Z" }],
    abs: [{ r: [82, 132, 36, 62, 8] }],
    hips: [{ d: "M72 202 C68 220 70 236 80 244 L100 244 L100 202 Z" }, { d: "M128 202 C132 220 130 236 120 244 L100 244 L100 202 Z" }],
    calf: [{ d: "M76 300 C70 324 72 348 80 362 L90 362 C92 342 92 320 90 300 Z" }, { d: "M124 300 C130 324 128 348 120 362 L110 362 C108 342 108 320 110 300 Z" }],
  },
  back: {
    back: [{ d: "M100 90 C84 88 68 94 64 108 C64 150 76 180 100 196 Z" }, { d: "M100 90 C116 88 132 94 136 108 C136 150 124 180 100 196 Z" }],
    shoulders: [{ e: [52, 96, 14, 14] }, { e: [148, 96, 14, 14] }],
    triceps: [{ d: "M40 112 C34 130 36 146 44 156 L56 152 C58 138 58 124 54 112 Z" }, { d: "M160 112 C166 130 164 146 156 156 L144 152 C142 138 142 124 146 112 Z" }],
    forearms: [{ d: "M42 160 C36 184 34 204 38 220 L50 220 C54 200 56 180 56 158 Z" }, { d: "M158 160 C164 184 166 204 162 220 L150 220 C146 200 144 180 144 158 Z" }],
    hips: [{ d: "M72 202 C66 222 70 242 84 250 L100 250 L100 202 Z" }, { d: "M128 202 C134 222 130 242 116 250 L100 250 L100 202 Z" }],
    calf: [{ d: "M76 300 C70 324 72 348 80 362 L90 362 C92 342 92 320 90 300 Z" }, { d: "M124 300 C130 324 128 348 120 362 L110 362 C108 342 108 320 110 300 Z" }],
  },
};

export function BodyMap({ selected, view, onSelect, height = 300 }: { selected: MuscleId | null; view: 'front' | 'back'; onSelect?: (m: MuscleId) => void; height?: number }) {
  const { lang } = useI18n()
  const parts = SHAPES[view]
  const label = selected ? MUSCLE[selected][lang === 'ar' ? 0 : 1] : ''
  return (
    <Svg width={(height * 200) / 400} height={height} viewBox="0 0 200 400" accessibilityLabel={lang === 'ar' ? `خريطة الجسم${label ? '، ' + label + ' مظللة بالأحمر' : ''}` : `Body map${label ? ', ' + label + ' highlighted in red' : ''}`}>
      <G fill={c.bodySkin} stroke={c.bodyStroke} strokeWidth={1.5}>
        <Ellipse cx={100} cy={50} rx={24} ry={28} />
        <Rect x={90} y={74} width={20} height={16} rx={6} />
        <Path d="M64 92 C50 92 38 100 36 120 L30 210 C30 226 46 228 50 214 L58 160 L62 200 C60 240 66 270 70 296 L66 370 C66 384 90 384 92 368 L100 300 L108 368 C110 384 134 384 134 370 L130 296 C134 270 140 240 138 200 L142 160 L150 214 C154 228 170 226 170 210 L164 120 C162 100 150 92 136 92 Z" />
      </G>
      {(Object.keys(parts) as MuscleId[]).map((m) => (
        <G key={m} onPress={() => onSelect?.(m)} fill={m === selected ? RED : c.bodyBase} stroke={m === selected ? '#B91C1C' : c.bodyStroke} strokeWidth={m === selected ? 2 : 1}>
          {parts[m]!.map((s, i) =>
            s.d ? <Path key={i} d={s.d} /> :
            s.e ? <Ellipse key={i} cx={s.e[0]} cy={s.e[1]} rx={s.e[2]} ry={s.e[3]} /> :
            s.r ? <Rect key={i} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} /> : null)}
        </G>
      ))}
    </Svg>
  )
}

/** Body map + front/back toggle + muscle chips (selecting a back-only muscle flips the view automatically). */
export function MuscleSelector({ value, onChange }: { value: MuscleId; onChange: (m: MuscleId) => void }) {
  const { L, lang } = useI18n()
  const [view, setView] = useState<'front' | 'back'>(viewFor(value))
  useEffect(() => { setView((v) => ((v === 'front' ? FRONT : BACK).includes(value) ? v : viewFor(value))) }, [value])
  const pill = (on: boolean) => ({ minHeight: 40, justifyContent: 'center' as const, borderRadius: r.pill, paddingHorizontal: 16, marginHorizontal: 4, backgroundColor: on ? c.text : c.surface2, borderWidth: 1, borderColor: on ? c.text : c.line })
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', marginBottom: 8 }}>
        {(['front', 'back'] as const).map((v) => (
          <Pressable key={v} testID={`view-${v}`} onPress={() => setView(v)} accessibilityRole="button" accessibilityState={{ selected: view === v }} style={pill(view === v)}>
            <Text style={{ color: view === v ? c.bg : c.text, fontSize: fs.sm, fontWeight: '600' }}>{v === 'front' ? L('أمامي', 'Front') : L('خلفي', 'Back')}</Text>
          </Pressable>
        ))}
      </View>
      <BodyMap selected={value} view={view} onSelect={onChange} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12, gap: 8 }}>
        {MUSCLES.map((m) => (
          <Pressable key={m} testID={`muscle-${m}`} onPress={() => onChange(m)} accessibilityRole="button" accessibilityState={{ selected: m === value }}
            style={{ minHeight: 40, justifyContent: 'center', borderRadius: r.pill, borderWidth: 1, paddingHorizontal: 12, borderColor: m === value ? RED : c.line2, backgroundColor: m === value ? RED : c.surface }}>
            <Text style={{ color: m === value ? '#fff' : c.text, fontSize: fs.sm, fontWeight: '600' }}>{MUSCLE[m][lang === 'ar' ? 0 : 1]}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}
