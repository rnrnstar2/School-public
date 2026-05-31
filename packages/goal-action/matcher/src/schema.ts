import { z } from 'zod/v4'

import { CoverageIndexSchema, LessonNodeSchema } from '@school/goal-action-coverage'
import { CanonicalActionSchema } from '@school/goal-action-normalizer'

const UnitIntervalSchema = z.number().min(0).max(1)

function sumsToOne(value: {
  capability: number
  prerequisite: number
  blocker: number
  evidence: number
}) {
  const sum =
    value.capability +
    value.prerequisite +
    value.blocker +
    value.evidence

  return Math.abs(sum - 1) <= 1e-6
}

export const MatchScoreSchema = z
  .object({
    capability: UnitIntervalSchema,
    prerequisite: UnitIntervalSchema,
    blocker: UnitIntervalSchema,
    evidence: UnitIntervalSchema,
  })
  .strict()
export type MatchScore = z.infer<typeof MatchScoreSchema>

const MatchWeightsShapeSchema = z
  .object({
    capability: UnitIntervalSchema,
    prerequisite: UnitIntervalSchema,
    blocker: UnitIntervalSchema,
    evidence: UnitIntervalSchema,
  })
  .strict()

export const MatchWeightsSchema = MatchWeightsShapeSchema.refine(sumsToOne, {
  message: 'match weights must sum to 1.0',
})
export type MatchWeights = z.infer<typeof MatchWeightsSchema>

export const MatchWeightsInputSchema = MatchWeightsShapeSchema.partial()
export type MatchWeightsInput = z.infer<typeof MatchWeightsInputSchema>

export const ActionLessonMappingSchema = z
  .object({
    action: CanonicalActionSchema,
    goalId: z.string().uuid().nullable().optional(),
    lesson: LessonNodeSchema,
    score: UnitIntervalSchema,
    breakdown: MatchScoreSchema,
    rank: z.number().int().positive(),
  })
  .strict()
export type ActionLessonMapping = z.infer<typeof ActionLessonMappingSchema>

export const MatchActionsInputSchema = z
  .object({
    actions: z.array(CanonicalActionSchema),
    coverageIndex: CoverageIndexSchema,
    weights: MatchWeightsInputSchema.optional(),
    topK: z.number().int().positive().optional(),
  })
  .strict()
export type MatchActionsInput = z.infer<typeof MatchActionsInputSchema>
