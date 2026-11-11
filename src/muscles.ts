// Muscle Explorer: maps the 3D model's muscle names (English, from the model file) to trainable muscle GROUPS,
// and each group to the exercises of the exercise library. Face, eye, throat, tongue and tiny hand/foot-intrinsic
// muscles are not trainable targets, so they are not shown (nothing is removed from the model file itself).
export type MuscleGroup = { id: string; ar: string; en: string; keywords: string[] }

export const GROUPS: MuscleGroup[] = [
  { id: 'chest', ar: 'الصدر', en: 'Chest', keywords: ['صدر'] },
  { id: 'shoulders', ar: 'الكتفان', en: 'Shoulders', keywords: ['كتف'] },
  { id: 'back', ar: 'الظهر', en: 'Back', keywords: ['ظهر'] },
  { id: 'arms', ar: 'الذراعان', en: 'Arms', keywords: ['ذراع', 'ذات الرأسين'] },
  { id: 'core', ar: 'البطن والجذع', en: 'Core', keywords: ['بطن', 'جذع', 'خواصر'] },
  { id: 'glutes', ar: 'الأرداف', en: 'Glutes', keywords: ['أرداف'] },
  { id: 'legs', ar: 'الساقان', en: 'Legs', keywords: ['فخذ', 'ساق', 'أوتار الركبة'] },
]

// Order matters: the first matching rule wins. Names come from the model (case-insensitive, substring match).
const RULES: [RegExp, string][] = [
  [/pectoralis|subclavius|serratus anterior/i, 'chest'],
  [/deltoid|supraspinatus|infraspinatus|teres|subscapularis/i, 'shoulders'],
  [/trapezius|latissimus|rhomboid|levator scapulae|erector|iliocostalis|longissimus|spinalis|multifidus|quadratus lumborum|semispinalis|splenius/i, 'back'],
  [/^biceps|brachialis|coracobrachialis|triceps|anconeus|brachioradialis|flexor carpi|extensor carpi|flexor digitorum (superficialis|profundus)|extensor digitorum$|palmaris|pronator|supinator/i, 'arms'],
  [/rectus abdominis|oblique|transverse abdominal|pyramidalis|linea alba/i, 'core'],
  [/gluteus|piriformis/i, 'glutes'],
  [/quadriceps|rectus femoris|sartorius|biceps femoris|semitendinosus|semimembranosus|gracilis|adductor (longus|magnus|brevis)|pectineus|gastrocnemius|soleus|tibialis|peroneus|fibularis|popliteus|plantaris|extensor digitorum longus|extensor hallucis longus|flexor digitorum longus|flexor hallucis longus|iliacus|psoas/i, 'legs'],
]

export function groupOfMuscleName(name: string): string | null {
  const n = String(name || '')
  if (/pharyn|laryn|arytenoid|glossus|hyoid|thyro|digastric|mylohyoid|oris|labii|nasi|oculi|rectus (superior|inferior|medial|lateral)|oblique$|palpebrae|buccinator|masseter|pterygoid|temporal|frontalis|occipitalis|zygomatic|mentalis|platysma|auricul|procerus|corrugator|risorius|epicranial|tarsus|capitis|colli|scalene|sternocleido|omohyoid|stylo|palatopharyngeus|interossei|lumbricals|opponens|digiti minimi|pollicis|hallucis brevis|adductor hallucis|intertransversarii|interspinales|rotatores|levatores|intercostal|diaphragm|innermost|common tendinous|retinaculum|gemelli|obturator|femoris$/i.test(n)
      && !/rectus femoris|biceps femoris|quadratus femoris/i.test(n) && !/external oblique|internal oblique|abdominal/i.test(n)) return null
  for (const [rx, id] of RULES) if (rx.test(n)) return id
  return null
}

/** Exercises of the library that train a group (matched on the library's Arabic muscle description). */
export function exercisesForGroup<T extends { muscle: string }>(group: string, exercises: T[]): T[] {
  const g = GROUPS.find((x) => x.id === group)
  if (!g) return []
  return exercises.filter((e) => g.keywords.some((k) => e.muscle.includes(k)))
}
