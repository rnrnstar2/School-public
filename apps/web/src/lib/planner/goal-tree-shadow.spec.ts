import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  createGoalMock: vi.fn(),
  insertGoalNodesMock: vi.fn(),
  insertGoalContextsMock: vi.fn(),
  insertProposedActionsMock: vi.fn(),
  insertGoalNodeLessonMatchesMock: vi.fn(),
  matchActionsMock: vi.fn(),
  normalizeActionsMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('@/lib/supabase/decision-ledger', () => ({
  createGoal: mocks.createGoalMock,
  insertGoalNodes: mocks.insertGoalNodesMock,
  insertGoalContexts: mocks.insertGoalContextsMock,
  insertProposedActions: mocks.insertProposedActionsMock,
  insertGoalNodeLessonMatches: mocks.insertGoalNodeLessonMatchesMock,
}))

vi.mock('../../../../../packages/goal-action/matcher/src/match', () => ({
  matchActions: mocks.matchActionsMock,
}))

vi.mock('../../../../../packages/goal-action/normalizer/src/normalize', () => ({
  normalizeActions: mocks.normalizeActionsMock,
}))

vi.mock('../../../../../packages/goal-action/coverage/src/schema', () => ({
  COVERAGE_INDEX_SCHEMA_VERSION: 'v1',
  CoverageIndexSchema: {
    parse: (payload: unknown) => payload,
  },
}))

const { runGoalTreeShadowWrite } = await import('./goal-tree-shadow')

describe('runGoalTreeShadowWrite', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset()
    }

    mocks.createGoalMock.mockResolvedValue({
      data: { id: 'goal-1' },
      error: null,
    })
    mocks.insertGoalNodesMock.mockResolvedValue({
      data: [],
      error: null,
    })
    mocks.insertGoalContextsMock.mockResolvedValue({
      data: [],
      error: null,
    })
    mocks.insertProposedActionsMock.mockResolvedValue({
      data: [],
      error: null,
    })
    mocks.insertGoalNodeLessonMatchesMock.mockResolvedValue({
      data: [],
      error: null,
    })
    mocks.matchActionsMock.mockReturnValue([])
    mocks.normalizeActionsMock.mockReturnValue([
      {
        actionId: 'action-1',
        capability: 'plan',
      },
    ])
    mocks.createServiceClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'snapshot-1',
                    payload: {
                      schema_version: 'v1',
                      content_hash: 'hash',
                      built_at: '2026-04-19T00:00:00.000Z',
                    },
                  },
                  error: null,
                }),
              })),
            })),
          })),
        })),
      })),
    })
  })

  it('writes default owner/dependency/fallback fields into inserted goal nodes', async () => {
    await runGoalTreeShadowWrite({
      userId: 'user-1',
      goal: 'ポートフォリオサイトを公開する',
      goalTags: ['website-launch'],
      personaIds: ['persona.web-builder'],
      learnerState: {
        skillLevel: 'beginner',
        blockers: ['deploy'],
        signals: { source: 'vitest' },
      },
      planId: 'plan-1',
      planSeed: 'seed-1',
      atomPlan: {
        goal: 'ポートフォリオサイトを公開する',
        goalTags: ['website-launch'],
        rationale: '段階的に公開まで進める',
        source: 'topo',
        coverageScore: 0.82,
        unsupportedCapabilities: [],
        milestones: [
          {
            id: 'milestone-1',
            title: '導線を決める',
            description: '最初の流れを固める',
            atomIds: ['atom.goal-tree.fixture'],
          },
        ],
        steps: [
          {
            title: 'トップページの構成を固める',
            rationale: '導線を見失わないため',
            estimatedMinutes: 30,
            atomId: 'atom.goal-tree.fixture',
            milestoneId: 'milestone-1',
            prerequisiteAtomIds: [],
            softPrerequisiteAtomIds: [],
            completedAt: null,
          },
        ],
      },
    })

    expect(mocks.insertGoalNodesMock).toHaveBeenCalledTimes(1)
    const insertedRows = mocks.insertGoalNodesMock.mock.calls[0]?.[1] as Array<Record<string, unknown>>

    expect(insertedRows).toHaveLength(3)
    expect(insertedRows.every((row) => row.owner_type === 'user')).toBe(true)
    expect(insertedRows.every((row) => Array.isArray(row.depends_on_node_ids))).toBe(true)
    expect(insertedRows.every((row) => (row.depends_on_node_ids as unknown[]).length === 0)).toBe(true)
    expect(insertedRows.every((row) => row.fallback_node_id === null)).toBe(true)
  })
})
