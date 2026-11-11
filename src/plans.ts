import type { Session } from '@supabase/supabase-js'

/**
 * Day 9 commercial foundation (NO payments): product tiers, provisional KWD prices and content limits.
 * Prices are business assumptions for planning, not proven market prices. 'premium' exists only as a reserved tier:
 * nobody is ever marked premium until a verified payment exists (Day 10). Limits apply to catalogue content only;
 * a member's own saved workouts, food records and bookings are never restricted.
 */
export type Tier = 'visitor' | 'member' | 'premium'
export const tierOf = (session: Session | null): Tier => (session ? 'member' : 'visitor')

export const PRICING = {
  premiumMonthlyKwd: 2.9,        // provisional assumption
  premiumYearlyKwd: 24,          // provisional assumption (~31% below 12 x monthly)
  coachPrivateKwd: [8, 15] as const,   // indicative range of coach-set prices (coach proposes, owner approves)
  coachGroupKwd: [3, 6] as const,
  nutritionSpecialistKwd: [15, 40] as const,   // indicative, qualified providers only
  platformCommissionPercent: 12, // provisional default; owner-configurable; NOT applied in Day 9
}

export const LIMITS = {
  exercises: { visitor: 6, member: 12, premium: Infinity } as Record<Tier, number>,
  exercisesPerMuscleGroup: { visitor: 2, member: 3, premium: Infinity } as Record<Tier, number>,
  openMuscleGroups: { visitor: ['chest', 'legs', 'core'], member: null, premium: null } as Record<Tier, string[] | null>,
}
export const groupOpen = (tier: Tier, group: string) => { const g = LIMITS.openMuscleGroups[tier]; return g === null || g.includes(group) }
