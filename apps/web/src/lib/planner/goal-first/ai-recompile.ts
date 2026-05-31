import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import {
  getCompiledPlanRecord,
  getLatestActiveCompiledPlan,
  persistCompiledPlanSnapshot,
} from '@/lib/compiled-plans'
import { emitTelemetryEvent } from '@/lib/telemetry'
import type { buildAtomPlanFromGoal } from './plan-compiler'
import { buildAtomPlanFromGoalCached } from './plan-cache'

type Client = SupabaseClient<Database>

const NEGATIVE_FEEDBACK_THRESHOLD = 3
const NEGATIVE_FEEDBACK_WINDOW_DAYS = 7
const NEGATIVE_DIFFICULTY_MIN = 4
const NEGATIVE_CLARITY_MAX = 2

const BLOCKERS_THRESHOLD = 3
const BLOCKERS_WINDOW_DAYS = 7

export interface RecompileTrigger {
  reason:
    | 'blockers_accumulated'
    | 'stuck_reported'
    | 'negative_feedback'
    | 'manual'
  context: {
    blockedNodeIds: string[]
    stuckSummary?: string
    negativeFeedbackRate?: number
    userMessage?: string
    feedbackSummary?: string
  }
}

export interface RecompileResult {
  newPlan: Awaited<ReturnType<typeof buildAtomPlanFromGoal>>
  planId: string | null
  parentPlanId: string | null
  revisionId: string | null
  changes: {
    removedNodeIds: string[]
    addedNodeIds: string[]
    reorderedNodeIds: string[]
    rationale: string
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]))
}

function buildLearnerState(trigger: RecompileTrigger) {
  return {
    blockers: uniqueStrings([
      trigger.context.stuckSummary,
      trigger.context.userMessage,
      trigger.context.feedbackSummary,
      ...(trigger.context.blockedNodeIds ?? []),
    ]),
    signals: {
      recompile_reason: trigger.reason,
      negative_feedback_rate: trigger.context.negativeFeedbackRate ?? null,
    },
  }
}

function diffPlanAtomIds(params: {
  previousAtomIds: string[]
  nextAtomIds: string[]
}) {
  const previousIndexById = new Map(params.previousAtomIds.map((atomId, index) => [atomId, index]))
  const nextIndexById = new Map(params.nextAtomIds.map((atomId, index) => [atomId, index]))

  return {
    removedNodeIds: params.previousAtomIds.filter((atomId) => !nextIndexById.has(atomId)),
    addedNodeIds: params.nextAtomIds.filter((atomId) => !previousIndexById.has(atomId)),
    reorderedNodeIds: params.nextAtomIds.filter((atomId) => {
      const previousIndex = previousIndexById.get(atomId)
      const nextIndex = nextIndexById.get(atomId)
      return typeof previousIndex === 'number' && typeof nextIndex === 'number' && previousIndex !== nextIndex
    }),
  }
}

export function extractPlanningDomainSlugs(params: {
  goalRow:
    | {
        structured_intent?: unknown
        domain_ids?: string[] | null
      }
    | null
    | undefined
  domains: Array<{ id: string; slug: string }>
}): string[] {
  const structuredIntent = params.goalRow?.structured_intent as
    | { implied_domains?: unknown; primary_domain?: unknown }
    | null
    | undefined
  const primaryDomainSlug =
    typeof structuredIntent?.primary_domain === 'string'
      ? structuredIntent.primary_domain.trim()
      : ''
  const impliedDomainSlugs = Array.isArray(structuredIntent?.implied_domains)
    ? Array.from(
        new Set(
          structuredIntent.implied_domains
            .filter((domain): domain is string => typeof domain === 'string')
            .map((domain) => domain.trim())
            .filter(Boolean),
        ),
      )
    : []

  if (impliedDomainSlugs.length > 0) {
    return Array.from(new Set([primaryDomainSlug, ...impliedDomainSlugs].filter(Boolean)))
  }

  const slugByDomainId = new Map(params.domains.map((domain) => [domain.id, domain.slug]))
  return Array.from(
    new Set(
      (params.goalRow?.domain_ids ?? [])
        .map((domainId) => slugByDomainId.get(domainId))
        .filter((domainSlug): domainSlug is string => Boolean(domainSlug)),
    ),
  )
}

export function resolvePlanningDomainSlugsFromGoalRow(params: {
  goalRow:
    | {
        structured_intent?: unknown
        domain_ids?: string[] | null
      }
    | null
    | undefined
  domains: Array<{ id: string; slug: string }>
}): string[] {
  return extractPlanningDomainSlugs(params)
}

