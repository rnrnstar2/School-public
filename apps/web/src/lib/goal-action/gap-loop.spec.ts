import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  matchActionsMock: vi.fn(),
  persistGapsMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('../../../../../packages/goal-action/matcher/src/match', () => ({
  matchActions: mocks.matchActionsMock,
}))

vi.mock('../../../../../packages/goal-action/gaps/src/index', async () => {
  const actual =
    await vi.importActual<
      typeof import('../../../../../packages/goal-action/gaps/src/index')
    >('../../../../../packages/goal-action/gaps/src/index')

  return {
    ...actual,
    persistGaps: mocks.persistGapsMock,
  }
})

const { runGapScanJob } = await import('./gap-loop')

type GoalNodeCandidateRow = {
  id: string
  goal_id: string
  parent_node_id: string | null
  label: string
  node_type: 'task' | 'sub_task' | 'objective' | 'milestone'
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'skipped'
  metadata: Record<string, unknown>
}

type ExistingLessonGapStatusRow = {
  action_id: string
  goal_id: string | null
  status: 'open' | 'proposed' | 'addressed' | 'dismissed'
}

function createArrayQuery<TRow>(rows: TRow[]) {
  let filteredRows = [...rows]

  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filteredRows = filteredRows.filter((row) => {
        const candidate = row as Record<string, unknown>
        return candidate[column] === value
      })
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: filteredRows[0] ?? null,
      error: null,
    })),
    then: (onFulfilled?: (value: { data: TRow[]; error: null }) => unknown) =>
      Promise.resolve({ data: filteredRows, error: null }).then(onFulfilled),
  }

  return builder
}

function createServiceClientFixture(params: {
  coverageSnapshots: Array<{
    id: string
    schema_version: string
    payload: Record<string, unknown>
  }>
  goalNodes: GoalNodeCandidateRow[]
  goalNodeParents: Array<{ parent_node_id: string | null }>
  lessonGapStatuses: ExistingLessonGapStatusRow[]
}) {
  return {
    from(table: string) {
      if (table === 'coverage_index_snapshots') {
        return createArrayQuery(params.coverageSnapshots)
      }

      throw new Error(`Unexpected public table: ${table}`)
    },
    schema(schemaName: string) {
      if (schemaName !== 'decision_ledger') {
        throw new Error(`Unexpected schema: ${schemaName}`)
      }

      return {
        from(table: string) {
          if (table === 'goal_nodes') {
            return {
              select(columns: string) {
                if (columns === 'parent_node_id') {
                  return createArrayQuery(params.goalNodeParents)
                }

                return createArrayQuery(params.goalNodes)
              },
            }
          }

          if (table === 'lesson_gaps') {
            return createArrayQuery(params.lessonGapStatuses)
          }

          throw new Error(`Unexpected ledger table: ${table}`)
        },
      }
    },
  }
}

function makeCoverageSnapshot() {
  return {
    id: 'coverage-snapshot-1',
    schema_version: 'v1',
    payload: {
      schema_version: 'v1',
      content_hash: '0123456789abcdef0123456789abcdef01234567',
      built_at: '2026-04-18T00:00:00.000Z',
      lessons: [
        {
          id: 'lesson-gap-target',
          title: 'Lesson Gap Target',
          summary: 'fixture',
          track_id: 'web-builder',
          module_id: null,
          milestone_id: null,
          status: 'published',
          capability_inputs: [],
          capability_outputs: [],
          hard_prerequisites: [],
          soft_prerequisites: [],
          persona_tags: ['web-builder'],
          goal_tags: ['website-launch'],
          source_kind: 'factory',
          source_path: 'lesson-gap-target.yaml',
          updated_at: '2026-04-18T00:00:00.000Z',
        },
      ],
      atoms: [],
      capabilities: [],
      support_assets: [],
      warnings: [],
    },
  }
}

function makeLegacyCoverageSnapshot() {
  return {
    id: 'coverage-snapshot-v0',
    schema_version: 'v0',
    payload: {
      schema_version: 'v0',
      content_hash: 'fedcba9876543210fedcba9876543210fedcba98',
      built_at: '2026-04-19T00:00:00.000Z',
      lessons: [
        {
          id: 'lesson-gap-legacy',
          title: 'Legacy lesson that must be ignored',
          summary: 'fixture',
          track_id: 'legacy-track',
          module_id: null,
          milestone_id: null,
          status: 'published',
          capability_inputs: [],
          capability_outputs: [],
          hard_prerequisites: [],
          soft_prerequisites: [],
          persona_tags: ['legacy'],
          goal_tags: ['legacy'],
          source_kind: 'factory',
          source_path: 'lesson-gap-legacy.yaml',
          updated_at: '2026-04-19T00:00:00.000Z',
        },
      ],
      atoms: [],
      capabilities: [],
      support_assets: [],
      warnings: [],
    },
  }
}

