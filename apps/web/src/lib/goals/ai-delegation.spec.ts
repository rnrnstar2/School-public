import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  insertGoalContextsMock: vi.fn(),
  fetchWithRetryMock: vi.fn(),
  withAiMetricsMock: vi.fn(),
  getExternalPlannerConfigMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('@/lib/supabase/decision-ledger', () => ({
  insertGoalContexts: mocks.insertGoalContextsMock,
}))

vi.mock('@/lib/api/fetch-with-retry', () => ({
  fetchWithRetry: mocks.fetchWithRetryMock,
}))

vi.mock('@/lib/observability/ai-metrics', () => ({
  withAiMetrics: mocks.withAiMetricsMock,
}))

vi.mock('@/lib/planner/zai', () => ({
  getExternalPlannerConfig: mocks.getExternalPlannerConfigMock,
}))

const { createAiDelegationBrief } = await import('./ai-delegation')

function makeLedgerClient(input: {
  goal?: Record<string, unknown> | null
  nodes?: Array<Record<string, unknown>>
  goalContexts?: Array<Record<string, unknown>>
}) {
  return {
    schema: () => ({
      from: (table: string) => {
        if (table === 'goals') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: input.goal ?? null,
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'goal_nodes') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: input.nodes ?? [],
                  error: null,
                }),
              }),
            }),
          }
        }

        if (table === 'goal_contexts') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({
                    data: input.goalContexts ?? [],
                    error: null,
                  }),
                }),
              }),
            }),
          }
        }

        throw new Error(`unexpected table ${table}`)
      },
    }),
  }
}

describe('createAiDelegationBrief', () => {
  beforeEach(() => {
    mocks.createServiceClientMock.mockReset()
    mocks.insertGoalContextsMock.mockReset()
    mocks.fetchWithRetryMock.mockReset()
    mocks.withAiMetricsMock.mockReset()
    mocks.getExternalPlannerConfigMock.mockReset()

    mocks.withAiMetricsMock.mockImplementation(async (_options, fn) => fn())
    mocks.getExternalPlannerConfigMock.mockReturnValue({
      available: false,
      reason: 'no key',
    })
  })

  it('returns invalid_owner_type when the node is not AI-delegatable', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      makeLedgerClient({
        goal: {
          id: 'goal-1',
          user_id: 'user-1',
          title: 'Goal',
          description: null,
        },
        nodes: [
          {
            id: 'node-1',
            goal_id: 'goal-1',
            label: 'User owned task',
            owner_type: 'user',
            node_type: 'task',
            status: 'pending',
            depends_on_node_ids: [],
            parent_node_id: null,
            metadata: {},
          },
        ],
        goalContexts: [],
      }),
    )

    const result = await createAiDelegationBrief({
      userId: 'user-1',
      goalId: 'goal-1',
      nodeId: 'node-1',
      delegateKind: 'prompt',
    })

    expect(result).toEqual({
      kind: 'invalid_owner_type',
      ownerType: 'user',
    })
    expect(mocks.insertGoalContextsMock).not.toHaveBeenCalled()
  })

  it('falls back to a deterministic mock brief and inserts an ai_delegation_brief context', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      makeLedgerClient({
        goal: {
          id: 'goal-1',
          user_id: 'user-1',
          title: 'Goal',
          description: 'desc',
        },
        nodes: [
          {
            id: 'node-1',
            goal_id: 'goal-1',
            label: 'AI task',
            owner_type: 'ai',
            node_type: 'task',
            status: 'pending',
            depends_on_node_ids: [],
            parent_node_id: null,
            metadata: {},
          },
        ],
        goalContexts: [
          {
            id: 'ctx-1',
            goal_id: 'goal-1',
            node_id: null,
            source_type: 'doc',
            content: 'existing context',
            source_uri: null,
            metadata: {},
            freshness_at: null,
            created_at: '2026-04-19T00:00:00.000Z',
          },
        ],
      }),
    )
    mocks.insertGoalContextsMock.mockResolvedValue({
      data: [{ id: 'context-1' }],
      error: null,
    })

    const result = await createAiDelegationBrief({
      userId: 'user-1',
      goalId: 'goal-1',
      nodeId: 'node-1',
      delegateKind: 'code_brief',
      mode: 'mock',
    })

    expect(result).toMatchObject({
      kind: 'ok',
      contextId: 'context-1',
    })
    if (result.kind !== 'ok') {
      throw new Error('expected ok result')
    }
    expect(result.brief).toContain('[Mock Code Brief] AI task')
    expect(mocks.insertGoalContextsMock).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          goal_id: 'goal-1',
          node_id: 'node-1',
          source_type: 'ai_delegation_brief',
          source_uri: null,
          metadata: expect.objectContaining({
            delegate_kind: 'code_brief',
            node_id: 'node-1',
          }),
        }),
      ],
    )
  })

  it('builds a deterministic Codex CLI brief and inserts an agent_delegation_brief context', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      makeLedgerClient({
        goal: {
          id: 'goal-1',
          user_id: 'user-1',
          title: 'Goal',
          description: 'desc',
        },
        nodes: [
          {
            id: 'node-1',
            goal_id: 'goal-1',
            label: 'AI task',
            owner_type: 'ai',
            node_type: 'task',
            status: 'pending',
            depends_on_node_ids: [],
            parent_node_id: null,
            metadata: {},
          },
        ],
        goalContexts: [
          {
            id: 'ctx-1',
            goal_id: 'goal-1',
            node_id: null,
            source_type: 'agent_delegation_brief',
            content: 'older generated brief',
            source_uri: null,
            metadata: { agent: 'codex' },
            freshness_at: null,
            created_at: '2026-04-19T00:00:00.000Z',
          },
          {
            id: 'ctx-2',
            goal_id: 'goal-1',
            node_id: null,
            source_type: 'doc',
            content: 'existing context',
            source_uri: null,
            metadata: {},
            freshness_at: null,
            created_at: '2026-04-19T00:01:00.000Z',
          },
        ],
      }),
    )
    mocks.insertGoalContextsMock.mockResolvedValue({
      data: [{ id: 'context-2' }],
      error: null,
    })

    const result = await createAiDelegationBrief({
      userId: 'user-1',
      goalId: 'goal-1',
      nodeId: 'node-1',
      delegateKind: 'codex_cli_brief',
    })

    expect(result).toMatchObject({
      kind: 'ok',
      contextId: 'context-2',
    })
    if (result.kind !== 'ok') {
      throw new Error('expected ok result')
    }
    expect(result.brief).toContain('Codex CLI')
    expect(result.brief).toContain('cwd: /path/to/project-root')
    expect(result.brief).toContain('existing context')
    expect(result.brief).not.toContain('older generated brief')
    expect(mocks.fetchWithRetryMock).not.toHaveBeenCalled()
    expect(mocks.insertGoalContextsMock).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          goal_id: 'goal-1',
          node_id: 'node-1',
          source_type: 'agent_delegation_brief',
          source_uri: null,
          metadata: expect.objectContaining({
            agent: 'codex',
            delegate_kind: 'codex_cli_brief',
            node_id: 'node-1',
          }),
        }),
      ],
    )
  })
})
