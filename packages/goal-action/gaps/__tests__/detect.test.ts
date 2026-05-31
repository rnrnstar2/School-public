import { execFileSync } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'

import { type ActionLessonMapping } from '@school/goal-action-matcher'
import { type LessonNode } from '@school/goal-action-coverage'

import { DEFAULT_THRESHOLDS, detectGaps } from '../src/index.js'

type CanonicalAction = ActionLessonMapping['action']

function makeLesson(
  overrides: Partial<LessonNode> & Pick<LessonNode, 'id' | 'title'>,
): LessonNode {
  return {
    id: overrides.id,
    title: overrides.title,
    summary: overrides.summary ?? '',
    track_id: overrides.track_id ?? 'web-builder',
    module_id: overrides.module_id ?? null,
    milestone_id: overrides.milestone_id ?? null,
    status: overrides.status ?? 'published',
    capability_inputs: overrides.capability_inputs ?? [],
    capability_outputs: overrides.capability_outputs ?? [],
    hard_prerequisites: overrides.hard_prerequisites ?? [],
    soft_prerequisites: overrides.soft_prerequisites ?? [],
    persona_tags: overrides.persona_tags ?? ['web-builder'],
    goal_tags: overrides.goal_tags ?? [],
    source_kind: overrides.source_kind ?? 'factory',
    source_path: overrides.source_path ?? `${overrides.id}.yaml`,
    updated_at: overrides.updated_at ?? 'deterministic',
  }
}

function makeAction(
  overrides: Partial<CanonicalAction> &
    Pick<
      CanonicalAction,
      'actionId' | 'rawAction' | 'capability' | 'outcome' | 'blocker'
    >,
): CanonicalAction {
  return {
    actionId: overrides.actionId,
    rawAction: overrides.rawAction,
    capability: overrides.capability,
    outcome: overrides.outcome,
    blocker: overrides.blocker,
    context: {
      stack: overrides.context?.stack ?? [],
    },
  }
}

function makeMapping(
  action: CanonicalAction,
  lessonId: string,
  rank: number,
  breakdown: {
    capability: number
    prerequisite: number
    blocker: number
    evidence: number
  },
  score: number,
  options?: {
    goalId?: string | null
  },
) {
  return {
    action,
    goalId: options?.goalId,
    lesson: makeLesson({
      id: lessonId,
      title: lessonId,
      source_path: `${lessonId}.yaml`,
    }),
    score,
    breakdown,
    rank,
  }
}

const boundaryAction = makeAction({
  actionId: 'action-boundary',
  rawAction: 'boundary action',
  capability: 'build',
  outcome: 'create_asset',
  blocker: 'integration',
})

const weakAction = makeAction({
  actionId: 'action-weak',
  rawAction: 'weak action',
  capability: 'measure',
  outcome: 'measure_performance',
  blocker: 'quality',
})

const healthyAction = makeAction({
  actionId: 'action-healthy',
  rawAction: 'healthy action',
  capability: 'plan',
  outcome: 'clarify_scope',
  blocker: 'clarity',
})

const FIXED_NOW = '2026-04-16T12:34:56.000Z'

