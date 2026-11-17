// Contract between the `ai-agents` Edge Function and the app (card shapes come from the AI-agents reference files).
export type MuscleId = 'back' | 'chest' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'hips' | 'calf' | 'abs'
export interface Macros { calories: number; protein_g: number; carbs_g: number; fat_g: number }
export interface WorkoutCardData {
  exercise_name_ar: string; exercise_name_en: string; target_muscle: MuscleId; secondary_muscles: MuscleId[]
  environment: 'gym' | 'home'; equipment: string; sets: number; reps: string; rest_seconds: number
  posture_cues: string[]; alternative: { name_ar: string; reason_ar: string } | null
}
export interface IngredientData {
  name_ar: string; grams: number; household_unit: string
  substitute: { name_ar: string; store_hint: string; grams: number; household_unit: string; macros_delta_per_serving: Macros } | null
}
export interface MealCardData {
  meal_name_ar: string; meal_name_en: string; servings: number; prep_minutes: number; cook_minutes: number
  localized_for: string | null; macros_per_serving: Macros; macros_with_substitutes: Macros | null
  ingredients: IngredientData[]; steps: { text_ar: string; timer_seconds: number | null }[]
}
export interface WorkoutPlanData {
  title: string; notes: string
  days: { day_label: string; focus: string; exercises: { name: string; sets: number; reps: string; rest_seconds: number }[] }[]
}
export type MediaKind = 'image' | 'audio' | 'video'
/** Reply of the `ai-trainer` Edge Function. */
export interface TrainerReply {
  request_id: string; conversation_id: string; chat_reply: string; voice_script: string; off_topic: boolean
  safety: { injury_reported: boolean; injured_area: string | null; refused: boolean; refusal_reason: string; urgent: boolean }
  workout_card: WorkoutCardData | null; workout_plan: WorkoutPlanData | null; meal_card: MealCardData | null
  locked: string[]
  media: { received: MediaKind[]; analyzed: MediaKind[]; note: string | null }
  credits_charged: number; mock: boolean; replay: boolean
  access: { tier: 'trial' | 'subscriber'; nutrition: boolean; trial_remaining: number | null }
}
export type ChatMessage = {
  id: string; role: 'user' | 'assistant'; text: string
  pending?: boolean; error?: boolean; mock?: boolean; charged?: number; attachment?: MediaKind
  voiceScript?: string; injuredArea?: string | null; locked?: string[]; mediaNote?: string | null
  workoutCard?: WorkoutCardData | null; workoutPlan?: WorkoutPlanData | null; mealCard?: MealCardData | null
}
