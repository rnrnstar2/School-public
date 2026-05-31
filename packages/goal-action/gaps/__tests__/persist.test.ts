import { describe, expect, it, vi } from 'vitest'

import { type ActionLessonMapping } from '@school/goal-action-matcher'
import { type LessonNode } from '@school/goal-action-coverage'

import {
  persistGaps,
  type LessonGap,
  type LessonGapPersistClient,
  type LessonGapPersistRow,
} from '../src/index.js'

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
    updated_at: overrides.updated_at ?? '2026-04-17T00:00:00.000Z',
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

function makeMapping(action: CanonicalAction): ActionLessonMapping {
  return {
    action,
    lesson: makeLesson({
      id: 'lesson-gap-target',
      title: 'Lesson Gap Target',
    }),
    score: 0.42,
    breakdown: {
      capability: 0.42,
      prerequisite: 0.8,
      blocker: 0.9,
      evidence: 0.7,
    },
    rank: 1,
  }
}

const thresholds = {
  capability: 0.6,
  prerequisite: 0.5,
  blocker: 0.3,
  evidence: 0.4,
} as const

function makeGap(): LessonGap {
  const action = makeAction({
    actionId: 'action-null-goal',
    rawAction: 'close the foreground sync race',
    capability: 'build',
    outcome: 'create_asset',
    blocker: 'integration',
  })
  const mapping = makeMapping(action)

  return {
    actionId: action.actionId,
    goalId: null,
    weakestAxis: 'capability',
    score: 0.42,
    capabilityScore: 0.42,
    prerequisiteScore: 0.8,
    blockerScore: 0.9,
    evidenceScore: 0.7,
    evidence: {
      canonicalAction: action,
      weakestAxis: 'capability',
      topMappings: [mapping],
      failingAxes: ['capability'],
      reasons: [
        {
          axis: 'capability',
          score: 0.42,
          threshold: thresholds.capability,
          delta: 0.18,
          comparator: 'gte',
        },
      ],
      thresholds,
    },
    topMappings: [mapping],
    status: 'open',
    detectedAt: '2026-04-17T00:00:00.000Z',
    updatedAt: '2026-04-17T00:00:00.000Z',
    metadata: {
      source: 'persist.test.ts',
    },
  }
}

function toPersistedRow(gap: LessonGap): LessonGapPersistRow {
  return {
    id: 'gap-row-1',
    action_id: gap.actionId,
    goal_id: gap.goalId,
    weakest_axis: gap.weakestAxis,
    score: gap.score,
    capability_score: gap.capabilityScore,
    prerequisite_score: gap.prerequisiteScore,
    blocker_score: gap.blockerScore,
    evidence_score: gap.evidenceScore,
    evidence: gap.evidence,
    top_mappings: gap.topMappings,
    status: gap.status,
    detected_at: gap.detectedAt,
    updated_at: gap.updatedAt,
    metadata: gap.metadata,
  }
}

describe('persistGaps', () => {
  it('uses a single atomic upsert when goalId is null (P1 #257)', async () => {
    const gap = makeGap()
    const persistedRow = toPersistedRow(gap)
    const single = vi.fn(async () => ({
      data: persistedRow,
      error: null,
    }))
    const select = vi.fn(() => ({ single }))
    const upsert = vi.fn(() => ({ select }))
    const from = vi.fn(() => ({ upsert }))
    const schema = vi.fn(() => ({ from }))
    const client: LessonGapPersistClient = { schema }

    const result = await persistGaps([gap], client)

    expect(result).toStrictEqual({ data: [persistedRow], error: null })
    expect(schema).toHaveBeenCalledWith('decision_ledger')
    expect(from).toHaveBeenCalledWith('lesson_gaps')
    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        action_id: gap.actionId,
        goal_id: null,
      }),
      { onConflict: 'action_id,goal_id' },
    )
    expect(select).toHaveBeenCalledTimes(1)
    expect(single).toHaveBeenCalledTimes(1)
  })
})
