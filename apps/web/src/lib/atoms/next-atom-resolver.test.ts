import assert from 'node:assert/strict'
import test from 'node:test'
import { previewNextAtom, resolveNextAtom } from './next-atom-resolver'

type ActivePlanFixture = {
  planId: string
  userId: string
  steps: unknown[]
}

function createCompiledPlansClient(plan: ActivePlanFixture | null) {
  const state = {
    plan: plan
      ? {
          planId: plan.planId,
          userId: plan.userId,
          steps: structuredClone(plan.steps),
        }
      : null,
    updateCalls: 0,
  }

  const client = {
    from(table: string) {
      assert.equal(table, 'compiled_plans')

      const filters: Record<string, unknown> = {}

      const builder = {
        select() {
          return builder
        },
        eq(field: string, value: unknown) {
          filters[field] = value
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        maybeSingle: async () => {
          if (!state.plan) {
            return { data: null, error: null }
          }

          if (filters.user_id !== state.plan.userId || filters.status !== 'active') {
            return { data: null, error: null }
          }

          return {
            data: {
              plan_id: state.plan.planId,
              steps: structuredClone(state.plan.steps),
            },
            error: null,
          }
        },
        update(payload: Record<string, unknown>) {
          const updateFilters: Record<string, unknown> = {}

          const updateBuilder = {
            eq(field: string, value: unknown) {
              updateFilters[field] = value
              return updateBuilder
            },
            then(resolve: (value: { data: null; error: Error | null }) => void) {
              if (
                state.plan &&
                updateFilters.plan_id === state.plan.planId &&
                updateFilters.user_id === state.plan.userId
              ) {
                state.plan.steps = structuredClone(payload.steps as unknown[])
                state.updateCalls += 1
                resolve({ data: null, error: null })
                return
              }

              resolve({ data: null, error: new Error('update filter mismatch') })
            },
          }

          return updateBuilder
        },
      }

      return builder
    },
  }

  return {
    client,
    getSteps() {
      return structuredClone(state.plan?.steps ?? [])
    },
    getUpdateCalls() {
      return state.updateCalls
    },
  }
}

test('resolveNextAtom returns the next incomplete atom for a middle step', async () => {
  const fixture = createCompiledPlansClient({
    planId: 'plan-1',
    userId: 'user-1',
    steps: [
      { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
      { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-1', completed_at: null },
      { atom_id: 'atom-3', atom_title: 'Atom 3', milestone_id: 'ms-1', completed_at: null },
    ],
  })

  const result = await resolveNextAtom({
    userId: 'user-1',
    justCompletedAtomId: 'atom-2',
    client: fixture.client as never,
    now: '2026-04-09T00:00:00.000Z',
  })

  assert.deepEqual(result, {
    kind: 'next',
    nextAtomId: 'atom-3',
    nextAtomTitle: 'Atom 3',
    milestoneId: 'ms-1',
    progress: { completed: 2, total: 3 },
  })
  assert.equal(fixture.getUpdateCalls(), 1)
  assert.deepEqual(fixture.getSteps(), [
    { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
    { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-1', completed_at: '2026-04-09T00:00:00.000Z' },
    { atom_id: 'atom-3', atom_title: 'Atom 3', milestone_id: 'ms-1', completed_at: null },
  ])
})

test('resolveNextAtom returns plan_complete when the final atom is completed', async () => {
  const fixture = createCompiledPlansClient({
    planId: 'plan-2',
    userId: 'user-1',
    steps: [
      { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
      { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-2', completed_at: null },
    ],
  })

  const result = await resolveNextAtom({
    userId: 'user-1',
    justCompletedAtomId: 'atom-2',
    client: fixture.client as never,
    now: '2026-04-09T00:00:00.000Z',
  })

  assert.deepEqual(result, {
    kind: 'plan_complete',
    milestoneId: 'ms-2',
    progress: { completed: 2, total: 2 },
  })
  assert.equal(fixture.getUpdateCalls(), 1)
})

test('resolveNextAtom returns no_active_plan when the user has no active compiled plan', async () => {
  const fixture = createCompiledPlansClient(null)

  const result = await resolveNextAtom({
    userId: 'user-1',
    justCompletedAtomId: 'atom-2',
    client: fixture.client as never,
  })

  assert.deepEqual(result, {
    kind: 'no_active_plan',
    progress: { completed: 0, total: 0 },
  })
  assert.equal(fixture.getUpdateCalls(), 0)
})

test('resolveNextAtom is idempotent when the same atom is completed twice', async () => {
  const fixture = createCompiledPlansClient({
    planId: 'plan-3',
    userId: 'user-1',
    steps: [
      { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
      { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-1', completed_at: null },
      { atom_id: 'atom-3', atom_title: 'Atom 3', milestone_id: 'ms-1', completed_at: null },
    ],
  })

  const first = await resolveNextAtom({
    userId: 'user-1',
    justCompletedAtomId: 'atom-2',
    client: fixture.client as never,
    now: '2026-04-09T00:00:00.000Z',
  })
  const second = await resolveNextAtom({
    userId: 'user-1',
    justCompletedAtomId: 'atom-2',
    client: fixture.client as never,
    now: '2026-04-09T00:00:10.000Z',
  })

  assert.deepEqual(first, second)
  assert.equal(fixture.getUpdateCalls(), 1)
  assert.deepEqual(fixture.getSteps(), [
    { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
    { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-1', completed_at: '2026-04-09T00:00:00.000Z' },
    { atom_id: 'atom-3', atom_title: 'Atom 3', milestone_id: 'ms-1', completed_at: null },
  ])
})

test('previewNextAtom reports milestone completion without mutating plan state', async () => {
  const fixture = createCompiledPlansClient({
    planId: 'plan-4',
    userId: 'user-1',
    steps: [
      { atom_id: 'atom-1', atom_title: 'Atom 1', milestone_id: 'ms-1', completed_at: '2026-04-01T00:00:00.000Z' },
      { atom_id: 'atom-2', atom_title: 'Atom 2', milestone_id: 'ms-1', completed_at: null },
      { atom_id: 'atom-3', atom_title: 'Atom 3', milestone_id: 'ms-2', completed_at: null },
    ],
  })

  const result = await previewNextAtom({
    userId: 'user-1',
    justCompletedAtomId: 'atom-2',
    client: fixture.client as never,
    now: '2026-04-09T00:00:00.000Z',
  })

  assert.deepEqual(result, {
    kind: 'milestone_complete',
    nextAtomId: 'atom-3',
    nextAtomTitle: 'Atom 3',
    milestoneId: 'ms-1',
    progress: { completed: 2, total: 3 },
  })
  assert.equal(fixture.getUpdateCalls(), 0)
})
