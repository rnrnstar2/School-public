import { LessonGapSchema, type LessonGap } from '@school/goal-action-gaps'
import { z } from 'zod/v4'

import { dedup } from './dedup'
import type {
  CurriculumArchitecture,
  LessonDevProposal,
} from './schema'

const GapsArraySchema = z.array(LessonGapSchema).min(1)

export type GenerateProposalsInput = {
  gaps: LessonGap[]
  curriculumArchitecture?: CurriculumArchitecture
  now?: string
}

/**
 * Generate lesson dev proposals from detected gaps.
 *
 * Deterministic: same input always produces the same output.
 * No LLM calls — pure computation.
 *
 * Steps:
 * 1. Validate input gaps
 * 2. Dedup by (capabilitySlug, outcomeSlug)
 * 3. Assign priority per spec rules
 * 4. Return sorted proposals (high → mid → low, then alphabetical)
 */
export function generateProposals(
  input: GenerateProposalsInput,
): LessonDevProposal[] {
  const parsed = GapsArraySchema.parse(input.gaps)
  const proposals = dedup(parsed, input.curriculumArchitecture, input.now)

  // Sort: high first, then mid, then low; within same priority alphabetical by capabilitySlug
  const priorityOrder: Record<string, number> = { high: 0, mid: 1, low: 2 }

  return proposals.sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 2
    const pb = priorityOrder[b.priority] ?? 2
    if (pa !== pb) return pa - pb
    const ca = a.capabilitySlug.localeCompare(b.capabilitySlug)
    if (ca !== 0) return ca
    return a.outcomeSlug.localeCompare(b.outcomeSlug)
  })
}
