/**
 * Goal-First Planner — Entry Point
 *
 * Orchestrates the goal-first planning pipeline:
 *   normalize -> classify -> compile
 *
 * This is the single entry point that replaces the old
 * regex-based track detection + continuation wrapper flow.
 *
 * @module goal-first
 */

import type { LearnerProfile, LearnerState } from '@/types'
import { normalizeGoal, normalizeGoalWithAI } from './goal-normalizer'
import { classifyGoalDomains, classifyGoalDomainsWithAI } from './domain-classifier'
import {
  compilePlan,
  compilePlanWithAI,
  compilePlanDeterministicFallback,
} from './plan-compiler'
import { resolveNextAction } from './next-action-resolver'
import type {
  CompiledPlan,
  NextAction,
  NormalizedGoal,
  DomainClassification,
  LearnerCapabilityState,
  PlannerDataClient,
} from './types'

// Re-export all public types
export type {
  AtomCompiledPlan,
  AtomPlanCompilerInput,
  AtomPlanMilestone,
  AtomPlanStep,
} from './plan-compiler'

export type {
  NormalizedGoal,
  DomainClassification,
  DomainScore,
  LessonCandidate,
  LearnerCapabilityState,
  CandidateQuery,
  CompiledPlan,
  CompiledMilestone,
  CompiledPlanNode,
  GapTask,
  NextAction,
  PlannerDataClient,
  PlanCompileParams,
} from './types'

// Re-export stage functions for direct use
export { normalizeGoal, normalizeGoalWithAI } from './goal-normalizer'
export { classifyGoalDomains, classifyGoalDomainsWithAI, DOMAIN_SIGNALS } from './domain-classifier'
export { retrieveLessonCandidates } from './candidate-retriever'
export {
  buildAtomPlan,
  buildAtomPlanFromGoal,
  compilePlan,
  compilePlanWithAI,
  compilePlanDeterministicFallback,
} from './plan-compiler'
export { buildAtomPlanFromGoalWithAI } from './ai-atom-compiler'
export {
  buildAtomPlanFromGoalCached,
  type BuildAtomPlanFromGoalCachedInput,
  type CachedAtomPlanResult,
} from './plan-cache'
export {
  computePlanSeed,
  computePlanSeedFromGoalInput,
  computePlanSeedFromCompilerInput,
  canonicalizePlanSeedInput,
  type PlanSeedInput,
} from './plan-seed'
export { retrieveAndRerankCandidates } from './candidate-retriever'
export { resolveNextAction } from './next-action-resolver'

async function loadLearnerCapabilityState(
  client: PlannerDataClient | null | undefined,
  userId: string | null | undefined,
): Promise<LearnerCapabilityState[]> {
  if (!client || !userId) {
    return []
  }

  try {
    const { data: stateRows, error: stateError } = await client
      .from('capability_state_vw' as never)
      .select('capability_id, latest_score, latest_assessed_at')
      .eq('user_id', userId)

    if (stateError || !stateRows || stateRows.length === 0) {
      return []
    }

    const typedStateRows = stateRows as Array<{
      capability_id: string | null
      latest_score: number | null
      latest_assessed_at: string | null
    }>

    const capabilityIds = Array.from(
      new Set(
        typedStateRows
          .map((row) => row.capability_id)
          .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
      ),
    )

    if (capabilityIds.length === 0) {
      return []
    }

    const { data: capabilityRows, error: capabilityError } = await client
      .from('capabilities' as never)
      .select('id, slug')
      .in('id', capabilityIds)

    if (capabilityError || !capabilityRows) {
      return []
    }

    const capabilitySlugById = new Map(
      (capabilityRows as Array<{ id: string; slug: string | null }>)
        .filter((row) => typeof row.slug === 'string' && row.slug.trim().length > 0)
        .map((row) => [row.id, row.slug!.trim()]),
    )

    return typedStateRows.flatMap((row) => {
      if (!row.capability_id) return []
      const capabilitySlug = capabilitySlugById.get(row.capability_id)
      if (!capabilitySlug) return []

      return [{
        capabilitySlug,
        latestScore: row.latest_score ?? 0,
        latestAssessedAt: row.latest_assessed_at ?? null,
      }]
    })
  } catch {
    return []
  }
}

/**
 * Build a goal-first learning plan.
 *
 * Orchestrates the full pipeline:
 * 1. **Normalize** — clean goal text, extract tool mentions, deadlines, domains
 * 2. **Classify** — score goal against domain signals, pick primary domain
 * 3. **Compile** — retrieve lesson candidates, sort by prerequisites, group into milestones
 *
 * @param goal - Raw goal text from the learner (Japanese or English)
 * @param learnerProfile - The learner's profile (tools, OS, experience)
 * @param learnerState - Current learning state (skill level, active track, blockers)
 * @param completedLessonIds - IDs of lessons the learner has already finished
 * @returns CompiledPlan ready for rendering or persistence
 *
 * @example
 * ```ts
 * const plan = await buildGoalFirstPlan(
 *   'AIを使ってポートフォリオサイトを作りたい',
 *   learnerProfile,
 *   learnerState,
 *   ['lesson_web_builder_010']
 * )
 * ```
 */
