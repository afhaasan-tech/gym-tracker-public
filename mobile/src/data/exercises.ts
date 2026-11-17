import type { MuscleId } from "../features/agents/types";
export interface Exercise {
  id: string; name: string; muscle: MuscleId; env: "gym" | "home";
  equipment: string; sets: number; reps: string; rest: number; tip: string; beginnerSafe: boolean;
}
const E = (id: string, name: string, muscle: MuscleId, env: "gym" | "home", equipment: string, sets: number, reps: string, rest: number, tip: string, beginnerSafe = true): Exercise =>
  ({ id, name, muscle, env, equipment, sets, reps, rest, tip, beginnerSafe });

export const EXERCISES: Exercise[] = [
  E("bench", "ضغط صدر بالبار", "chest", "gym", "بار + بنش", 3, "8-12", 90, "اثبت كتفك للخلف وانزل البار لمنتصف الصدر، ونفّس بانتظام.", false),
  E("chest-machine", "ضغط صدر بالجهاز", "chest", "gym", "جهاز الصدر", 3, "10-12", 75, "الجهاز أأمن للمبتدئين. لا تقفل المرفق بالكامل."),
  E("pushup", "ضغط (Push-up)", "chest", "home", "بدون أدوات", 3, "8-15", 60, "جسمك خط مستقيم. إذا صعب، ابدأ من الركبة."),
  E("lat-pull", "سحب علوي", "back", "gym", "جهاز السحب", 3, "10-12", 75, "اسحب بمرفقك مو بيدك، وخلّ صدرك لقدام."),
  E("row", "سحب أرضي بالكيبل", "back", "gym", "كيبل", 3, "10-12", 75, "ظهرك مستقيم واضغط لوح الكتف للخلف."),
  E("superman", "سوبرمان (Superman)", "back", "home", "بدون أدوات", 3, "12-15", 45, "ارفع صدرك ورجولك شوي وامسك ثانيتين. بدون شد رقبة."),
  E("shoulder-press", "ضغط أكتاف بالدمبل", "shoulders", "gym", "دمبل", 3, "8-12", 75, "لا تقوّس أسفل ظهرك، وخلّ بطنك مشدود."),
  E("pike", "ضغط الأكتاف (Pike)", "shoulders", "home", "بدون أدوات", 3, "6-12", 60, "ارفع أردافك لفوق وانزل برأسك بين يديك."),
  E("curl", "بايسبس بالدمبل", "biceps", "gym", "دمبل", 3, "10-12", 60, "ثبّت مرفقك بجنبك ولا تتأرجح بالجسم."),
  E("towel-curl", "بايسبس بالمنشفة", "biceps", "home", "منشفة", 3, "12", 45, "شد المنشفة بيدك الثانية كمقاومة."),
  E("pushdown", "ترايسبس بالكيبل", "triceps", "gym", "كيبل", 3, "10-12", 60, "المرفق ثابت وافرد الذراع بالكامل."),
  E("dips-chair", "ترايسبس على الكرسي", "triceps", "home", "كرسي ثابت", 3, "8-12", 60, "انزل بتحكم وظهرك قريب من الكرسي."),
  E("wrist-curl", "ساعد بالدمبل", "forearms", "gym", "دمبل خفيف", 3, "15", 45, "حركة قصيرة وبطيئة بوزن خفيف."),
  E("towel-grip", "قبضة المنشفة", "forearms", "home", "منشفة", 3, "30 ث", 45, "اعصر المنشفة بقوة وامسك."),
  E("abs-crunch", "كرنش بطن بالكيبل", "abs", "gym", "كيبل", 3, "12-15", 60, "اكبس بطنك مو رقبتك."),
  E("plank", "بلانك (Plank)", "abs", "home", "بدون أدوات", 3, "30-45 ث", 45, "جسمك مستقيم، ولا ترفع أردافك."),
  E("hip-thrust", "دفع الورك (Hip Thrust)", "hips", "gym", "بار أو آلة", 3, "10-12", 75, "اعصر الأرداف فوق ثانية. الذقن لصدرك."),
  E("glute-bridge", "جسر الأرداف", "hips", "home", "بدون أدوات", 3, "15", 45, "ادفع من كعبك واعصر الأرداف بالأعلى."),
  E("calf-raise", "رفع سمانة بالجهاز", "calf", "gym", "جهاز السمانة", 4, "12-15", 45, "انزل لأقصى مدى وارفع على أطراف أصابعك."),
  E("calf-home", "رفع سمانة واقف", "calf", "home", "بدون أدوات", 4, "15-20", 30, "امسك الحائط للتوازن وارفع ببطء."),
];
export const exercisesFor = (m: MuscleId, env: "gym" | "home", beginner: boolean) =>
  EXERCISES.filter((e) => e.muscle === m && e.env === env && (!beginner || e.beginnerSafe));
