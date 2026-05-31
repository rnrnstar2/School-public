import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/lib/supabase/database.types'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  insertGoalContextsMock: vi.fn(),
  insertGoalNodesMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('@/lib/supabase/decision-ledger', () => ({
  insertGoalContexts: mocks.insertGoalContextsMock,
  insertGoalNodes: mocks.insertGoalNodesMock,
}))

const { compileGoalChatOutput } = await import('./speak2action')

type GoalRow = Database['decision_ledger']['Tables']['goals']['Row']
type GoalNodeRow = Database['decision_ledger']['Tables']['goal_nodes']['Row']

let goalRows: GoalRow[] = []
let goalNodeRows: GoalNodeRow[] = []

function makeGoal(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: 'goal-1',
    user_id: 'user-1',
    title: 'ポートフォリオを仕上げる',
    description: null,
    status: 'active',
    deadline: null,
    metadata: {},
    created_at: '2026-04-19T00:00:00.000Z',
    updated_at: '2026-04-19T00:00:00.000Z',
    ...overrides,
  }
}

function makeNode(overrides: Partial<GoalNodeRow> = {}): GoalNodeRow {
  return {
    id: 'node-1',
    goal_id: 'goal-1',
    parent_node_id: null,
    label: '現状確認',
    node_type: 'task',
    status: 'in_progress',
    sort_order: 0,
    owner_type: 'user',
    depends_on_node_ids: [],
    fallback_node_id: null,
    metadata: {},
    created_at: '2026-04-19T00:00:00.000Z',
    updated_at: '2026-04-19T00:00:00.000Z',
    ...overrides,
  }
}

function createBuilder(rows: Array<Record<string, unknown>>) {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  let sortColumn: string | null = null
  let ascending = true
  let limitValue: number | null = null

  const apply = () => {
    let result = rows.filter((row) => filters.every((filter) => filter(row)))

    if (sortColumn) {
      const activeSortColumn = sortColumn
      result = [...result].sort((left, right) => {
        const leftValue = left[activeSortColumn]
        const rightValue = right[activeSortColumn]
        if (leftValue === rightValue) return 0
        if (leftValue == null) return ascending ? -1 : 1
        if (rightValue == null) return ascending ? 1 : -1
        return leftValue < rightValue
          ? (ascending ? -1 : 1)
          : (ascending ? 1 : -1)
      })
    }

    if (typeof limitValue === 'number') {
      result = result.slice(0, limitValue)
    }

    return result
  }

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return builder
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value)
      return builder
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      sortColumn = column
      ascending = options?.ascending !== false
      return builder
    },
    limit: (value: number) => {
      limitValue = value
      return builder
    },
    maybeSingle: async () => ({
      data: apply()[0] ?? null,
      error: null,
    }),
    then: (
      onFulfilled: ((value: { data: Record<string, unknown>[] | null; error: null }) => unknown) | null | undefined,
      onRejected?: ((reason: unknown) => unknown) | null | undefined,
    ) => Promise.resolve({
      data: apply(),
      error: null,
    }).then(onFulfilled, onRejected),
  }

  return builder
}

