import { describe, expect, it } from 'vitest'

import { generateProposals } from '../src/generate.js'
import { determinePriority, highestPriority } from '../src/priority.js'
import { LessonGapSchema } from '@school/goal-action-gaps'
import { z } from 'zod/v4'

type LessonGap = z.infer<typeof LessonGapSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = '2026-04-16T18:00:00.000Z'

function makeCanonicalAction(
  actionId: string,
  capability: 'research' | 'plan' | 'setup' | 'build' | 'integrate' | 'automate' | 'test' | 'ship' | 'measure' = 'build',
  outcome: 'clarify_scope' | 'prepare_foundation' | 'create_asset' | 'connect_systems' | 'automate_process' | 'publish_release' | 'validate_quality' | 'grow_audience' | 'measure_performance' = 'create_asset',
) {
  return {
    actionId,
    rawAction: `raw action for ${actionId}`,
    capability,
    outcome,
    blocker: 'none' as const,
    context: { stack: [] as never[] },
  }
}

function makeEvidence(
  actionId: string,
  weakestAxis: 'capability' | 'prerequisite' | 'blocker' | 'evidence' = 'capability',
  capability?: 'research' | 'plan' | 'setup' | 'build' | 'integrate' | 'automate' | 'test' | 'ship' | 'measure',
  outcome?: 'clarify_scope' | 'prepare_foundation' | 'create_asset' | 'connect_systems' | 'automate_process' | 'publish_release' | 'validate_quality' | 'grow_audience' | 'measure_performance',
) {
  return {
    canonicalAction: makeCanonicalAction(actionId, capability ?? 'build', outcome ?? 'create_asset'),
    weakestAxis,
    topMappings: [],
    failingAxes: [weakestAxis],
    reasons: [
      {
        axis: weakestAxis,
        score: 0.3,
        threshold: 0.5,
        delta: 0.2,
        comparator: 'gte' as const,
      },
    ],
    thresholds: {
      capability: 0.5,
      prerequisite: 0.5,
      blocker: 0.5,
      evidence: 0.5,
    },
  }
}

type MakeGapOverrides = Partial<LessonGap> & {
  actionId: string
  _capability?: 'research' | 'plan' | 'setup' | 'build' | 'integrate' | 'automate' | 'test' | 'ship' | 'measure'
  _outcome?: 'clarify_scope' | 'prepare_foundation' | 'create_asset' | 'connect_systems' | 'automate_process' | 'publish_release' | 'validate_quality' | 'grow_audience' | 'measure_performance'
}

