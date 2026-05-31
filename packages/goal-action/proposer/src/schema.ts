import { z } from 'zod/v4'

export const ProposalPrioritySchema = z.enum(['high', 'mid', 'low'])
export type ProposalPriority = z.infer<typeof ProposalPrioritySchema>

export const ProposalStatusSchema = z.enum([
  'proposed',
  'approved',
  'reserved',
  'rejected',
  'in_factory',
  'addressed',
  'cancelled',
])
export type ProposalStatus = z.infer<typeof ProposalStatusSchema>

export const WeakestAxisSchema = z.enum([
  'capability',
  'prerequisite',
  'blocker',
  'evidence',
])
export type WeakestAxis = z.infer<typeof WeakestAxisSchema>

export const ProposalEvidenceSchema = z
  .object({
    gapIds: z.array(z.string().uuid()),
    weakestAxes: z.record(z.string(), z.number().int().min(1)),
    candidateLessons: z.array(z.string()).default([]),
    gapSummaries: z
      .array(
        z.object({
          actionId: z.string(),
          weakestAxis: WeakestAxisSchema,
          score: z.number(),
          blockerScore: z.number().nullable().default(null),
        }),
      )
      .default([]),
  })
  .strict()
export type ProposalEvidence = z.infer<typeof ProposalEvidenceSchema>

export const LessonDevProposalSchema = z
  .object({
    capabilitySlug: z.string().min(1),
    outcomeSlug: z.string().min(1).default('general'),
    priority: ProposalPrioritySchema,
    status: ProposalStatusSchema.default('proposed'),
    gapIds: z.array(z.string().uuid()),
    weakestAxis: WeakestAxisSchema,
    evidence: ProposalEvidenceSchema,
    candidateLessonSlug: z.string().nullable().default(null),
    rationale: z.string().nullable().default(null),
    proposedBy: z.string().default('ai'),
    proposedAt: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
export type LessonDevProposal = z.infer<typeof LessonDevProposalSchema>

export const CurriculumArchitectureSchema = z
  .object({
    lessonSlugs: z.array(z.string()),
  })
  .strict()
export type CurriculumArchitecture = z.infer<
  typeof CurriculumArchitectureSchema
>

export const GenerateProposalsOptionsSchema = z
  .object({
    gaps: z.array(z.unknown()).min(1),
    curriculumArchitecture: CurriculumArchitectureSchema.optional(),
    now: z.string().optional(),
  })
  .strict()
export type GenerateProposalsOptions = z.infer<
  typeof GenerateProposalsOptionsSchema
>
