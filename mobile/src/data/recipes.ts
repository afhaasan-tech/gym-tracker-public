// Offline Gulf recipes + substitution engine for students abroad. Macros are per 100 g (approximate, from common food tables).
export type Region = "USA" | "UK" | "Canada" | "Australia" | "Europe";
export interface Per100 { kcal: number; p: number; c: number; f: number }
export interface Sub { name: string; per100: Per100; note: string; where: Partial<Record<Region, string>> & { default: string } }
export interface Ingredient { id: string; name: string; grams: number; per100: Per100; sub?: Sub }
export interface Step { text: string; minutes?: number }
export interface Recipe {
  id: string; title: string; emoji: string; serves: number; minutes: number; blurb: string;
  ingredients: Ingredient[]; steps: Step[];
}

const I = (id: string, name: string, grams: number, per100: Per100, sub?: Sub): Ingredient => ({ id, name, grams, per100, sub });
const P = (kcal: number, p: number, c: number, f: number): Per100 => ({ kcal, p, c, f });

const LOOMI: Sub = { name: "ليمون حامض مبشور + قشرة", per100: P(29, 1, 9, 0.3), note: "ورقة/قشر ليمون طازج يعطي حموضة قريبة. ضع نص الكمية.", where: { default: "أي سوبرماركت (قسم الخضار)", USA: "Walmart / Kroger", UK: "Tesco / Sainsbury's", Europe: "Lidl / Carrefour" } };
const BAHARAT: Sub = { name: "بهارات مشكّلة: فلفل أسود + قرفة + قرنفل + هيل", per100: P(251, 10, 55, 3), note: "اخلط بنسب متساوية تقريبًا. أو اشترِ Garam Masala وهو الأقرب.", where: { default: "قسم التوابل", USA: "Garam Masala في Walmart/Target", UK: "Garam Masala في Tesco", Canada: "Garam Masala في Loblaws", Australia: "Garam Masala في Coles/Woolworths", Europe: "Garam Masala أو Ras el Hanout" } };
const SAFFRON: Sub = { name: "كركم + قليل ماء ورد", per100: P(312, 9, 67, 3), note: "يعطي لون ذهبي. النكهة أخف من الزعفران.", where: { default: "قسم التوابل" } };
const BASMATI: Sub = { name: "أرز Jasmine أو Long grain", per100: P(130, 2.7, 28, 0.3), note: "الجاسمين أنعم والمدة أقصر شوي.", where: { default: "أي سوبرماركت" } };
const SHEIKH: Sub = { name: "شعيرية رفيعة أو Angel hair مكسّرة", per100: P(371, 13, 75, 1.5), note: "اكسر الإسباغيتي الرفيع وحمّصه بالزبدة.", where: { default: "قسم المكرونة", Europe: "Capellini / Cheveux d'ange" } };
const CRACKED: Sub = { name: "Pearl barley أو شوفان كامل (Steel-cut oats)", per100: P(352, 10, 78, 1.2), note: "الشعير اللؤلؤي أقرب قوامًا للهريس. يحتاج وقت أطول.", where: { default: "قسم الحبوب", UK: "Pearl barley في Tesco", USA: "Pearl barley في Walmart", Europe: "Orge perlé / Graupen" } };
const GHEE: Sub = { name: "زبدة + قليل زيت زيتون", per100: P(740, 0.6, 0, 82), note: "الزبدة العادية تحترق أسرع، أضف زيت للحماية.", where: { default: "قسم الألبان" } };
const ROSE: Sub = { name: "ماء ورد (Rose water)", per100: P(5, 0, 1, 0), note: "غالبًا متوفر بقسم الطبخ أو المتاجر الشرق أوسطية/الهندية.", where: { default: "متجر شرق أوسطي أو أمازون" } };
const TOMATO: Sub = { name: "طماطم معلبة مفرومة", per100: P(21, 1.2, 4, 0.1), note: "سخّنها حتى تتكثف.", where: { default: "أي سوبرماركت" } };

const RICE = P(130, 2.7, 28, 0.3);

