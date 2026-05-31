import { normalizePlannerGoal } from '@/lib/planner/intent'

export function buildMentorCanonicalGoalKey(goal: string) {
  return normalizePlannerGoal(goal).toLocaleLowerCase('en-US')
}