describe('compileGoalChatOutput', () => {
  beforeEach(() => {
    goalRows = []
    goalNodeRows = []
    mocks.createServiceClientMock.mockReset()
    mocks.insertGoalContextsMock.mockReset()
    mocks.insertGoalNodesMock.mockReset()
    mocks.createServiceClientMock.mockReturnValue({
      schema: () => ({
        from: (table: string) => {
          if (table === 'goals') {
            return createBuilder(goalRows)
          }
          if (table === 'goal_nodes') {
            return createBuilder(goalNodeRows)
          }
          return createBuilder([])
        },
      }),
    })
  })

  it('inserts decisions, open questions, and a child task node on success', async () => {
    goalRows = [makeGoal()]
    goalNodeRows = [
      makeNode({ id: 'parent-1', sort_order: 1 }),
      makeNode({ id: 'sibling-1', parent_node_id: 'parent-1', sort_order: 4 }),
    ]
    mocks.insertGoalContextsMock.mockResolvedValue({
      data: [{ id: 'context-1' }],
      error: null,
    })
    mocks.insertGoalNodesMock.mockResolvedValue({
      data: [{ id: 'task-1' }],
      error: null,
    })

    const result = await compileGoalChatOutput({
      goalId: 'goal-1',
      userId: 'user-1',
      structuredOutput: {
        reply: '整理しました',
        decisions: ['LP を先に出す'],
        open_questions: ['CTA をどこに置くか'],
        next_question: null,
        next_action: 'ヒーロー文言を先に書く',
      },
      chatContext: {
        nodeId: 'parent-1',
        source: 'lesson_chat:/lessons/atom.goal-tree.fixture',
      },
    })

    expect(result).toMatchObject({
      kind: 'ok',
      ok: true,
      inserted: {
        decisions: 1,
        openQuestions: 1,
        taskNodeId: 'task-1',
      },
      error: [],
    })

    expect(mocks.insertGoalContextsMock).toHaveBeenCalledTimes(2)
    expect(mocks.insertGoalContextsMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      [
        expect.objectContaining({
          goal_id: 'goal-1',
          node_id: 'parent-1',
          source_type: 'speak2action_decision',
          source_uri: '/lessons/atom.goal-tree.fixture',
          content: 'LP を先に出す',
        }),
      ],
    )
    expect(mocks.insertGoalNodesMock).toHaveBeenCalledWith(
      expect.anything(),
      [
        expect.objectContaining({
          goal_id: 'goal-1',
          parent_node_id: 'parent-1',
          label: 'ヒーロー文言を先に書く',
          owner_type: 'user',
          sort_order: 5,
          metadata: expect.objectContaining({
            speak2action: true,
            speak2action_kind: 'next_action',
            chat_source: 'lesson_chat',
            source_uri: '/lessons/atom.goal-tree.fixture',
          }),
        }),
      ],
    )
  })

  it('returns partial success when goal_context inserts fail but next_action still succeeds', async () => {
    goalRows = [makeGoal()]
    goalNodeRows = [makeNode({ id: 'parent-1', sort_order: 2 })]
    mocks.insertGoalContextsMock.mockResolvedValue({
      data: null,
      error: 'goal_context insert failed',
    })
    mocks.insertGoalNodesMock.mockResolvedValue({
      data: [{ id: 'task-2' }],
      error: null,
    })

    const result = await compileGoalChatOutput({
      goalId: 'goal-1',
      userId: 'user-1',
      structuredOutput: {
        reply: '整理しました',
        decisions: ['先に README を書く'],
        open_questions: [],
        next_question: null,
        next_action: 'README の見出しを固める',
      },
      chatContext: {
        nodeId: 'parent-1',
        source: 'mentor_chat:/goals/goal-1',
      },
    })

    expect(result).toMatchObject({
      kind: 'ok',
      ok: false,
      inserted: {
        decisions: 0,
        openQuestions: 0,
        taskNodeId: 'task-2',
      },
    })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.error).toEqual([
        'decision "先に README を書く": goal_context insert failed',
      ])
    }
  })

  it('returns an explicit no-op shape when there is nothing to compile', async () => {
    goalRows = [makeGoal()]

    const result = await compileGoalChatOutput({
      goalId: 'goal-1',
      userId: 'user-1',
      structuredOutput: {
        reply: '了解しました',
        decisions: ['   '],
        open_questions: [],
        next_question: null,
        next_action: '   ',
      },
      chatContext: {
        nodeId: 'parent-1',
        source: 'mentor_chat:/goals/goal-1',
      },
    })

    expect(result).toEqual({
      kind: 'ok',
      ok: true,
      inserted: {
        decisions: 0,
        openQuestions: 0,
        taskNodeId: undefined,
      },
      error: [],
    })
    expect(mocks.insertGoalContextsMock).not.toHaveBeenCalled()
    expect(mocks.insertGoalNodesMock).not.toHaveBeenCalled()
  })

  it('rejects the compile round when chatContext.nodeId does not belong to the goal', async () => {
    goalRows = [makeGoal()]
    goalNodeRows = []

    const result = await compileGoalChatOutput({
      goalId: 'goal-1',
      userId: 'user-1',
      structuredOutput: {
        reply: '整理しました',
        decisions: ['先に README を書く'],
        open_questions: ['ゴールをどこまで絞るか'],
        next_question: null,
        next_action: 'README の見出しを固める',
      },
      chatContext: {
        nodeId: 'missing-parent',
        source: 'mentor_chat:/goals/goal-1',
      },
    })

    expect(result).toEqual({
      kind: 'ok',
      ok: false,
      inserted: {
        decisions: 0,
        openQuestions: 0,
        taskNodeId: undefined,
      },
      error: ['chatContext.nodeId does not belong to this goal'],
    })
    expect(mocks.insertGoalContextsMock).not.toHaveBeenCalled()
    expect(mocks.insertGoalNodesMock).not.toHaveBeenCalled()
  })
})
