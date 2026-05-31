import { z } from 'zod/v4'

/**
 * Rubric thresholds mirrored from `eval-datasets/goal-action/v0/rubric.md`.
 *
 * These numeric literals are the single source of truth for the code path.
 * `rubric.test.ts` parses the prose rubric at test time and asserts that the
 * numbers here stay in sync — if the prose changes, that test fails first.
 */
export const RubricThresholdsSchema = z
  .object({
    matcher: z
      .object({
        precision: z.number().min(0).max(1),
        recallAt3: z.number().min(0).max(1),
      })
      .strict(),
    gap: z
      .object({
        precision: z.number().min(0).max(1),
        recall: z.number().min(0).max(1),
      })
      .strict(),
    proposer: z
      .object({
        agreement: z.number().min(0).max(1),
      })
      .strict(),
    actionNormalization: z
      .object({
        precision: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict()

export type RubricThresholds = z.infer<typeof RubricThresholdsSchema>

export const defaultRubric: RubricThresholds = {
  actionNormalization: {
    precision: 0.9,
  },
  matcher: {
    precision: 0.7,
    recallAt3: 0.8,
  },
  gap: {
    precision: 0.8,
    recall: 0.6,
  },
  proposer: {
    agreement: 0.7,
  },
}

export const RUBRIC_REF = 'eval-datasets/goal-action/v0/rubric.md'
