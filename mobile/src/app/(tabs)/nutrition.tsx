import { useRouter } from 'expo-router'
import { Pressable, ScrollView } from 'react-native'
import { Button, Card, H1, Screen, T, s } from '../../components/ui'
import { RECIPES, perServing } from '../../data/recipes'
import { useI18n } from '../../lib/i18n'
import { fs } from '../../lib/theme'

export default function Nutrition() {
  const { L } = useI18n()
  const router = useRouter()
  return (
    <Screen>
      <ScrollView contentContainerStyle={[s.pad, { paddingBottom: 40 }]}>
        <H1>{L('وصفات خليجية صحية', 'Healthy Gulf recipes')}</H1>
        <T muted>{L('مقادير وخطوات ومؤقت طبخ لكل وصفة. القيم الغذائية تقديرية.', 'Amounts, steps and a cooking timer for each recipe. Nutrition values are estimates.')}</T>
        {RECIPES.map((rc) => {
          const m = perServing(rc, new Set())
          return (
            <Pressable key={rc.id} testID={`recipe-${rc.id}`} accessibilityRole="button" accessibilityLabel={rc.title} onPress={() => router.push({ pathname: '/recipe/[id]', params: { id: rc.id } })}>
              <Card>
                <T bold size={fs.lg}>{rc.emoji} {rc.title}</T>
                <T muted size={fs.sm}>{rc.blurb}</T>
                <T muted size={fs.xs}>⏱ {rc.minutes} {L('د', 'min')} · {rc.serves} {L('حصص', 'servings')} · {m.kcal} {L('سعرة', 'kcal')} · {L('بروتين', 'protein')} {m.p}g</T>
              </Card>
            </Pressable>
          )
        })}
        <Button testID="ask-nutritionist" variant="outline" label={L('اسأل مساعد التغذية', 'Ask the nutrition assistant')} onPress={() => router.push({ pathname: '/coach', params: { agent: 'nutritionist' } })} />
      </ScrollView>
    </Screen>
  )
}
