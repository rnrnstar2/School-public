import { z } from 'zod/v4'

import {
  ActionLessonMappingSchema,
  type ActionLessonMapping,
} from '@school/goal-action-matcher'

import { DEFAULT_THRESHOLDS } from './defaults'
import {
  GapEvidenceSchema,
  GapReasonSchema,
  GapThresholdsInputSchema,
  LessonGapSchema,
  type GapAxis,
  type GapReason,
  type GapThresholds,
  type GapThresholdsInput,
  type LessonGap,
} from './schema'

const GAP_AXIS_ORDER: readonly GapAxis[] = [
  'capability',
  'prerequisite',
  'blocker',
  'evidence',
]

const DetectGapsInputSchema = z
  .object({
    mappings: z.array(ActionLessonMappingSchema),
    thresholds: GapThresholdsInputSchema.optional(),
    now: z.string().min(1).optional(),
  })
  .strict()

export type DetectGapsInput = {
  mappings: ActionLessonMapping[]
  thresholds?: GapThresholdsInput
  /** Optional ISO timestamp override for deterministic callers. Omit to use the current time. */
  now?: string
}

function roundScore(value: number) {
  return Math.round(value * 1_000) / 1_000
}

function compareMappings(left: ActionLessonMapping, right: ActionLessonMapping) {
  const goalOrder = (left.goalId ?? '').localeCompare(right.goalId ?? '', 'en')
  if (goalOrder !== 0) {
    return goalOrder
  }

  const actionOrder = left.action.actionId.localeCompare(
    right.action.actionId,
    'en',
  )
  if (actionOrder !== 0) {
    return actionOrder
  }

  if (left.rank !== right.rank) {
    return left.rank - right.rank
  }

  if (left.score !== right.score) {
    return right.score - left.score
  }

  const lessonOrder = left.lesson.id.localeCompare(right.lesson.id, 'en')
  if (lessonOrder !== 0) {
    return lessonOrder
  }

  return left.lesson.source_path.localeCompare(right.lesson.source_path, 'en')
}

function toGapGroupKey(mapping: ActionLessonMapping) {
  return `${mapping.goalId ?? ''}|${mapping.action.actionId}`
}

function resolveThresholds(overrides?: GapThresholdsInput): GapThresholds {
  return {
    capability: overrides?.capability ?? DEFAULT_THRESHOLDS.capability,
    prerequisite: overrides?.prerequisite ?? DEFAULT_THRESHOLDS.prerequisite,
    blocker: overrides?.blocker ?? DEFAULT_THRESHOLDS.blocker,
    evidence: overrides?.evidence ?? DEFAULT_THRESHOLDS.evidence,
  }
}

function toBlockerGapScore(blockerSupportScore: number) {
  return roundScore(1 - blockerSupportScore)
}

function collectFailures(
  thresholds: GapThresholds,
  scores: Record<GapAxis, number>,
) {
  const failures: GapReason[] = []

  for (const axis of GAP_AXIS_ORDER) {
    const score = scores[axis]
    const threshold = thresholds[axis]

    if (axis === 'blocker') {
      if (score <= threshold) {
        continue
      }

      failures.push(
        GapReasonSchema.parse({
          axis,
          score,
          threshold,
          delta: roundScore(score - threshold),
          comparator: 'lte',
        }),
      )
      continue
    }

    if (score >= threshold) {
      continue
    }

    failures.push(
      GapReasonSchema.parse({
        axis,
        score,
        threshold,
        delta: roundScore(threshold - score),
        comparator: 'gte',
      }),
    )
  }

  return failures
}

function pickWeakestAxis(failures: readonly GapReason[]) {
  let weakest = failures[0]

  for (const failure of failures.slice(1)) {
    if (!weakest) {
      weakest = failure
      continue
    }

    if (failure.delta > weakest.delta) {
      weakest = failure
      continue
    }

    if (failure.delta === weakest.delta) {
      const failureOrder = GAP_AXIS_ORDER.indexOf(failure.axis)
      const weakestOrder = GAP_AXIS_ORDER.indexOf(weakest.axis)
      if (failureOrder < weakestOrder) {
        weakest = failure
      }
    }
  }

  return weakest!.axis
}

export function detectGaps(input: DetectGapsInput): LessonGap[] {
  const parsed = DetectGapsInputSchema.parse(input)
  const thresholds = resolveThresholds(parsed.thresholds)
  const detectedAt = parsed.now ?? new Date().toISOString()

  const groupedMappings = new Map<string, ActionLessonMapping[]>()
  for (const mapping of [...parsed.mappings].sort(compareMappings)) {
    const gapGroupKey = toGapGroupKey(mapping)
    const actionMappings = groupedMappings.get(gapGroupKey)
    if (actionMappings) {
      actionMappings.push(mapping)
      continue
    }

    groupedMappings.set(gapGroupKey, [mapping])
  }

  const gaps: LessonGap[] = []

  for (const actionId of [...groupedMappings.keys()].sort((left, right) =>
    left.localeCompare(right, 'en'),
  )) {
    const actionMappings = groupedMappings.get(actionId)
    if (!actionMappings || actionMappings.length === 0) {
      continue
    }

    const topMappings = actionMappings.slice(0, 3)
    const bestMapping = topMappings[0]
    if (!bestMapping) {
      continue
    }

    const axisScores: Record<GapAxis, number> = {
      capability: roundScore(bestMapping.breakdown.capability),
      prerequisite: roundScore(bestMapping.breakdown.prerequisite),
      blocker: toBlockerGapScore(bestMapping.breakdown.blocker),
      evidence: roundScore(bestMapping.breakdown.evidence),
    }

    const failures = collectFailures(thresholds, axisScores)
    if (failures.length === 0) {
      continue
    }

    const weakestAxis = pickWeakestAxis(failures)
    const evidence = GapEvidenceSchema.parse({
      canonicalAction: bestMapping.action,
      weakestAxis,
      topMappings,
      failingAxes: failures.map((failure) => failure.axis),
      reasons: failures,
      thresholds,
    })

    gaps.push(
      LessonGapSchema.parse({
        actionId: bestMapping.action.actionId,
        goalId: bestMapping.goalId ?? null,
        weakestAxis,
        score: roundScore(bestMapping.score),
        capabilityScore: axisScores.capability,
        prerequisiteScore: axisScores.prerequisite,
        blockerScore: axisScores.blocker,
        evidenceScore: axisScores.evidence,
        evidence,
        topMappings,
        status: 'open',
        detectedAt,
        updatedAt: detectedAt,
        metadata: {},
      }),
    )
  }

  return gaps
}