export const RECIPES: Recipe[] = [
  {
    id: "machboos", title: "مجبوس دجاج خفيف", emoji: "🍛", serves: 4, minutes: 60,
    blurb: "طبق خليجي كلاسيكي بدسم أقل وبروتين عالي.",
    ingredients: [
      I("chicken", "صدور دجاج", 600, P(165, 31, 0, 3.6)),
      I("rice", "أرز بسمتي", 300, RICE, BASMATI),
      I("onion", "بصل", 200, P(40, 1.1, 9.3, 0.1)),
      I("tomato", "طماطم", 200, P(18, 0.9, 3.9, 0.2), TOMATO),
      I("loomi", "ليمون أسود (لومي) مجفف", 10, P(29, 1, 9, 0.3), LOOMI),
      I("baharat", "بهارات خليجية (بهارات مجبوس)", 15, P(251, 10, 55, 3), BAHARAT),
      I("saffron", "زعفران/كركم", 2, P(312, 9, 67, 3), SAFFRON),
      I("oil", "زيت زيتون", 30, P(884, 0, 0, 100)),
    ],
    steps: [
      { text: "قطّع البصل وحمّره بزيت الزيتون على نار متوسطة.", minutes: 8 },
      { text: "أضف الدجاج والبهارات والليمون الأسود وقلّب حتى يتلوّن الدجاج.", minutes: 6 },
      { text: "أضف الطماطم وكاسة ونص ماء، غطّي واتركه يغلي بهدوء.", minutes: 20 },
      { text: "أضف الأرز المغسول والزعفران، ثم قلّل النار وغطّي بإحكام.", minutes: 20 },
      { text: "أطفئ النار واتركه يرتاح قبل التقديم.", minutes: 5 },
    ],
  },
  {
    id: "balaleet", title: "بلاليط صحي", emoji: "🍝", serves: 2, minutes: 25,
    blurb: "فطور خليجي حلو ومالح، بكمية سكر أقل.",
    ingredients: [
      I("vermicelli", "شعيرية", 100, P(371, 13, 75, 1.5), SHEIKH),
      I("eggs", "بيض", 120, P(143, 12.6, 0.7, 9.5)),
      I("ghee", "سمن", 10, P(900, 0, 0, 100), GHEE),
      I("rose", "ماء ورد", 5, P(5, 0, 1, 0), ROSE),
      I("sugar", "سكر", 20, P(387, 0, 100, 0)),
      I("cardamom", "هيل مطحون", 2, P(311, 11, 68, 7)),
      I("saffron", "زعفران", 1, P(312, 9, 67, 3), SAFFRON),
    ],
    steps: [
      { text: "حمّر الشعيرية بالسمن حتى تتلوّن.", minutes: 3 },
      { text: "أضف ماء مع الزعفران والهيل والسكر وماء الورد واتركها تنضج.", minutes: 12 },
      { text: "جهّز أومليت بسيط بالبيض.", minutes: 4 },
      { text: "قدّم الشعيرية مع الأومليت فوقها." },
    ],
  },
  {
    id: "harees", title: "هريس لحم", emoji: "🥣", serves: 4, minutes: 120,
    blurb: "طبق رمضاني دافئ يشبع ويدفّي.",
    ingredients: [
      I("wheat", "قمح مجروش (هريس)", 250, P(342, 11.3, 71, 1.5), CRACKED),
      I("meat", "لحم غنم أو بقر قليل الدهن", 400, P(187, 25, 0, 9)),
      I("onion", "بصل", 150, P(40, 1.1, 9.3, 0.1)),
      I("ghee", "سمن", 20, P(900, 0, 0, 100), GHEE),
      I("cinnamon", "قرفة", 3, P(247, 4, 81, 1.2)),
      I("salt", "ملح", 5, P(0, 0, 0, 0)),
    ],
    steps: [
      { text: "انقع القمح من الليل واغسله.", minutes: 0 },
      { text: "اسلق اللحم مع البصل والقرفة والملح حتى ينضج.", minutes: 60 },
      { text: "أضف القمح وماء كافي واتركه على نار هادئة مع التقليب.", minutes: 45 },
      { text: "اهرس الخليط حتى يصير ناعم، وزيّنه بالسمن المحمّر.", minutes: 10 },
    ],
  },
  {
    id: "lentil", title: "شوربة عدس خليجية", emoji: "🍲", serves: 4, minutes: 35,
    blurb: "خفيفة وغنية بالبروتين النباتي والألياف.",
    ingredients: [
      I("lentils", "عدس أحمر", 250, P(358, 25, 63, 1.1)),
      I("onion", "بصل", 120, P(40, 1.1, 9.3, 0.1)),
      I("carrot", "جزر", 120, P(41, 0.9, 9.6, 0.2)),
      I("cumin", "كمون", 5, P(375, 18, 44, 22)),
      I("turmeric", "كركم", 3, P(312, 9, 67, 3)),
      I("lemon", "ليمون", 40, P(29, 1.1, 9.3, 0.3)),
      I("oil", "زيت زيتون", 15, P(884, 0, 0, 100)),
    ],
    steps: [
      { text: "فرّم البصل والجزر وحمّرهم بالزيت.", minutes: 6 },
      { text: "أضف العدس والكمون والكركم و1.2 لتر ماء.", minutes: 2 },
      { text: "اتركها تغلي على نار متوسطة حتى ينضج العدس.", minutes: 22 },
      { text: "اخلطها بالخلاط وأضف عصير الليمون قبل التقديم.", minutes: 3 },
    ],
  },
];

export const getRecipe = (id: string) => RECIPES.find((r) => r.id === id);

export interface Totals { kcal: number; p: number; c: number; f: number }
/** Totals per serving. `swapped` = ids of ingredients replaced by their abroad substitute. */
export function perServing(r: Recipe, swapped: Set<string>): Totals {
  const t = r.ingredients.reduce<Totals>((a, ing) => {
    const m = swapped.has(ing.id) && ing.sub ? ing.sub.per100 : ing.per100;
    const k = ing.grams / 100;
    return { kcal: a.kcal + m.kcal * k, p: a.p + m.p * k, c: a.c + m.c * k, f: a.f + m.f * k };
  }, { kcal: 0, p: 0, c: 0, f: 0 });
  return { kcal: Math.round(t.kcal / r.serves), p: Math.round(t.p / r.serves), c: Math.round(t.c / r.serves), f: Math.round(t.f / r.serves) };
}
export const whereToBuy = (sub: Sub, region: string | null) => (region && (sub.where as Record<string, string>)[region]) || sub.where.default;