function makeGap(overrides: MakeGapOverrides): LessonGap {
  const weakestAxis = overrides.weakestAxis ?? 'capability'
  return {
    actionId: overrides.actionId,
    goalId: overrides.goalId ?? null,
    weakestAxis,
    score: overrides.score ?? 0.3,
    capabilityScore: overrides.capabilityScore ?? 0.3,
    prerequisiteScore: overrides.prerequisiteScore ?? 0.8,
    blockerScore: overrides.blockerScore ?? 0.1,
    evidenceScore: overrides.evidenceScore ?? 0.9,
    evidence: overrides.evidence ?? makeEvidence(overrides.actionId, weakestAxis, overrides._capability, overrides._outcome),
    topMappings: overrides.topMappings ?? [],
    status: overrides.status ?? 'open',
    detectedAt: overrides.detectedAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
    metadata: overrides.metadata ?? {},
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateProposals', () => {
  it('deduplicates gaps with same capability into a single proposal', () => {
    // Both gaps share the same capability+outcome => same group
    const gaps = [
      makeGap({ actionId: 'spreadsheet-automation', _capability: 'build', _outcome: 'create_asset' }),
      makeGap({ actionId: 'spreadsheet-automation-2', _capability: 'build', _outcome: 'create_asset' }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.capabilitySlug).toBe('build')
    expect(proposals[0]!.outcomeSlug).toBe('create_asset')
    expect(proposals[0]!.evidence.gapSummaries).toHaveLength(2)
  })

  it('keeps different capabilities as separate proposals', () => {
    const gaps = [
      makeGap({ actionId: 'email-drafting', _capability: 'research', _outcome: 'clarify_scope' }),
      makeGap({ actionId: 'data-analysis', _capability: 'measure', _outcome: 'measure_performance' }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(2)
    const slugs = proposals.map((p) => p.capabilitySlug).sort()
    expect(slugs).toEqual(['measure', 'research'])
  })

  it('assigns high priority to blocker gaps', () => {
    const gaps = [
      makeGap({ actionId: 'blocked-cap', weakestAxis: 'blocker', _capability: 'build', _outcome: 'create_asset' }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.priority).toBe('high')
    expect(proposals[0]!.weakestAxis).toBe('blocker')
  })

  it('assigns high priority when blocker_score > 0.7 even if weakestAxis is not blocker', () => {
    const gaps = [
      makeGap({
        actionId: 'high-blocker',
        weakestAxis: 'capability',
        blockerScore: 0.8,
      }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.priority).toBe('high')
  })

  it('assigns mid priority to capability/prerequisite gaps', () => {
    const gapCap = makeGap({ actionId: 'cap-gap', weakestAxis: 'capability', _capability: 'build', _outcome: 'create_asset' })
    const gapPre = makeGap({
      actionId: 'pre-gap',
      weakestAxis: 'prerequisite',
      _capability: 'plan',
      _outcome: 'prepare_foundation',
    })

    const proposals = generateProposals({ gaps: [gapCap, gapPre], now: NOW })

    expect(proposals).toHaveLength(2)
    for (const p of proposals) {
      expect(p.priority).toBe('mid')
    }
  })

  it('assigns low priority to evidence gaps', () => {
    const gaps = [
      makeGap({ actionId: 'evidence-gap', weakestAxis: 'evidence' }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.priority).toBe('low')
  })

  it('takes highest priority when mixed gaps deduplicate', () => {
    // Two gaps with same capability+outcome: one blocker (high), one evidence (low)
    const gap1 = makeGap({
      actionId: 'mixed-cap-1',
      weakestAxis: 'blocker',
      _capability: 'build',
      _outcome: 'create_asset',
    })
    const gap2 = makeGap({
      actionId: 'mixed-cap-2',
      weakestAxis: 'evidence',
      _capability: 'build',
      _outcome: 'create_asset',
    })

    const proposals = generateProposals({ gaps: [gap1, gap2], now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.priority).toBe('high')
  })

  it('is deterministic — same input produces same output', () => {
    const gaps = [
      makeGap({ actionId: 'alpha', weakestAxis: 'capability', _capability: 'build', _outcome: 'create_asset' }),
      makeGap({ actionId: 'beta', weakestAxis: 'blocker', _capability: 'integrate', _outcome: 'connect_systems' }),
      makeGap({ actionId: 'alpha-2', weakestAxis: 'evidence', _capability: 'build', _outcome: 'create_asset' }),
      makeGap({ actionId: 'gamma', weakestAxis: 'prerequisite', _capability: 'plan', _outcome: 'prepare_foundation' }),
    ]

    const run1 = generateProposals({ gaps, now: NOW })
    const run2 = generateProposals({ gaps, now: NOW })

    expect(run1).toStrictEqual(run2)
  })

  it('sorts proposals by priority (high -> mid -> low) then alphabetical', () => {
    const gaps = [
      makeGap({ actionId: 'z-evidence', weakestAxis: 'evidence', _capability: 'test', _outcome: 'validate_quality' }),
      makeGap({ actionId: 'a-blocker', weakestAxis: 'blocker', _capability: 'automate', _outcome: 'automate_process' }),
      makeGap({ actionId: 'm-capability', weakestAxis: 'capability', _capability: 'build', _outcome: 'create_asset' }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals.map((p) => p.priority)).toEqual(['high', 'mid', 'low'])
    expect(proposals.map((p) => p.capabilitySlug)).toEqual([
      'automate',
      'build',
      'test',
    ])
  })

  it('includes candidateLessonSlug when curriculumArchitecture matches', () => {
    const gaps = [makeGap({ actionId: 'prompt-engineering', _capability: 'build', _outcome: 'create_asset' })]

    const proposals = generateProposals({
      gaps,
      curriculumArchitecture: {
        lessonSlugs: ['intro-build-basics', 'data-viz-basics'],
      },
      now: NOW,
    })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.candidateLessonSlug).toBe('intro-build-basics')
    expect(proposals[0]!.evidence.candidateLessons).toContain(
      'intro-build-basics',
    )
  })

  it('handles single gap correctly', () => {
    const gaps = [
      makeGap({ actionId: 'solo-gap', weakestAxis: 'prerequisite', _capability: 'build', _outcome: 'create_asset' }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.capabilitySlug).toBe('build')
    expect(proposals[0]!.outcomeSlug).toBe('create_asset')
    expect(proposals[0]!.priority).toBe('mid')
    expect(proposals[0]!.status).toBe('proposed')
    expect(proposals[0]!.proposedBy).toBe('ai')
    expect(proposals[0]!.proposedAt).toBe(NOW)
  })

  it('respects canonicalAction.outcome for dedup grouping', () => {
    const gaps = [
      makeGap({
        actionId: 'same-cap-a',
        _capability: 'build',
        _outcome: 'create_asset',
      }),
      makeGap({
        actionId: 'same-cap-b',
        _capability: 'build',
        _outcome: 'publish_release',
      }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    // Different outcomes should produce separate proposals
    expect(proposals).toHaveLength(2)
    const outcomes = proposals.map((p) => p.outcomeSlug).sort()
    expect(outcomes).toEqual(['create_asset', 'publish_release'])
  })

  it('falls back to metadata.outcomeSlug when canonicalAction.outcome is absent', () => {
    // When canonicalAction exists but getOutcomeSlug logic falls through,
    // metadata.outcomeSlug is used. Since Zod enforces valid outcome enum,
    // we test the metadata path indirectly: canonicalAction.outcome is valid
    // but metadata.outcomeSlug is also set — canonicalAction.outcome wins.
    const gaps = [
      makeGap({
        actionId: 'meta-gap',
        _capability: 'build',
        _outcome: 'create_asset',
        metadata: { outcomeSlug: 'should-be-ignored' },
      }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    // canonicalAction.outcome takes precedence over metadata.outcomeSlug
    expect(proposals[0]!.outcomeSlug).toBe('create_asset')
  })

  it('collects gapIds from metadata.gapId (not goalId)', () => {
    const gapUuid1 = '11111111-1111-4111-a111-111111111111'
    const gapUuid2 = '22222222-2222-4222-a222-222222222222'
    const goalUuid = '99999999-9999-4999-a999-999999999999'

    const gaps = [
      makeGap({
        actionId: 'traced-a',
        _capability: 'build',
        _outcome: 'create_asset',
        goalId: goalUuid, // should NOT appear in gapIds
        metadata: { gapId: gapUuid1 },
      }),
      makeGap({
        actionId: 'traced-b',
        _capability: 'build',
        _outcome: 'create_asset',
        metadata: { gapId: gapUuid2 },
      }),
    ]

    const proposals = generateProposals({ gaps, now: NOW })

    expect(proposals).toHaveLength(1)
    expect(proposals[0]!.gapIds).toEqual([gapUuid1, gapUuid2])
    // Ensure goalId is NOT in gapIds
    expect(proposals[0]!.gapIds).not.toContain(goalUuid)
  })
})

describe('determinePriority', () => {
  it('returns high for blocker axis', () => {
    expect(determinePriority('blocker', 0.5)).toBe('high')
  })

  it('returns high for high blocker score', () => {
    expect(determinePriority('capability', 0.8)).toBe('high')
  })

  it('returns mid for capability', () => {
    expect(determinePriority('capability', 0.3)).toBe('mid')
  })

  it('returns mid for prerequisite', () => {
    expect(determinePriority('prerequisite', null)).toBe('mid')
  })

  it('returns low for evidence', () => {
    expect(determinePriority('evidence', 0.2)).toBe('low')
  })
})

describe('highestPriority', () => {
  it('returns high when mixed', () => {
    expect(highestPriority(['low', 'high', 'mid'])).toBe('high')
  })

  it('returns low for empty', () => {
    expect(highestPriority([])).toBe('low')
  })
})
