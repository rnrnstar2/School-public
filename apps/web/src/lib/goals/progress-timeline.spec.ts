import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createServiceClientMock: vi.fn(),
  fetchAtomsByIdsMock: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClientMock,
}))

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchAtomsByIds: mocks.fetchAtomsByIdsMock,
}))

const { listProgressTimelineForGoal } = await import('./progress-timeline')

function createArrayQuery<TRow extends Record<string, unknown>>(rows: TRow[]) {
  let filteredRows = [...rows]

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filteredRows = filteredRows.filter((row) => row[column] === value)
      return builder
    }),
    neq: vi.fn((column: string, value: unknown) => {
      filteredRows = filteredRows.filter((row) => row[column] !== value)
      return builder
    }),
    not: vi.fn((column: string, operator: string, value: unknown) => {
      if (operator === 'is' && value === null) {
        filteredRows = filteredRows.filter((row) => row[column] != null)
        return builder
      }

      throw new Error(`Unsupported not filter: ${column} ${operator} ${String(value)}`)
    }),
    in: vi.fn((column: string, values: unknown[]) => {
      const valueSet = new Set(values)
      filteredRows = filteredRows.filter((row) => valueSet.has(row[column]))
      return builder
    }),
    order: vi.fn((column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
      filteredRows = [...filteredRows].sort((left, right) => {
        const leftValue = left[column]
        const rightValue = right[column]
        const leftNull = leftValue == null
        const rightNull = rightValue == null

        if (leftValue === rightValue) {
          return 0
        }

        if (leftNull || rightNull) {
          if (leftNull && rightNull) {
            return 0
          }

          const nullsFirst = options?.nullsFirst ?? options?.ascending === false
          return leftNull
            ? (nullsFirst ? -1 : 1)
            : (nullsFirst ? 1 : -1)
        }

        if (options?.ascending === false) {
          return String(rightValue).localeCompare(String(leftValue))
        }

        return String(leftValue).localeCompare(String(rightValue))
      })
      return builder
    }),
    limit: vi.fn((value: number) => {
      filteredRows = filteredRows.slice(0, value)
      return builder
    }),
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
  goals: Array<Record<string, unknown>>
  goalContexts: Array<Record<string, unknown>>
  goalNodes: Array<Record<string, unknown>>
  selectedLessonMatches: Array<Record<string, unknown>>
  compiledPlans: Array<Record<string, unknown>>
  goalHistory: Array<Record<string, unknown>>
  taskProgress: Array<Record<string, unknown>>
  userProgress: Array<Record<string, unknown>>
  telemetryEvents: Array<Record<string, unknown>>
}) {
  return {
    schema(schemaName: string) {
      expect(schemaName).toBe('decision_ledger')

      return {
        from(table: string) {
          if (table === 'goals') {
            return createArrayQuery(params.goals)
          }

          if (table === 'goal_contexts') {
            return createArrayQuery(params.goalContexts)
          }

          if (table === 'goal_nodes') {
            return createArrayQuery(params.goalNodes)
          }

          if (table === 'goal_node_lesson_matches') {
            return createArrayQuery(params.selectedLessonMatches)
          }

          throw new Error(`Unexpected decision_ledger table: ${table}`)
        },
      }
    },
    from(table: string) {
      if (table === 'compiled_plans') {
        return createArrayQuery(params.compiledPlans)
      }

      if (table === 'goal_history') {
        return createArrayQuery(params.goalHistory)
      }

      if (table === 'task_progress') {
        return createArrayQuery(params.taskProgress)
      }

      if (table === 'user_progress') {
        return createArrayQuery(params.userProgress)
      }

      if (table === 'telemetry_events') {
        return createArrayQuery(params.telemetryEvents)
      }

      throw new Error(`Unexpected public table: ${table}`)
    },
  }
}

