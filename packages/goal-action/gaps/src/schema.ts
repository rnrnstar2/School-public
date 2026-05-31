import { z } from 'zod/v4'

import {
  ActionLessonMappingSchema,
  type ActionLessonMapping,
} from '@school/goal-action-matcher'

const UnitIntervalSchema = z.number().min(0).max(1)
const CanonicalActionSchema = ActionLessonMappingSchema.shape.action

export const GapAxisSchema = z.enum([
  'capability',
  'prerequisite',
  'blocker',
  'evidence',
])
export type GapAxis = z.infer<typeof GapAxisSchema>

export const GapThresholdsSchema = z
  .object({
    capability: UnitIntervalSchema,
    prerequisite: UnitIntervalSchema,
    blocker: UnitIntervalSchema,
    evidence: UnitIntervalSchema,
  })
  .strict()
export type GapThresholds = z.infer<typeof GapThresholdsSchema>

export const GapThresholdsInputSchema = GapThresholdsSchema.partial()
export type GapThresholdsInput = z.infer<typeof GapThresholdsInputSchema>

export const GapReasonComparatorSchema = z.enum(['gte', 'lte'])
export type GapReasonComparator = z.infer<typeof GapReasonComparatorSchema>

export const GapReasonSchema = z
  .object({
    axis: GapAxisSchema,
    score: UnitIntervalSchema,
    threshold: UnitIntervalSchema,
    delta: UnitIntervalSchema,
    comparator: GapReasonComparatorSchema,
  })
  .strict()
export type GapReason = z.infer<typeof GapReasonSchema>

export const GapEvidenceSchema = z
  .object({
    canonicalAction: CanonicalActionSchema,
    weakestAxis: GapAxisSchema,
    topMappings: z.array(ActionLessonMappingSchema).max(3),
    failingAxes: z.array(GapAxisSchema).min(1),
    reasons: z.array(GapReasonSchema).min(1),
    thresholds: GapThresholdsSchema,
  })
  .strict()
export type GapEvidence = z.infer<typeof GapEvidenceSchema>

export const LessonGapStatusSchema = z.enum([
  'open',
  'proposed',
  'addressed',
  'dismissed',
])
export type LessonGapStatus = z.infer<typeof LessonGapStatusSchema>

export const LessonGapSchema = z
  .object({
    actionId: z.string().min(1),
    goalId: z.string().uuid().nullable().default(null),
    weakestAxis: GapAxisSchema,
    score: UnitIntervalSchema,
    capabilityScore: UnitIntervalSchema,
    prerequisiteScore: UnitIntervalSchema,
    blockerScore: UnitIntervalSchema,
    evidenceScore: UnitIntervalSchema,
    evidence: GapEvidenceSchema,
    topMappings: z.array(ActionLessonMappingSchema).max(3),
    status: LessonGapStatusSchema.default('open'),
    detectedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
export type LessonGap = z.infer<typeof LessonGapSchema>

export type GapCanonicalAction = ActionLessonMapping['action']
export type GapTopMapping = ActionLessonMapping
