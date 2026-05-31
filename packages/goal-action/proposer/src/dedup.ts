import type { LessonGap } from '@school/goal-action-gaps'

import { determinePriority, highestPriority } from './priority'
import type {
  CurriculumArchitecture,
  LessonDevProposal,
  ProposalEvidence,
  WeakestAxis,
} from './schema'

type GapGroup = {
  capabilitySlug: string
  outcomeSlug: string
  gaps: LessonGap[]
}

/**
 * Extract capability slug from a gap's evidence.canonicalAction.
 * Falls back to actionId if canonicalAction is missing.
 */
function getCapabilitySlug(gap: LessonGap): string {
  const ca = gap.evidence?.canonicalAction
  if (ca && typeof ca === 'object' && 'capability' in ca) {
    return (ca as { capability: string }).capability
  }
  return gap.actionId
}

/**
 * Extract outcome slug from gap metadata or default to 'general'.
 */
function getOutcomeSlug(gap: LessonGap): string {
  const ca = gap.evidence?.canonicalAction
  if (ca && typeof ca === 'object' && 'outcome' in ca) {
    const outcome = (ca as { outcome: string }).outcome
    if (outcome) return outcome
  }
  const meta = gap.metadata as Record<string, unknown> | undefined
  if (meta && typeof meta['outcomeSlug'] === 'string' && meta['outcomeSlug']) {
    return meta['outcomeSlug'] as string
  }
  return 'general'
}

/**
 * Group gaps by (capabilitySlug, outcomeSlug).
 * Deterministic: sorted by composite key.
 */
function groupGaps(gaps: LessonGap[]): GapGroup[] {
  const map = new Map<string, GapGroup>()

  for (const gap of gaps) {
    const capSlug = getCapabilitySlug(gap)
    const outSlug = getOutcomeSlug(gap)
    const key = `${capSlug}::${outSlug}`

    const existing = map.get(key)
    if (existing) {
      existing.gaps.push(gap)
    } else {
      map.set(key, {
        capabilitySlug: capSlug,
        outcomeSlug: outSlug,
        gaps: [gap],
      })
    }
  }

  // Sort by key for determinism
  const entries = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  return entries.map(([, group]) => group)
}

/**
 * Compute the most frequent weakest axis across gaps.
 * Ties broken alphabetically for determinism.
 */
function mostFrequentAxis(gaps: LessonGap[]): WeakestAxis {
  const counts: Record<string, number> = {}
  for (const gap of gaps) {
    counts[gap.weakestAxis] = (counts[gap.weakestAxis] ?? 0) + 1
  }

  let bestAxis = gaps[0]!.weakestAxis as WeakestAxis
  let bestCount = 0

  const sortedKeys = Object.keys(counts).sort()
  for (const axis of sortedKeys) {
    const count = counts[axis]!
    if (count > bestCount) {
      bestCount = count
      bestAxis = axis as WeakestAxis
    }
  }

  return bestAxis
}

/**
 * Build the weakestAxes multiset for evidence.
 */
function buildWeakestAxes(gaps: LessonGap[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const gap of gaps) {
    counts[gap.weakestAxis] = (counts[gap.weakestAxis] ?? 0) + 1
  }
  return counts
}

/**
 * Deduplicate gaps into proposals by (capabilitySlug, outcomeSlug).
 * Merges gap_ids, computes weakest_axis (most frequent), priority (highest).
 */
export function dedup(
  gaps: LessonGap[],
  curriculumArchitecture?: CurriculumArchitecture,
  now?: string,
): LessonDevProposal[] {
  const groups = groupGaps(gaps)
  const timestamp = now ?? new Date().toISOString()

  return groups.map((group) => {
    // Collect persisted gap row UUIDs from metadata.gapId (set by DB persistence layer).
    const gapIds = group.gaps
      .map((g) => {
        const meta = g.metadata as Record<string, unknown> | undefined
        return meta?.['gapId'] as string | undefined
      })
      .filter((id): id is string => !!id)

    const weakestAxis = mostFrequentAxis(group.gaps)
    const priorities = group.gaps.map((g) =>
      determinePriority(g.weakestAxis as WeakestAxis, g.blockerScore),
    )
    const priority = highestPriority(priorities)

    const candidateLessons: string[] = []
    if (curriculumArchitecture) {
      // Check if any existing lesson slug contains the capability slug
      for (const slug of curriculumArchitecture.lessonSlugs) {
        if (slug.includes(group.capabilitySlug)) {
          candidateLessons.push(slug)
        }
      }
    }

    const evidence: ProposalEvidence = {
      gapIds: gapIds,
      weakestAxes: buildWeakestAxes(group.gaps),
      candidateLessons,
      gapSummaries: group.gaps.map((g) => ({
        actionId: g.actionId,
        weakestAxis: g.weakestAxis as WeakestAxis,
        score: g.score,
        blockerScore: g.blockerScore ?? null,
      })),
    }

    return {
      capabilitySlug: group.capabilitySlug,
      outcomeSlug: group.outcomeSlug,
      priority,
      status: 'proposed' as const,
      gapIds: gapIds,
      weakestAxis,
      evidence,
      candidateLessonSlug:
        candidateLessons.length > 0 ? candidateLessons[0]! : null,
      rationale: null,
      proposedBy: 'ai',
      proposedAt: timestamp,
      metadata: {},
    }
  })
}
