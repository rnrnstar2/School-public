import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

const { listGoalsWithNodesForUser } = await import('./decision-ledger')

function createArrayQuery<TRow extends Record<string, unknown>>(rows: TRow[]) {
  let filteredRows = [...rows]

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filteredRows = filteredRows.filter((row) => row[column] === value)
      return builder
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      const valueSet = new Set(values)
      filteredRows = filteredRows.filter((row) => valueSet.has(row[column]))
      return builder
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: filteredRows[0] ?? null,
      error: null,
    })),
    single: vi.fn(async () => ({
      data: filteredRows[0] ?? null,
      error: null,
    })),
    then: (onFulfilled?: (value: { data: TRow[]; error: null }) => unknown) =>
      Promise.resolve({ data: filteredRows, error: null }).then(onFulfilled),
  }

  return builder
}

function createLedgerClientFixture(params: {
  goals: Array<Record<string, unknown>>
  goalNodes: Array<Record<string, unknown>>
  selectedMatches: Array<Record<string, unknown>>
  queryLog: string[]
}) {
  return {
    schema(schemaName: string) {
      expect(schemaName).toBe('decision_ledger')

      return {
        from(table: string) {
          params.queryLog.push(table)

          if (table === 'goals') {
            return createArrayQuery(params.goals)
          }

          if (table === 'goal_nodes') {
            return createArrayQuery(params.goalNodes)
          }

          if (table === 'goal_node_lesson_matches') {
            return createArrayQuery(params.selectedMatches)
          }

          throw new Error(`Unexpected table: ${table}`)
        },
      }
    },
  }
}

describe('listGoalsWithNodesForUser', () => {
  beforeEach(() => {
    mocks.createServiceClientMock.mockReset()
  })

  it('loads goals, nodes, and selected lesson matches in three batched queries', async () => {
    const queryLog: string[] = []
    mocks.createServiceClientMock.mockReturnValue(
      createLedgerClientFixture({
        queryLog,
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: '公開する',
            description: null,
            status: 'active',
            deadline: null,
            metadata: {},
            created_at: '2026-04-18T00:00:00.000Z',
            updated_at: '2026-04-18T00:00:00.000Z',
          },
        ],
        goalNodes: [
          {
            id: 'node-1',
            goal_id: 'goal-1',
            parent_node_id: null,
            label: '完成像',
            node_type: 'objective',
            status: 'in_progress',
            sort_order: 0,
            owner_type: 'user',
            depends_on_node_ids: [],
            fallback_node_id: null,
            metadata: {},
            created_at: '2026-04-18T00:00:00.000Z',
            updated_at: '2026-04-18T00:00:00.000Z',
          },
          {
            id: 'node-2',
            goal_id: 'goal-1',
            parent_node_id: 'node-1',
            label: '公開する',
            node_type: 'task',
            status: 'pending',
            sort_order: 1,
            owner_type: 'both',
            depends_on_node_ids: ['node-1'],
            fallback_node_id: null,
            metadata: {},
            created_at: '2026-04-18T00:00:01.000Z',
            updated_at: '2026-04-18T00:00:01.000Z',
          },
        ],
        selectedMatches: [
          {
            id: 'match-1',
            goal_node_id: 'node-2',
            lesson_id: 'atom.goal-tree.fixture',
            lesson_version_id: null,
            score: 0.82,
            rationale: 'fit',
            selected: true,
            coverage_snapshot_id: null,
            created_at: '2026-04-18T00:00:02.000Z',
          },
        ],
      }),
    )

    const result = await listGoalsWithNodesForUser('user-1')

    expect(result.error).toBeNull()
    expect(result.data).toEqual([
      {
        id: 'goal-1',
        title: '公開する',
        status: 'active',
        created_at: '2026-04-18T00:00:00.000Z',
        deadline: null,
        nodes: [
          {
            id: 'node-1',
            parent_node_id: null,
            label: '完成像',
            node_type: 'objective',
            status: 'in_progress',
            sort_order: 0,
            owner_type: 'user',
            depends_on_node_ids: [],
            fallback_node_id: null,
            selected_lesson: null,
          },
          {
            id: 'node-2',
            parent_node_id: 'node-1',
            label: '公開する',
            node_type: 'task',
            status: 'pending',
            sort_order: 1,
            owner_type: 'both',
            depends_on_node_ids: ['node-1'],
            fallback_node_id: null,
            selected_lesson: {
              lesson_id: 'atom.goal-tree.fixture',
              score: 0.82,
              rationale: 'fit',
            },
          },
        ],
      },
    ])
    expect(queryLog).toEqual([
      'goals',
      'goal_nodes',
      'goal_node_lesson_matches',
    ])
  })

  it('returns an empty list without querying nodes when the user has no goals', async () => {
    const queryLog: string[] = []
    mocks.createServiceClientMock.mockReturnValue(
      createLedgerClientFixture({
        queryLog,
        goals: [],
        goalNodes: [],
        selectedMatches: [],
      }),
    )

    const result = await listGoalsWithNodesForUser('user-1')

    expect(result.error).toBeNull()
    expect(result.data).toEqual([])
    expect(queryLog).toEqual(['goals'])
  })
})
