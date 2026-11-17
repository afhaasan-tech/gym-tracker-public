// Contract between the `ai-agents` Edge Function and the app (card shapes come from the AI-agents reference files).
export type AgentRole = 'coach' | 'nutritionist' | 'support'
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
export type SupportAction = 'cancel_renewal' | 'manage_devices' | 'open_plans' | 'retry_payment'
export interface SupportTicketCardData {
  ticket_ref: string; category: 'billing' | 'technical' | 'device_limit' | 'renewal' | 'other'
  priority: 'low' | 'normal' | 'high'; status: 'open' | 'in_progress' | 'resolved' | 'closed'
  summary: string; created_at: string; message_ar: string; retention_note_ar: string
}
export interface AgentReply {
  agent_role: AgentRole; request_id: string; chat_reply: string; voice_script: string
  credits_charged: number; mock?: boolean; replay?: boolean
  safety?: { injury_reported: boolean; injured_area: string | null; refused: boolean; refusal_reason: string }
  workout_card?: WorkoutCardData | null
  meal_card?: MealCardData | null
  resolved?: boolean; create_support_ticket?: boolean; ticket_failed?: boolean
  support_ticket_card?: SupportTicketCardData | null
  suggested_actions?: { action: SupportAction; label_ar: string }[]
}
export type ChatMessage = {
  id: string; role: 'user' | 'assistant'; text: string
  pending?: boolean; error?: boolean; mock?: boolean; charged?: number
  voiceScript?: string; injuredArea?: string | null
  workoutCard?: WorkoutCardData | null; mealCard?: MealCardData | null; ticketCard?: SupportTicketCardData | null
  actions?: { action: SupportAction; label_ar: string }[]
}
