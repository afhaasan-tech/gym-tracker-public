// Arabic educational summaries adapted from Human Anatomy (OERI), CC BY 4.0.
// These describe the named muscle as a whole; individual heads can differ.
const upper = 'https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology/Human_Anatomy_(OERI)/10%3A_Muscular_System/10.06%3A_Appendicular_Muscles_of_the_Pectoral_Girdle_and_Upper_Limbs';
const lower = 'https://med.libretexts.org/Bookshelves/Anatomy_and_Physiology/Human_Anatomy_(OERI)/10%3A_Muscular_System/10.07%3A_Appendicular_Muscles_of_the_Pelvic_Girdle_and_Lower_Limbs';
const abdominal = 'https://medicine.uams.edu/neuroscience/education/medical-school-courses/human-structure-module/anatomy-tables/muscle-tables/muscles-of-the-abdominal-region/';

const info = [
  {
    terms: ['biceps brachii'], ar: 'العضلة ذات الرأسين العضدية',
    origin: 'ينشأ الرأس الطويل من الحديبة فوق الحُقّ في لوح الكتف؛ وينشأ الرأس القصير من الناتئ الغرابي للوح الكتف.',
    insertion: 'حدبة عظم الكعبرة، وتصل الصفاق العضدي بلفافة الساعد.',
    action: 'تساعد على ثني المرفق واستلقاء الساعد، وتساهم في ثني الكتف.', sourceUrl: upper,
  },
  {
    terms: ['triceps brachii'], ar: 'العضلة ثلاثية الرؤوس العضدية',
    origin: 'الرأس الطويل من الحديبة تحت الحُقّ بلوح الكتف؛ والرأسان الوحشي والإنسي من السطح الخلفي لعظم العضد.',
    insertion: 'الناتئ الزُّجّي لعظم الزند عند المرفق.',
    action: 'تبسط المرفق؛ ويساعد الرأس الطويل أيضاً في بسط الكتف وتقريب الذراع.', sourceUrl: upper,
  },
  {
    terms: ['deltoid'], ar: 'العضلة الدالية',
    origin: 'من الجزء الوحشي من الترقوة والأخرم وشوكة لوح الكتف.',
    insertion: 'الحدبة الدالية على عظم العضد.',
    action: 'يُبعِد الجزء الأوسط الذراع؛ وتساهم أجزاؤها الأمامية في الثني والخلفية في البسط عند الكتف.', sourceUrl: upper,
  },
  {
    terms: ['pectoralis major'], ar: 'العضلة الصدرية الكبرى',
    origin: 'من الترقوة والقص وغضاريف أضلاع علوية، مع مساهمة من صفاق العضلة المائلة الخارجية.',
    insertion: 'عظم العضد قرب الثلم بين الحديبتين.',
    action: 'تقريب الذراع ودورانه إلى الداخل؛ ويسهم الجزء الترقوي في ثني الكتف.', sourceUrl: upper,
  },
  {
    terms: ['gluteus maximus'], ar: 'العضلة الألوية الكبرى',
    origin: 'من السطح الخلفي للحرقفة والعجز والعصعص.',
    insertion: 'السبيل الحرقفي الظنبوبي والحدبة الألوية في عظم الفخذ.',
    action: 'تبسط الورك وتساعد في تدوير الفخذ للخارج.', sourceUrl: lower,
  },
  {
    terms: ['rectus femoris'], ar: 'العضلة المستقيمة الفخذية',
    origin: 'من الشوكة الحرقفية الأمامية السفلية والمنطقة فوق الحُقّ في الحوض.',
    insertion: 'عبر وتر العضلة رباعية الرؤوس إلى الرضفة، ثم عبر الرباط الرضفي إلى حدبة الظنبوب.',
    action: 'تبسط الركبة وتساعد على ثني الورك.', sourceUrl: lower,
  },
  {
    terms: ['biceps femoris'], ar: 'العضلة ذات الرأسين الفخذية',
    origin: 'الرأس الطويل من الحدبة الإِسكية؛ والرأس القصير من عظم الفخذ، ومنها الخط الخشن.',
    insertion: 'أساساً رأس الشظية على الجانب الوحشي للركبة.',
    action: 'تثني الركبة وتساعد في دوران الساق للخارج عند ثني الركبة؛ ويساعد الرأس الطويل في بسط الورك.', sourceUrl: lower,
  },
  {
    terms: ['rectus abdominis'], ar: 'العضلة المستقيمة البطنية',
    origin: 'عظم العانة والارتفاق العاني.',
    insertion: 'الناتئ الرهابي للقص وغضاريف الأضلاع الخامس إلى السابع.',
    action: 'تثني الجذع وتساهم في ضغط محتويات البطن.', sourceUrl: abdominal,
  },
];

export function findAnatomyInfo(part) {
  if (!part || part.type !== 'muscle') return null;
  const text = `${part.name || ''} ${part.detail || ''}`.toLowerCase();
  return info.find((item) => item.terms.some((term) => text.includes(term))) || null;
}

export const ANATOMY_INFO = info;
