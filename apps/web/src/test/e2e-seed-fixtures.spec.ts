import { describe, expect, it } from 'vitest'

import {
  assertSeedFixtureStepSucceeded,
  GOAL_TREE_FIXTURE_GOAL_ID,
  GOAL_TREE_FIXTURE_LESSON_ID,
  seedGoalTreeFixtureWithContext,
  TEST_USER_ID,
  type E2EQueryBuilder,
} from '../../e2e/helpers/db'

type MockQueryError = {
  message: string
  code?: string | null
  details?: string | null
  hint?: string | null
}

type MutationOperation = 'select' | 'insert' | 'upsert' | 'update' | 'delete'
type MutationKey = `${string}.${string}.${MutationOperation}`

function createMockAdminClient(overrides: Partial<Record<MutationKey, MockQueryError | null>> = {}) {
  const calls: MutationKey[] = []

  function buildQuery(schemaName: string, table: string) {
    let operation: MutationOperation = 'select'

    const resolve = () => {
      const key = `${schemaName}.${table}.${operation}` as MutationKey
      calls.push(key)

      return {
        data: null,
        error: overrides[key] ?? null,
      }
    }

    const builder = {} as E2EQueryBuilder<Record<string, unknown>>
    builder.select = () => {
      operation = 'select'
      return builder
    }
    builder.insert = () => {
      operation = 'insert'
      return builder
    }
    builder.upsert = () => {
      operation = 'upsert'
      return builder
    }
    builder.update = () => {
      operation = 'update'
      return builder
    }
    builder.delete = () => {
      operation = 'delete'
      return builder
    }
    builder.eq = () => builder
    builder.in = () => builder
    builder.is = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.maybeSingle = async () => resolve()
    builder.single = async () => resolve()
    builder.then = ((onfulfilled, onrejected) =>
      Promise.resolve(resolve()).then(onfulfilled, onrejected)) as E2EQueryBuilder<
      Record<string, unknown>
    >['then']

    return builder
  }

  const admin = {
    from: (table: string) => buildQuery('public', table),
    schema: (schemaName: string) => ({
      from: (table: string) => buildQuery(schemaName, table),
    }),
  }

  return {
    admin: admin as unknown as Parameters<typeof seedGoalTreeFixtureWithContext>[0]['admin'],
    calls,
  }
}

describe('assertSeedFixtureStepSucceeded', () => {
  it.each(['42P01', '42703', '42501'])('throws on loud seed failures for %s', (code) => {
    expect(() =>
      assertSeedFixtureStepSucceeded('seedGoalTreeFixture', 'goal insert', {
        code,
        message: 'fixture step failed',
      }),
    ).toThrow(`[e2e/db] seedGoalTreeFixture goal insert failed (${code}): fixture step failed`)
  })

  it('treats unique violations as idempotent success', () => {
    expect(() =>
      assertSeedFixtureStepSucceeded('seedGoalTreeFixture', 'goal insert', {
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      }),
    ).not.toThrow()
  })

  it('throws on unexpected failures without a Postgres code', () => {
    expect(() =>
      assertSeedFixtureStepSucceeded('seedGoalTreeFixture', 'goal insert', {
        message: 'TypeError: fetch failed',
      }),
    ).toThrow('[e2e/db] seedGoalTreeFixture goal insert failed: TypeError: fetch failed')
  })
})

describe('seedGoalTreeFixtureWithContext', () => {
  it('continues through duplicate inserts and returns the deterministic fixture payload', async () => {
    const duplicate = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    } satisfies MockQueryError
    const { admin, calls } = createMockAdminClient({
      'decision_ledger.goals.insert': duplicate,
      'decision_ledger.goal_nodes.insert': duplicate,
      'decision_ledger.goal_node_lesson_matches.insert': duplicate,
    })

    await expect(seedGoalTreeFixtureWithContext({ admin, uid: TEST_USER_ID })).resolves.toEqual({
      goalId: GOAL_TREE_FIXTURE_GOAL_ID,
      userId: TEST_USER_ID,
      lessonId: GOAL_TREE_FIXTURE_LESSON_ID,
    })

    expect(calls).toContain('decision_ledger.goals.insert')
    expect(calls).toContain('decision_ledger.goal_nodes.insert')
    expect(calls).toContain('decision_ledger.goal_node_lesson_matches.insert')
  })

  it('throws on relation errors and aborts later seed steps', async () => {
    const { admin, calls } = createMockAdminClient({
      'decision_ledger.goals.insert': {
        code: '42P01',
        message: 'relation "decision_ledger.goals" does not exist',
      },
    })

    await expect(seedGoalTreeFixtureWithContext({ admin, uid: TEST_USER_ID })).rejects.toThrow(
      '[e2e/db] seedGoalTreeFixture goal insert failed (42P01): relation "decision_ledger.goals" does not exist',
    )
    expect(calls).not.toContain('decision_ledger.goal_nodes.insert')
    expect(calls).not.toContain('decision_ledger.goal_node_lesson_matches.insert')
  })

  it('throws on unexpected errors and aborts later seed steps', async () => {
    const { admin, calls } = createMockAdminClient({
      'decision_ledger.goal_nodes.insert': {
        message: 'network request failed',
      },
    })

    await expect(seedGoalTreeFixtureWithContext({ admin, uid: TEST_USER_ID })).rejects.toThrow(
      '[e2e/db] seedGoalTreeFixture node insert failed: network request failed',
    )
    expect(calls).not.toContain('decision_ledger.goal_node_lesson_matches.insert')
  })
})