export async function recompilePlanWithAI(params: {
  client: Client
  userId: string
  currentPlanId: string
  trigger: RecompileTrigger
  goal?: string | null
  goalTags?: string[]
  personaIds?: string[]
  requestId?: string | null
}): Promise<RecompileResult | null> {
  const currentPlan = await getCompiledPlanRecord({
    userId: params.userId,
    planId: params.currentPlanId,
    client: params.client,
  })

  if (!currentPlan) {
    return null
  }

  const nextGoal = params.goal?.trim() || currentPlan.goal
  const completedAtomIds = currentPlan.plan.steps
    .filter((step) => step.completedAt)
    .map((step) => step.atomId)
  const personaIds = uniqueStrings([
    ...(params.personaIds ?? []),
    currentPlan.personaId,
  ])

  const cachedResult = await buildAtomPlanFromGoalCached({
    goal: nextGoal,
    goalTags: params.goalTags,
    personaIds: personaIds.length > 0 ? personaIds : undefined,
    userId: params.userId,
    completedAtomIds,
    learnerState: buildLearnerState(params.trigger),
  }).catch(() => null)

  if (!cachedResult) {
    return null
  }

  const newPlan = cachedResult.plan

  const diff = diffPlanAtomIds({
    previousAtomIds: currentPlan.plan.steps.map((step) => step.atomId),
    nextAtomIds: newPlan.steps.map((step) => step.atomId),
  })

  const persisted = await persistCompiledPlanSnapshot({
    client: params.client,
    userId: params.userId,
    goal: nextGoal,
    plan: newPlan,
    planSeed: cachedResult.seed,
    personaId: personaIds[0] ?? currentPlan.personaId ?? null,
    parentPlanId: currentPlan.planId,
    supersedePlanIds: [currentPlan.planId],
    status: 'active',
  })

  if (!persisted.synced || !persisted.planId) {
    return null
  }

  await emitTelemetryEvent({
    userId: params.userId,
    eventName: 'plan_revised',
    planId: persisted.planId,
    requestId: params.requestId ?? null,
    properties: {
      parent_plan_id: currentPlan.planId,
      reason: params.trigger.reason,
      previous_goal: currentPlan.goal,
      next_goal: nextGoal,
      removed_atom_ids: diff.removedNodeIds,
      added_atom_ids: diff.addedNodeIds,
      reordered_atom_ids: diff.reorderedNodeIds,
      source: 'ai_recompile',
    },
  }).catch(() => undefined)

  return {
    newPlan,
    planId: persisted.planId,
    parentPlanId: persisted.parentPlanId,
    revisionId: persisted.planId,
    changes: {
      ...diff,
      rationale: newPlan.rationale,
    },
  }
}

export async function checkAndTriggerNegativeFeedbackRecompile(params: {
  client: Client
  userId: string
  requestId?: string | null
}): Promise<RecompileResult | null> {
  const activePlan = await getLatestActiveCompiledPlan({
    userId: params.userId,
    client: params.client,
  })

  if (!activePlan) {
    return null
  }

  const since = new Date(
    Date.now() - NEGATIVE_FEEDBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const currentPlan = await getCompiledPlanRecord({
    userId: params.userId,
    planId: activePlan.planId,
    client: params.client,
  })

  if (!currentPlan) {
    return null
  }

  const activeAtomIds = currentPlan.plan.steps.map((step) => step.atomId)

  if (activeAtomIds.length === 0) {
    return null
  }

  const { data: feedbackRows } = await params.client
    .from('lesson_feedback')
    .select('difficulty_rating, clarity_rating, created_at, lesson_id')
    .eq('user_id', params.userId)
    .in('lesson_id', activeAtomIds)
    .gte('created_at', since)

  const negativeFeedback = ((feedbackRows ?? []) as Array<{
    difficulty_rating: number | null
    clarity_rating: number | null
    lesson_id: string | null
  }>).filter(
    (row) =>
      (row.difficulty_rating != null && row.difficulty_rating >= NEGATIVE_DIFFICULTY_MIN) ||
      (row.clarity_rating != null && row.clarity_rating <= NEGATIVE_CLARITY_MAX),
  )

  if (negativeFeedback.length < NEGATIVE_FEEDBACK_THRESHOLD) {
    return null
  }

  return recompilePlanWithAI({
    client: params.client,
    userId: params.userId,
    currentPlanId: activePlan.planId,
    requestId: params.requestId ?? null,
    trigger: {
      reason: 'negative_feedback',
      context: {
        blockedNodeIds: [],
        negativeFeedbackRate: negativeFeedback.length,
        feedbackSummary: `negative feedback: ${negativeFeedback
          .map((row) => row.lesson_id)
          .filter(Boolean)
          .join(', ')}`,
      },
    },
  })
}

export async function checkAndTriggerBlockersRecompile(params: {
  client: Client
  userId: string
  requestId?: string | null
}): Promise<RecompileResult | null> {
  try {
    const activePlan = await getLatestActiveCompiledPlan({
      userId: params.userId,
      client: params.client,
    })

    if (!activePlan) {
      return null
    }

    const since = new Date(
      Date.now() - BLOCKERS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString()

    const { data: blockedRows } = await params.client
      .from('task_progress')
      .select('task_id')
      .eq('plan_id', activePlan.planId)
      .eq('status', 'blocked')
      .gte('updated_at', since)

    const blockedTaskIds = ((blockedRows ?? []) as Array<{ task_id: string | null }>)
      .map((row) => row.task_id)
      .filter((taskId): taskId is string => Boolean(taskId))

    if (blockedTaskIds.length < BLOCKERS_THRESHOLD) {
      return null
    }

    return await recompilePlanWithAI({
      client: params.client,
      userId: params.userId,
      currentPlanId: activePlan.planId,
      requestId: params.requestId ?? null,
      trigger: {
        reason: 'blockers_accumulated',
        context: {
          blockedNodeIds: blockedTaskIds,
        },
      },
    })
  } catch {
    return null
  }
}
