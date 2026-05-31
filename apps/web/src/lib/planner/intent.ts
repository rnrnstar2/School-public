import {
  normalizeGoal as normalizeGoalFirstGoal,
  classifyGoalDomains,
} from '@/lib/planner/goal-first'
import { isMvpEnabledDomainSlug } from '@/lib/planner/goal-first/mvp-config'

const DOMAIN_TO_TRACK_ID: Record<string, string> = {
  web: 'web-builder-ai',
}

function normalizeGoal(goal: string) {
  return goal.trim().replace(/\s+/g, ' ')
}

/**
 * Detect planner intent from goal text.
 * Returns the intent ID (e.g. 'website', 'ai-automation') or 'unsupported'.
 *
 * Uses normalizeGoal + classifyGoalDomains (goal-first architecture)
 * and returns the primary domain as the intent.
 */
export function detectPlannerIntent(goal: string): string {
  const normalizedGoal = normalizeGoal(goal)
  if (!normalizedGoal) {
    return 'unsupported'
  }

  const normalized = normalizeGoalFirstGoal(normalizedGoal)
  const classification = classifyGoalDomains(normalized)
  return classification.primary ?? 'unsupported'
}

/**
 * Detect planner intent and resolve the matching track ID.
 *
 * Returns primary domain as intentId and null trackId
 * (goal-first planner does not map to a single track).
 */
export function detectPlannerIntentWithTrack(goal: string): {
  intentId: string
  trackId: string | null
} {
  const normalizedGoal = normalizeGoal(goal)
  if (!normalizedGoal) {
    return { intentId: 'unsupported', trackId: null }
  }

  const normalized = normalizeGoalFirstGoal(normalizedGoal)
  const classification = classifyGoalDomains(normalized)
  const intentId = classification.primary ?? 'unsupported'
  const trackId =
    isMvpEnabledDomainSlug(intentId) ? (DOMAIN_TO_TRACK_ID[intentId] ?? null) : null

  return { intentId, trackId }
}

export function normalizePlannerGoal(goal: string) {
  return normalizeGoal(goal)
}
