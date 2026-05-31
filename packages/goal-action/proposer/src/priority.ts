import type { ProposalPriority, WeakestAxis } from './schema'

/**
 * Determine priority from a single gap's weakest axis and blocker score.
 *
 * Rules (spec §Priority ルール):
 *   1. high: weakest_axis === 'blocker' OR blocker_score > 0.7
 *   2. mid:  weakest_axis === 'capability' OR 'prerequisite'
 *   3. low:  weakest_axis === 'evidence'
 */
export function determinePriority(
  weakestAxis: WeakestAxis,
  blockerScore: number | null | undefined,
): ProposalPriority {
  if (weakestAxis === 'blocker') return 'high'
  if (typeof blockerScore === 'number' && blockerScore > 0.7) return 'high'
  if (weakestAxis === 'capability' || weakestAxis === 'prerequisite')
    return 'mid'
  // weakestAxis === 'evidence'
  return 'low'
}

const PRIORITY_RANK: Record<ProposalPriority, number> = {
  high: 3,
  mid: 2,
  low: 1,
}

/**
 * Return the highest priority among a list.
 * Empty list falls back to 'low'.
 */
export function highestPriority(
  priorities: ProposalPriority[],
): ProposalPriority {
  if (priorities.length === 0) return 'low'
  let best: ProposalPriority = 'low'
  for (const p of priorities) {
    if (PRIORITY_RANK[p] > PRIORITY_RANK[best]) {
      best = p
    }
  }
  return best
}