describe('detectGaps', () => {
  it('treats exact threshold hits as passing and flags blocker overflow (AC-136-01)', () => {
    const result = detectGaps({
      mappings: [
        makeMapping(
          boundaryAction,
          'lesson-boundary-pass',
          1,
          {
            capability: DEFAULT_THRESHOLDS.capability,
            prerequisite: DEFAULT_THRESHOLDS.prerequisite,
            blocker: 1 - DEFAULT_THRESHOLDS.blocker,
            evidence: DEFAULT_THRESHOLDS.evidence,
          },
          0.61,
        ),
        makeMapping(
          weakAction,
          'lesson-boundary-fail',
          1,
          {
            capability: 0.8,
            prerequisite: 0.8,
            blocker: 0.6,
            evidence: 0.8,
          },
          0.64,
        ),
      ],
      now: '2026-04-16T12:00:00.000Z',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.actionId).toBe('action-weak')
    expect(result[0]?.blockerScore).toBe(0.4)
    expect(result[0]?.weakestAxis).toBe('blocker')
  })

  it('selects the failing axis with the largest threshold delta (AC-136-02)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FIXED_NOW))

    try {
      const [gap] = detectGaps({
        mappings: [
          makeMapping(
            weakAction,
            'lesson-largest-gap',
            1,
            {
              capability: 0.55,
              prerequisite: 0.2,
              blocker: 0.8,
              evidence: 0.3,
            },
            0.32,
          ),
        ],
      })

      expect(gap?.weakestAxis).toBe('prerequisite')
      expect(gap?.detectedAt).toBe(FIXED_NOW)
      expect(gap?.updatedAt).toBe(FIXED_NOW)
      expect(gap?.evidence.reasons).toStrictEqual([
        {
          axis: 'capability',
          score: 0.55,
          threshold: 0.6,
          delta: 0.05,
          comparator: 'gte',
        },
        {
          axis: 'prerequisite',
          score: 0.2,
          threshold: 0.5,
          delta: 0.3,
          comparator: 'gte',
        },
        {
          axis: 'evidence',
          score: 0.3,
          threshold: 0.4,
          delta: 0.1,
          comparator: 'gte',
        },
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not emit a gap for a mapping that clears every threshold (AC-136-05)', () => {
    const result = detectGaps({
      mappings: [
        makeMapping(
          healthyAction,
          'lesson-healthy',
          1,
          {
            capability: 0.92,
            prerequisite: 0.88,
            blocker: 1,
            evidence: 0.7,
          },
          0.9,
        ),
      ],
    })

    expect(result).toStrictEqual([])
  })

  it('captures canonical action, top mappings, thresholds, and weakest axis in evidence (AC-136-02)', () => {
    const [gap] = detectGaps({
      mappings: [
        makeMapping(
          weakAction,
          'lesson-top-2',
          2,
          {
            capability: 0.58,
            prerequisite: 0.51,
            blocker: 0.9,
            evidence: 0.41,
          },
          0.58,
        ),
        makeMapping(
          weakAction,
          'lesson-top-1',
          1,
          {
            capability: 0.58,
            prerequisite: 0.51,
            blocker: 0.9,
            evidence: 0.41,
          },
          0.59,
        ),
        makeMapping(
          weakAction,
          'lesson-top-3',
          3,
          {
            capability: 0.58,
            prerequisite: 0.51,
            blocker: 0.9,
            evidence: 0.41,
          },
          0.57,
        ),
        makeMapping(
          weakAction,
          'lesson-top-4',
          4,
          {
            capability: 0.58,
            prerequisite: 0.51,
            blocker: 0.9,
            evidence: 0.41,
          },
          0.56,
        ),
      ],
    })

    expect(gap?.evidence.canonicalAction).toStrictEqual(weakAction)
    expect(gap?.evidence.weakestAxis).toBe('capability')
    expect(gap?.evidence.topMappings.map((mapping) => mapping.lesson.id)).toStrictEqual([
      'lesson-top-1',
      'lesson-top-2',
      'lesson-top-3',
    ])
    expect(gap?.evidence.thresholds).toStrictEqual(DEFAULT_THRESHOLDS)
    expect(gap?.topMappings).toStrictEqual(gap?.evidence.topMappings)
  })

  it('returns gaps in deterministic action order and uses rank-sorted top mappings (AC-136-08)', () => {
    const result = detectGaps({
      mappings: [
        makeMapping(
          weakAction,
          'lesson-b-2',
          2,
          {
            capability: 0.5,
            prerequisite: 0.7,
            blocker: 1,
            evidence: 0.7,
          },
          0.52,
        ),
        makeMapping(
          boundaryAction,
          'lesson-a-1',
          1,
          {
            capability: 0.4,
            prerequisite: 0.7,
            blocker: 1,
            evidence: 0.7,
          },
          0.45,
        ),
        makeMapping(
          weakAction,
          'lesson-b-1',
          1,
          {
            capability: 0.5,
            prerequisite: 0.7,
            blocker: 1,
            evidence: 0.7,
          },
          0.53,
        ),
      ],
      now: FIXED_NOW,
    })

    expect(result.map((gap) => gap.actionId)).toStrictEqual([
      'action-boundary',
      'action-weak',
    ])
    expect(result[1]?.topMappings.map((mapping) => mapping.rank)).toStrictEqual([1, 2])
  })

  it('keeps identical canonical actions in separate goals distinct', () => {
    const goalA = '11111111-1111-4111-8111-111111111111'
    const goalB = '22222222-2222-4222-8222-222222222222'

    const result = detectGaps({
      mappings: [
        makeMapping(
          weakAction,
          'lesson-goal-a',
          1,
          {
            capability: 0.5,
            prerequisite: 0.7,
            blocker: 1,
            evidence: 0.7,
          },
          0.53,
          { goalId: goalA },
        ),
        makeMapping(
          weakAction,
          'lesson-goal-b',
          1,
          {
            capability: 0.48,
            prerequisite: 0.7,
            blocker: 1,
            evidence: 0.7,
          },
          0.51,
          { goalId: goalB },
        ),
      ],
      now: FIXED_NOW,
    })

    expect(result).toHaveLength(2)
    expect(result.map((gap) => gap.goalId)).toStrictEqual([goalA, goalB])
    expect(result.map((gap) => gap.actionId)).toStrictEqual([
      'action-weak',
      'action-weak',
    ])
  })

  it('is idempotent for the same input payload (AC-136-08)', () => {
    const input = {
      mappings: [
        makeMapping(
          weakAction,
          'lesson-repeat',
          1,
          {
            capability: 0.45,
            prerequisite: 0.6,
            blocker: 0.9,
            evidence: 0.6,
          },
          0.47,
        ),
      ],
      thresholds: {
        capability: 0.5,
      },
      now: '2026-04-16T13:37:00.000Z',
    }

    expect(detectGaps(input)).toStrictEqual(detectGaps(input))
  })

  it('accepts injected thresholds and removes a gap when the custom minimum is lower (AC-136-03)', () => {
    const mappings = [
      makeMapping(
        weakAction,
        'lesson-injected-threshold',
        1,
        {
          capability: 0.55,
          prerequisite: 0.7,
          blocker: 1,
          evidence: 0.7,
        },
        0.57,
      ),
    ]

    expect(detectGaps({ mappings })).toHaveLength(1)
    expect(
      detectGaps({
        mappings,
        thresholds: {
          capability: 0.55,
        },
      }),
    ).toStrictEqual([])
  })

  it('does not import any LLM SDK in src', () => {
    const grepOutput = execFileSync(
      'sh',
      ['-lc', 'grep -R -n "openai\\|anthropic\\|@ai-sdk" src || true'],
      { cwd: new URL('..', import.meta.url) },
    )
      .toString()
      .trim()

    expect(grepOutput).toBe('')
  })
})