export async function buildGoalFirstPlan(
  goal: string,
  learnerProfile: LearnerProfile,
  learnerState: LearnerState,
  completedLessonIds: string[],
  options?: {
    client?: PlannerDataClient | null
    preferredTools?: string[]
    toolProfile?: string
  },
): Promise<CompiledPlan> {
  // Stage 1: Normalize
  const normalizedGoal = normalizeGoal(goal)

  // Stage 2: Classify domains
  const domains = classifyGoalDomains(normalizedGoal)

  // Stage 3: Compile plan
  const plan = await compilePlan({
    client: options?.client,
    goal: normalizedGoal,
    domains,
    learnerProfile,
    learnerState,
    completedLessonIds,
    preferredTools:
      options?.preferredTools && options.preferredTools.length > 0
        ? options.preferredTools
        : learnerProfile.available_ai_tools,
    toolProfile:
      options?.toolProfile ??
      options?.preferredTools?.[0] ??
      learnerProfile.available_ai_tools[0],
  })

  return plan
}

/**
 * Build a plan and immediately resolve the next action.
 *
 * Convenience function that chains buildGoalFirstPlan + resolveNextAction.
 *
 * @param goal - Raw goal text
 * @param learnerProfile - Learner profile
 * @param learnerState - Current state
 * @param completedLessonIds - Already-completed lesson IDs
 * @param completedNodeIds - Already-completed plan node IDs
 * @returns Object with plan and next action
 */
/**
 * AI-driven variant of {@link buildGoalFirstPlan}.
 *
 * Uses {@link normalizeGoalWithAI} + {@link classifyGoalDomainsWithAI}
 * to produce richer, personalized analysis before handing off to the
 * deterministic compiler. If either AI call fails, the underlying
 * functions transparently fall back to the deterministic implementations,
 * so this function always returns a valid {@link CompiledPlan}.
 *
 * @param goal - Raw goal text from the learner
 * @param learnerProfile - The learner's profile
 * @param learnerState - Current learning state
 * @param completedLessonIds - IDs of finished lessons
 * @param options - Optional AI model override and AbortSignal
 * @returns {@link CompiledPlan} ready for rendering or persistence
 */
export async function buildGoalFirstPlanWithAI(
  goal: string,
  learnerProfile: LearnerProfile,
  learnerState: LearnerState,
  completedLessonIds: string[],
  options?: {
    model?: string
    signal?: AbortSignal
    mentorMemories?: string[]
    blockers?: string[]
    weaknesses?: string[]
    recentFeedback?: string[]
    learningStyle?: string | null
    stuckPatterns?: string[]
    negativeFeedback?: string[]
    toolProfile?: string
    preferredTools?: string[]
    client?: PlannerDataClient | null
  },
): Promise<CompiledPlan> {
  try {
    // Stage 1: AI normalize (falls back internally)
    let normalizedGoal: NormalizedGoal
    try {
      normalizedGoal = await normalizeGoalWithAI(goal, options)
    } catch (error) {
      console.warn('[buildGoalFirstPlanWithAI] normalize failed, using deterministic:', error)
      normalizedGoal = normalizeGoal(goal)
    }

    // Stage 2: AI classify (falls back internally)
    let domains: DomainClassification
    try {
      domains = await classifyGoalDomainsWithAI(normalizedGoal, options)
    } catch (error) {
      console.warn('[buildGoalFirstPlanWithAI] classify failed, using deterministic:', error)
      domains = classifyGoalDomains(normalizedGoal)
    }

    const learnerCapabilityState = await loadLearnerCapabilityState(
      options?.client,
      learnerProfile.user_id ?? null,
    )

    const resolvedPreferredTools =
      options?.preferredTools && options.preferredTools.length > 0
        ? options.preferredTools
        : learnerProfile?.available_ai_tools?.length
          ? learnerProfile.available_ai_tools
          : options?.toolProfile
            ? [options.toolProfile]
            : undefined

    const resolvedToolProfile =
      options?.toolProfile || resolvedPreferredTools?.[0] || undefined

    // Stage 3: AI compile (falls back internally)
    return await compilePlanWithAI(
      {
        client: options?.client,
        goal: normalizedGoal,
        domains,
        learnerProfile,
        learnerState,
        completedLessonIds,
        learnerCapabilityState,
        preferredTools: resolvedPreferredTools,
        toolProfile: resolvedToolProfile,
        mentorMemories: options?.mentorMemories,
        blockers: options?.blockers,
        weaknesses: options?.weaknesses,
        recentFeedback: options?.recentFeedback,
        learningStyle: options?.learningStyle,
        stuckPatterns: options?.stuckPatterns,
        negativeFeedback: options?.negativeFeedback,
      },
    )
  } catch (error) {
    console.warn('[buildGoalFirstPlanWithAI] fatal, using full deterministic pipeline:', error)
    const normalizedGoal = normalizeGoal(goal)
    const domains = classifyGoalDomains(normalizedGoal)
    return await compilePlanDeterministicFallback({
      client: options?.client,
      goal: normalizedGoal,
      domains,
      learnerProfile,
      learnerState,
      completedLessonIds,
      learnerCapabilityState: await loadLearnerCapabilityState(
        options?.client,
        learnerProfile.user_id ?? null,
      ),
      preferredTools: learnerProfile.available_ai_tools,
      toolProfile: learnerProfile.available_ai_tools[0],
    })
  }
}

export async function buildGoalFirstPlanWithNextAction(
  goal: string,
  learnerProfile: LearnerProfile,
  learnerState: LearnerState,
  completedLessonIds: string[],
  completedNodeIds: string[] = [],
  options?: {
    client?: PlannerDataClient | null
    preferredTools?: string[]
    toolProfile?: string
  },
): Promise<{ plan: CompiledPlan; nextAction: NextAction }> {
  const plan = await buildGoalFirstPlan(
    goal,
    learnerProfile,
    learnerState,
    completedLessonIds,
    options,
  )
  const nextAction = resolveNextAction(plan, completedNodeIds)

  return { plan, nextAction }
}