function makeGoalNode(goalId: string) {
  return {
    id: `${goalId}-node`,
    goal_id: goalId,
    parent_node_id: null,
    label: 'Improve measurement',
    node_type: 'task' as const,
    status: 'pending' as const,
    metadata: {
      canonical_action: {
        actionId: 'action-measure-shopify',
        rawAction: 'measure shopify funnel',
        capability: 'measure',
        outcome: 'measure_performance',
        blocker: 'clarity',
        context: {
          stack: ['Shopify'],
        },
      },
    },
  }
}

beforeEach(() => {
  mocks.persistGapsMock.mockReset()
  mocks.matchActionsMock.mockReset()
  mocks.createServiceClientMock.mockReset()
  mocks.matchActionsMock.mockImplementation(({ actions, coverageIndex }) =>
    actions.flatMap((action: {
      actionId: string
      rawAction: string
      capability: string
      outcome: string
      blocker: string
      context: { stack: string[] }
    }) =>
      coverageIndex.lessons.slice(0, 1).map((lesson: Record<string, unknown>) => ({
        action,
        lesson,
        score: 0.28,
        breakdown: {
          capability: 0.2,
          prerequisite: 0.9,
          blocker: 1,
          evidence: 0.9,
        },
        rank: 1,
      })),
    ),
  )
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runGapScanJob', () => {
  it('preserves non-open lesson gap status when a scan reruns', async () => {
    const goalId = '11111111-1111-4111-8111-111111111111'
    const client = createServiceClientFixture({
      coverageSnapshots: [makeCoverageSnapshot()],
      goalNodes: [makeGoalNode(goalId)],
      goalNodeParents: [],
      lessonGapStatuses: [
        {
          action_id: 'action-measure-shopify',
          goal_id: goalId,
          status: 'proposed',
        },
      ],
    })

    mocks.createServiceClientMock.mockReturnValue(client)
    mocks.persistGapsMock.mockImplementation(async (gaps) => ({
      data: gaps.map((gap: {
        actionId: string
        goalId: string | null
        weakestAxis: string
        score: number
        capabilityScore: number
        prerequisiteScore: number
        blockerScore: number
        evidenceScore: number
        evidence: Record<string, unknown>
        topMappings: unknown[]
        status: string
        detectedAt: string
        updatedAt: string
        metadata: Record<string, unknown>
      }, index: number) => ({
        id: `gap-${index + 1}`,
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
      })),
      error: null,
    }))

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-18T09:30:00.000Z'))

    await runGapScanJob()

    expect(mocks.persistGapsMock).toHaveBeenCalledTimes(1)
    expect(mocks.persistGapsMock).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          actionId: 'action-measure-shopify',
          goalId,
          status: 'proposed',
        }),
      ],
      expect.anything(),
    )
  })

  it('keeps duplicate canonical actions from different goals as separate gaps', async () => {
    const goalA = '11111111-1111-4111-8111-111111111111'
    const goalB = '22222222-2222-4222-8222-222222222222'
    const client = createServiceClientFixture({
      coverageSnapshots: [makeCoverageSnapshot()],
      goalNodes: [makeGoalNode(goalA), makeGoalNode(goalB)],
      goalNodeParents: [],
      lessonGapStatuses: [],
    })

    mocks.createServiceClientMock.mockReturnValue(client)
    mocks.persistGapsMock.mockImplementation(async (gaps) => ({
      data: gaps.map((gap: {
        actionId: string
        goalId: string | null
        weakestAxis: string
        score: number
        capabilityScore: number
        prerequisiteScore: number
        blockerScore: number
        evidenceScore: number
        evidence: Record<string, unknown>
        topMappings: unknown[]
        status: string
        detectedAt: string
        updatedAt: string
        metadata: Record<string, unknown>
      }, index: number) => ({
        id: `gap-${index + 1}`,
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
      })),
      error: null,
    }))

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-18T10:00:00.000Z'))

    await runGapScanJob()

    expect(mocks.matchActionsMock).toHaveBeenCalledTimes(2)
    expect(mocks.persistGapsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: 'action-measure-shopify',
          goalId: goalA,
        }),
        expect.objectContaining({
          actionId: 'action-measure-shopify',
          goalId: goalB,
        }),
      ]),
      expect.anything(),
    )
  })

  it('ignores legacy v0 coverage snapshots when selecting the latest cached index', async () => {
    const goalId = '33333333-3333-4333-8333-333333333333'
    const client = createServiceClientFixture({
      coverageSnapshots: [
        makeLegacyCoverageSnapshot(),
        makeCoverageSnapshot(),
      ],
      goalNodes: [makeGoalNode(goalId)],
      goalNodeParents: [],
      lessonGapStatuses: [],
    })

    mocks.createServiceClientMock.mockReturnValue(client)
    mocks.persistGapsMock.mockResolvedValue({
      data: [],
      error: null,
    })

    await runGapScanJob()

    expect(mocks.matchActionsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        coverageIndex: expect.objectContaining({
          schema_version: 'v1',
          lessons: expect.arrayContaining([
            expect.objectContaining({ id: 'lesson-gap-target' }),
          ]),
        }),
      }),
    )
  })
})