describe('listProgressTimelineForGoal', () => {
  beforeEach(() => {
    mocks.createServiceClientMock.mockReset()
    mocks.fetchAtomsByIdsMock.mockReset()
  })

  it('merges the four timeline sources and sorts newest first', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: 'Goal Context Panel を整える',
            metadata: { plan_id: 'plan-1' },
          },
        ],
        goalContexts: [
          {
            id: 'context-1',
            goal_id: 'goal-1',
            node_id: null,
            source_type: 'agent_delegation_brief',
            content: 'Execution Steps を更新する',
            metadata: { agent: 'codex' },
            created_at: '2026-04-18T05:00:00.000Z',
          },
        ],
        goalNodes: [
          {
            id: 'node-1',
            goal_id: 'goal-1',
            label: 'UI セクションを揃える',
            status: 'done',
            owner_type: 'ai',
            metadata: {},
            updated_at: '2026-04-18T03:00:00.000Z',
          },
          {
            id: 'node-2',
            goal_id: 'goal-1',
            label: 'pending node',
            status: 'pending',
            owner_type: 'user',
            metadata: {},
            updated_at: '2026-04-18T02:00:00.000Z',
          },
        ],
        selectedLessonMatches: [
          {
            id: 'match-1',
            goal_node_id: 'node-1',
            lesson_id: 'atom.timeline.fixture',
            selected: true,
            created_at: '2026-04-18T01:00:00.000Z',
          },
        ],
        compiledPlans: [
          {
            plan_id: 'plan-1',
            user_id: 'user-1',
            goal: 'Goal Context Panel を整える',
            created_at: '2026-04-18T00:00:00.000Z',
          },
        ],
        goalHistory: [],
        taskProgress: [
          {
            id: 'tp-1',
            plan_id: 'plan-1',
            task_id: 'task-1',
            title: 'Progress Timeline section を追加する',
            relevant_lesson_ids: ['atom.timeline.fixture'],
            completed_at: '2026-04-18T04:00:00.000Z',
          },
        ],
        userProgress: [
          {
            id: 'up-1',
            user_id: 'user-1',
            lesson_id: 'atom.timeline.fixture',
            completed: true,
            completed_at: '2026-04-18T06:00:00.000Z',
          },
        ],
        telemetryEvents: [],
      }),
    )
    mocks.fetchAtomsByIdsMock.mockResolvedValue([
      {
        atomId: 'atom.timeline.fixture',
        title: 'Timeline 用 fixture lesson',
      },
    ])

    const result = await listProgressTimelineForGoal('user-1', 'goal-1')

    expect(result.kind).toBe('ok')
    expect(result).toMatchObject({
      kind: 'ok',
      data: [
        {
          type: 'lesson_completion',
          actor: 'user',
          label: 'Lesson completed',
          description: 'Timeline 用 fixture lesson',
          icon: '👤',
          occurred_at: '2026-04-18T06:00:00.000Z',
        },
        {
          type: 'goal_context',
          actor: 'codex',
          label: 'Context: agent delegation brief',
          description: 'Execution Steps を更新する',
          icon: '⚡',
          occurred_at: '2026-04-18T05:00:00.000Z',
        },
        {
          type: 'task_progress',
          actor: 'user',
          label: 'Task completed',
          description: 'Progress Timeline section を追加する',
          icon: '👤',
          occurred_at: '2026-04-18T04:00:00.000Z',
        },
        {
          type: 'goal_node_status',
          actor: 'ai',
          label: 'Node completed',
          description: 'UI セクションを揃える',
          icon: '🤖',
          occurred_at: '2026-04-18T03:00:00.000Z',
        },
      ],
    })
  })

  it('returns forbidden when the goal belongs to another user', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'other-user',
            title: 'Goal Context Panel を整える',
            metadata: {},
          },
        ],
        goalContexts: [],
        goalNodes: [],
        selectedLessonMatches: [],
        compiledPlans: [],
        goalHistory: [],
        taskProgress: [],
        userProgress: [],
        telemetryEvents: [],
      }),
    )

    const result = await listProgressTimelineForGoal('user-1', 'goal-1')

    expect(result).toEqual({
      kind: 'forbidden',
    })
    expect(mocks.fetchAtomsByIdsMock).not.toHaveBeenCalled()
  })

  it('falls back to telemetry lesson completions when user_progress has no matches', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: 'SQL を学ぶ',
            metadata: { plan_id: 'plan-1' },
          },
        ],
        goalContexts: [
          {
            id: 'context-1',
            goal_id: 'goal-1',
            node_id: null,
            source_type: 'other',
            content: 'Goal context survives even without user_progress rows',
            metadata: {},
            created_at: '2026-04-18T05:00:00.000Z',
          },
        ],
        goalNodes: [],
        selectedLessonMatches: [],
        compiledPlans: [
          {
            plan_id: 'plan-1',
            parent_plan_id: null,
            user_id: 'user-1',
            goal: 'SQL を学ぶ',
            created_at: '2026-04-18T00:00:00.000Z',
          },
        ],
        goalHistory: [],
        taskProgress: [
          {
            id: 'tp-1',
            plan_id: 'plan-1',
            task_id: 'task-1',
            title: 'JOIN を試す',
            relevant_lesson_ids: ['atom.sql.join'],
            completed_at: '2026-04-18T04:00:00.000Z',
          },
        ],
        userProgress: [],
        telemetryEvents: [
          {
            event_id: 'telemetry-1',
            user_id: 'user-1',
            plan_id: 'plan-1',
            atom_id: 'atom.sql.join',
            event_name: 'lesson_completed',
            occurred_at: '2026-04-18T06:00:00.000Z',
            source: 'lessons_complete_route',
            properties: {},
          },
        ],
      }),
    )
    mocks.fetchAtomsByIdsMock.mockResolvedValue([
      {
        atomId: 'atom.sql.join',
        title: 'JOIN lesson',
      },
    ])

    const result = await listProgressTimelineForGoal('user-1', 'goal-1')

    expect(result).toMatchObject({
      kind: 'ok',
      data: expect.arrayContaining([
        expect.objectContaining({
          type: 'goal_context',
          description: 'Goal context survives even without user_progress rows',
        }),
        expect.objectContaining({
          type: 'lesson_completion',
          description: 'JOIN lesson',
          occurred_at: '2026-04-18T06:00:00.000Z',
        }),
      ]),
    })
  })

  it('scopes plan lookups to the goal-linked plan lineage instead of matching by title', async () => {
    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: '同じタイトルの goal',
            metadata: { plan_id: 'plan-1' },
          },
        ],
        goalContexts: [],
        goalNodes: [],
        selectedLessonMatches: [],
        compiledPlans: [
          {
            plan_id: 'plan-2',
            parent_plan_id: null,
            user_id: 'user-1',
            goal: '同じタイトルの goal',
            created_at: '2026-04-18T02:00:00.000Z',
          },
          {
            plan_id: 'plan-1',
            parent_plan_id: null,
            user_id: 'user-1',
            goal: '同じタイトルの goal',
            created_at: '2026-04-18T01:00:00.000Z',
          },
        ],
        goalHistory: [],
        taskProgress: [
          {
            id: 'tp-keep',
            plan_id: 'plan-1',
            task_id: 'task-keep',
            title: 'Goal-linked task',
            relevant_lesson_ids: ['atom.keep'],
            completed_at: '2026-04-18T04:00:00.000Z',
          },
          {
            id: 'tp-leak',
            plan_id: 'plan-2',
            task_id: 'task-leak',
            title: 'Unrelated task from same-title goal',
            relevant_lesson_ids: ['atom.leak'],
            completed_at: '2026-04-18T05:00:00.000Z',
          },
        ],
        userProgress: [],
        telemetryEvents: [],
      }),
    )
    mocks.fetchAtomsByIdsMock.mockResolvedValue([
      {
        atomId: 'atom.keep',
        title: 'Keep lesson',
      },
    ])

    const result = await listProgressTimelineForGoal('user-1', 'goal-1')

    expect(result).toMatchObject({
      kind: 'ok',
      data: expect.arrayContaining([
        expect.objectContaining({
          type: 'task_progress',
          description: 'Goal-linked task',
        }),
      ]),
    })
    if (result.kind !== 'ok') {
      throw new Error('expected ok timeline result')
    }
    expect(result.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Unrelated task from same-title goal',
        }),
      ]),
    )
  })

  it('filters pending nodes before limiting source rows', async () => {
    const pendingNodes = Array.from({ length: 30 }, (_, index) => ({
      id: `pending-${index + 1}`,
      goal_id: 'goal-1',
      label: `pending node ${index + 1}`,
      status: 'pending',
      owner_type: 'user',
      metadata: {},
      updated_at: `2026-04-18T00:${String(59 - index).padStart(2, '0')}:00.000Z`,
    }))

    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: 'Node filtering',
            metadata: {},
          },
        ],
        goalContexts: [],
        goalNodes: [
          ...pendingNodes,
          {
            id: 'done-node',
            goal_id: 'goal-1',
            label: 'older non-pending node',
            status: 'done',
            owner_type: 'ai',
            metadata: {},
            updated_at: '2026-04-17T23:00:00.000Z',
          },
        ],
        selectedLessonMatches: [],
        compiledPlans: [],
        goalHistory: [],
        taskProgress: [],
        userProgress: [],
        telemetryEvents: [],
      }),
    )
    mocks.fetchAtomsByIdsMock.mockResolvedValue([])

    const result = await listProgressTimelineForGoal('user-1', 'goal-1', { limit: 1 })

    expect(result).toMatchObject({
      kind: 'ok',
      data: [
        expect.objectContaining({
          type: 'goal_node_status',
          description: 'older non-pending node',
        }),
      ],
    })
  })

  it('filters incomplete task_progress rows before ordering and limiting', async () => {
    const incompleteRows = Array.from({ length: 40 }, (_, index) => ({
      id: `tp-null-${index + 1}`,
      plan_id: 'plan-1',
      task_id: `task-null-${index + 1}`,
      title: `Incomplete task ${index + 1}`,
      relevant_lesson_ids: [],
      completed_at: null,
    }))
    const completedRows = Array.from({ length: 10 }, (_, index) => ({
      id: `tp-complete-${index + 1}`,
      plan_id: 'plan-1',
      task_id: `task-complete-${index + 1}`,
      title: `Completed task ${index + 1}`,
      relevant_lesson_ids: [],
      completed_at: `2026-04-17T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
    }))

    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: 'Task progress filtering',
            metadata: { plan_id: 'plan-1' },
          },
        ],
        goalContexts: [],
        goalNodes: [],
        selectedLessonMatches: [],
        compiledPlans: [
          {
            plan_id: 'plan-1',
            parent_plan_id: null,
            user_id: 'user-1',
            goal: 'Task progress filtering',
            created_at: '2026-04-18T00:00:00.000Z',
          },
        ],
        goalHistory: [],
        taskProgress: [...incompleteRows, ...completedRows],
        userProgress: [],
        telemetryEvents: [],
      }),
    )
    mocks.fetchAtomsByIdsMock.mockResolvedValue([])

    const result = await listProgressTimelineForGoal('user-1', 'goal-1', { limit: 20 })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') {
      throw new Error('expected ok timeline result')
    }

    expect(result.data).toHaveLength(10)
    expect(result.data.map((event) => event.description)).toEqual([
      'Completed task 10',
      'Completed task 9',
      'Completed task 8',
      'Completed task 7',
      'Completed task 6',
      'Completed task 5',
      'Completed task 4',
      'Completed task 3',
      'Completed task 2',
      'Completed task 1',
    ])
  })

  it('filters non-selected lesson matches before ordering and limiting', async () => {
    const selectedLessonIds = Array.from({ length: 5 }, (_, index) => `atom.selected.${index + 1}`)

    const nonSelectedRows = Array.from({ length: 100 }, (_, index) => ({
      id: `match-non-selected-${index + 1}`,
      goal_node_id: 'node-1',
      lesson_id: `atom.non-selected.${index + 1}`,
      selected: false,
      created_at: `2026-04-18T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00.000Z`,
    }))
    const selectedRows = selectedLessonIds.map((lessonId, index) => ({
      id: `match-selected-${index + 1}`,
      goal_node_id: 'node-1',
      lesson_id: lessonId,
      selected: true,
      created_at: `2026-04-17T${String(20 + index).padStart(2, '0')}:00:00.000Z`,
    }))

    mocks.createServiceClientMock.mockReturnValue(
      createServiceClientFixture({
        goals: [
          {
            id: 'goal-1',
            user_id: 'user-1',
            title: 'Selected lesson filtering',
            metadata: {},
          },
        ],
        goalContexts: [],
        goalNodes: [
          {
            id: 'node-1',
            goal_id: 'goal-1',
            label: 'Keep selected lessons only',
            status: 'done',
            owner_type: 'ai',
            metadata: {},
            updated_at: '2026-04-18T03:00:00.000Z',
          },
        ],
        selectedLessonMatches: [...nonSelectedRows, ...selectedRows],
        compiledPlans: [],
        goalHistory: [],
        taskProgress: [],
        userProgress: selectedLessonIds.map((lessonId, index) => ({
          id: `up-selected-${index + 1}`,
          user_id: 'user-1',
          lesson_id: lessonId,
          completed: true,
          completed_at: `2026-04-18T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
        })),
        telemetryEvents: [],
      }),
    )
    mocks.fetchAtomsByIdsMock.mockResolvedValue(
      selectedLessonIds.map((lessonId, index) => ({
        atomId: lessonId,
        title: `Selected lesson ${index + 1}`,
      })),
    )

    const result = await listProgressTimelineForGoal('user-1', 'goal-1', { limit: 20 })

    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') {
      throw new Error('expected ok timeline result')
    }

    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'goal_node_status',
          description: 'Keep selected lessons only',
        }),
        expect.objectContaining({
          type: 'lesson_completion',
          description: 'Selected lesson 1',
        }),
        expect.objectContaining({
          type: 'lesson_completion',
          description: 'Selected lesson 5',
        }),
      ]),
    )
    expect(result.data).toHaveLength(6)
    expect(result.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringContaining('non-selected'),
        }),
      ]),
    )
  })
})
