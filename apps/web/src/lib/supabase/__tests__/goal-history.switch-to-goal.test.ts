import { describe, expect, it } from 'vitest'
import { switchToGoal } from '../goal-history'

type TableName = 'goal_history' | 'compiled_plans'
type Row = Record<string, unknown>
type QueryError = { message: string }
type ManyResult = { data: Row[] | null; error: null }
type SingleResult = { data: Row | null; error: QueryError | null }
type MaybeSingleResult = { data: Row | null; error: QueryError | null }

function pickColumns(row: Row, columns?: string) {
  if (!columns || columns === '*') return { ...row }

  const columnNames = columns.split(',').map((value) => value.trim())
  return Object.fromEntries(columnNames.map((column) => [column, row[column]]))
}

function createGoalHistoryClientFixture(params: {
  userId?: string
  goalHistory: Row[]
  compiledPlans: Row[]
}) {
  const tables: Record<TableName, Row[]> = {
    goal_history: params.goalHistory.map((row) => ({ ...row })),
    compiled_plans: params.compiledPlans.map((row) => ({ ...row })),
  }

  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: params.userId ?? 'user-1' } },
        error: null,
      }),
    },
    from(table: TableName) {
      const state = {
        filters: [] as Array<[string, unknown]>,
        mode: 'select' as 'select' | 'update',
        patch: null as Row | null,
        selected: undefined as string | undefined,
      }

      const matches = (row: Row) =>
        state.filters.every(([column, value]) => row[column] === value)

      const executeMany = (): ManyResult => {
        const matchedRows = tables[table].filter(matches)

        if (state.mode === 'update' && state.patch) {
          matchedRows.forEach((row) => Object.assign(row, state.patch))
        }

        const payloadRows = matchedRows.map((row) => pickColumns(row, state.selected))

        if (state.mode === 'update' && !state.selected) {
          return { data: null, error: null }
        }

        return { data: payloadRows, error: null }
      }

      const executeSingle = (): SingleResult => {
        const matchedRows = tables[table].filter(matches)

        if (state.mode === 'update' && state.patch) {
          matchedRows.forEach((row) => Object.assign(row, state.patch))
        }

        const payloadRows = matchedRows.map((row) => pickColumns(row, state.selected))

        if (payloadRows.length !== 1) {
          return {
            data: null,
            error: { message: `Expected single row, got ${payloadRows.length}` },
          }
        }

        return { data: payloadRows[0], error: null }
      }

      const executeMaybeSingle = (): MaybeSingleResult => {
        const matchedRows = tables[table].filter(matches)

        if (state.mode === 'update' && state.patch) {
          matchedRows.forEach((row) => Object.assign(row, state.patch))
        }

        const payloadRows = matchedRows.map((row) => pickColumns(row, state.selected))

        if (payloadRows.length > 1) {
          return {
            data: null,
            error: { message: `Expected zero or one row, got ${payloadRows.length}` },
          }
        }

        return { data: payloadRows[0] ?? null, error: null }
      }

      const builder = {
        select(columns = '*') {
          state.selected = columns
          return builder
        },
        update(patch: Row) {
          state.mode = 'update'
          state.patch = patch
          return builder
        },
        eq(column: string, value: unknown) {
          state.filters.push([column, value])
          return builder
        },
        single: async () => executeSingle(),
        maybeSingle: async () => executeMaybeSingle(),
        then: (
          onFulfilled?: (value: ManyResult) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise.resolve(executeMany()).then(onFulfilled, onRejected),
      }

      return builder
    },
    getRows(table: TableName) {
      return tables[table]
    },
  }
}

function createGoalHistoryRow(overrides: Partial<Row>): Row {
  return {
    id: 'goal-current',
    user_id: 'user-1',
    goal: 'Current goal',
    plan_id: 'plan-active',
    status: 'active',
    started_at: '2026-04-18T00:00:00.000Z',
    ended_at: null,
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

function createCompiledPlanRow(overrides: Partial<Row>): Row {
  return {
    id: 'compiled-plan-active',
    user_id: 'user-1',
    plan_id: 'plan-active',
    status: 'active',
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('switchToGoal', () => {
  it('returns an error and clears the dangling plan_id when the target compiled plan is missing', async () => {
    const client = createGoalHistoryClientFixture({
      goalHistory: [
        createGoalHistoryRow({ id: 'goal-active', goal: 'Active goal', plan_id: 'plan-active' }),
        createGoalHistoryRow({
          id: 'goal-target',
          goal: 'Target goal',
          plan_id: 'plan-missing',
          status: 'archived',
        }),
      ],
      compiledPlans: [
        createCompiledPlanRow({ id: 'compiled-plan-active', plan_id: 'plan-active', status: 'active' }),
      ],
    })

    const result = await switchToGoal('goal-target', client as never, {
      compiledPlanClient: client as never,
      userId: 'user-1',
    })

    expect(result).toEqual({
      data: null,
      error: 'target compiled plan missing',
    })
    expect(client.getRows('goal_history')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'goal-active', status: 'active', plan_id: 'plan-active' }),
        expect.objectContaining({ id: 'goal-target', status: 'archived', plan_id: null }),
      ]),
    )
    expect(client.getRows('compiled_plans')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'compiled-plan-active', status: 'active' }),
      ]),
    )
  })

  it('switches the active goal and compiled plan when the target compiled plan exists', async () => {
    const client = createGoalHistoryClientFixture({
      goalHistory: [
        createGoalHistoryRow({ id: 'goal-active', goal: 'Active goal', plan_id: 'plan-active' }),
        createGoalHistoryRow({
          id: 'goal-target',
          goal: 'Target goal',
          plan_id: 'plan-target',
          status: 'archived',
        }),
      ],
      compiledPlans: [
        createCompiledPlanRow({ id: 'compiled-plan-active', plan_id: 'plan-active', status: 'active' }),
        createCompiledPlanRow({ id: 'compiled-plan-target', plan_id: 'plan-target', status: 'archived' }),
      ],
    })

    const result = await switchToGoal('goal-target', client as never, {
      compiledPlanClient: client as never,
      userId: 'user-1',
    })

    expect(result.error).toBeNull()
    expect(result.data).toEqual(
      expect.objectContaining({
        id: 'goal-target',
        status: 'active',
        plan_id: 'plan-target',
      }),
    )
    expect(client.getRows('goal_history')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'goal-active', status: 'archived' }),
        expect.objectContaining({ id: 'goal-target', status: 'active', ended_at: null }),
      ]),
    )
    expect(client.getRows('compiled_plans')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'compiled-plan-active', status: 'archived' }),
        expect.objectContaining({ id: 'compiled-plan-target', status: 'active' }),
      ]),
    )
  })
})
