/**
 * TQ-204: unit tests for resolveTodaysTasks helper.
 *
 * Note: existing `resolveNextAction` is covered by planner.spec.ts in
 * `__tests__/`. This file is intentionally narrow and only exercises the
 * new helper added for the "今日のタスク" /plan section.
 *
 * Uses Vitest because web's `test:vitest` owns `*.spec.ts` files.
 */

import { expect, test } from 'vitest'
import { resolveTodaysTasks } from './next-action-resolver'
import type { AtomCompiledPlan, AtomPlanStep } from './plan-compiler'
import type { CompiledPlan, CompiledPlanNode } from './types'

function makeAtomStep(
  partial: Partial<AtomPlanStep> & Pick<AtomPlanStep, 'atomId' | 'title'>,
): AtomPlanStep {
  return {
    atomId: partial.atomId,
    title: partial.title,
    rationale: partial.rationale ?? `${partial.atomId} rationale`,
    estimatedMinutes: partial.estimatedMinutes ?? 20,
    milestoneId: partial.milestoneId ?? null,
    prerequisiteAtomIds: partial.prerequisiteAtomIds ?? [],
    softPrerequisiteAtomIds: partial.softPrerequisiteAtomIds ?? [],
    completedAt: partial.completedAt ?? null,
    skipped: partial.skipped,
  }
}

function makeAtomPlan(steps: AtomPlanStep[]): AtomCompiledPlan {
  return {
    goal: 'test goal',
    goalTags: [],
    steps,
    milestones: [],
    coverageScore: 1,
    unsupportedCapabilities: [],
    rationale: 'test plan',
    source: 'topo',
  }
}

function makeNode(
  partial: Partial<CompiledPlanNode> & Pick<CompiledPlanNode, 'id' | 'lessonTitle'>,
): CompiledPlanNode {
  return {
    id: partial.id,
    lessonId: partial.lessonId ?? partial.id,
    lessonTitle: partial.lessonTitle,
    milestoneId: partial.milestoneId ?? 'ms-1',
    sortOrder: partial.sortOrder ?? 0,
    rationale: partial.rationale ?? `${partial.id} rationale`,
    difficulty: partial.difficulty ?? 'beginner',
    estimatedMinutes: partial.estimatedMinutes ?? 30,
    prerequisiteNodeIds: partial.prerequisiteNodeIds ?? [],
  }
}

function makeCompiledPlan(
  nodes: CompiledPlanNode[],
  overrides?: Partial<CompiledPlan>,
): CompiledPlan {
  return {
    title: 'test plan',
    summary: 'summary',
    milestones: [],
    nodes,
    gapTasks: [],
    metadata: {
      totalEstimatedMinutes: 0,
      lessonCount: nodes.length,
      domainsCovered: [],
    },
    ...overrides,
  }
}

test('resolveTodaysTasks returns up to 3 incomplete atom steps with ready=true', () => {
  const steps = Array.from({ length: 7 }, (_, i) =>
    makeAtomStep({ atomId: `atom-${i}`, title: `Step ${i}` }),
  )
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks).toHaveLength(3)
  expect(tasks[0].id).toBe('atom-0')
  expect(tasks[0].lessonId).toBe('atom-0')
  expect(tasks[0].title).toBe('Step 0')
  expect(tasks[0].ready).toBe(true)
  expect(tasks[2].id).toBe('atom-2')
})

test('resolveTodaysTasks skips already-completed atoms', () => {
  const steps = [
    makeAtomStep({ atomId: 'a', title: 'A' }),
    makeAtomStep({ atomId: 'b', title: 'B' }),
    makeAtomStep({ atomId: 'c', title: 'C' }),
  ]
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, ['a'], { limit: 5 })

  expect(tasks.map((t) => t.id)).toEqual(['b', 'c'])
})

test('resolveTodaysTasks marks ready=false when prerequisites unmet', () => {
  const steps = [
    makeAtomStep({ atomId: 'a', title: 'A', prerequisiteAtomIds: ['missing-a'] }),
    makeAtomStep({ atomId: 'b', title: 'B', prerequisiteAtomIds: ['missing-b'] }),
  ]
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks).toHaveLength(2)
  expect(tasks[0].id).toBe('a')
  expect(tasks[0].ready).toBe(false)
  expect(tasks[1].id).toBe('b')
  expect(tasks[1].ready).toBe(false)
})

test('resolveTodaysTasks hides blocked atoms when ready atoms exist', () => {
  const steps = [
    makeAtomStep({ atomId: 'a', title: 'A', prerequisiteAtomIds: ['missing'] }),
    makeAtomStep({ atomId: 'b', title: 'B' }),
    makeAtomStep({ atomId: 'c', title: 'C' }),
  ]
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks.map((task) => task.id)).toEqual(['b', 'c'])
  expect(tasks.every((task) => task.ready)).toBe(true)
})

test('resolveTodaysTasks falls back to blocked atoms when no ready atoms exist', () => {
  const steps = [
    makeAtomStep({ atomId: 'a', title: 'A', prerequisiteAtomIds: ['missing-a'] }),
    makeAtomStep({ atomId: 'b', title: 'B', prerequisiteAtomIds: ['missing-b'] }),
  ]
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks.map((task) => task.id)).toEqual(['a', 'b'])
  expect(tasks.every((task) => !task.ready)).toBe(true)
})

test('resolveTodaysTasks honors custom limit', () => {
  const steps = Array.from({ length: 10 }, (_, i) =>
    makeAtomStep({ atomId: `atom-${i}`, title: `Step ${i}` }),
  )
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, [], { limit: 3 })

  expect(tasks).toHaveLength(3)
})

test('resolveTodaysTasks excludes skipped atoms', () => {
  const steps = [
    makeAtomStep({ atomId: 'a', title: 'A' }),
    makeAtomStep({ atomId: 'b', title: 'B', skipped: true }),
    makeAtomStep({ atomId: 'c', title: 'C' }),
  ]
  const plan = makeAtomPlan(steps)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks.map((t) => t.id)).toEqual(['a', 'c'])
})

test('resolveTodaysTasks returns [] for empty atom plan', () => {
  const plan = makeAtomPlan([])
  expect(resolveTodaysTasks(plan, [])).toEqual([])
})

test('resolveTodaysTasks orders CompiledPlan nodes by sortOrder, excluding completed', () => {
  const nodes = [
    makeNode({ id: 'n2', lessonTitle: 'Second', sortOrder: 2 }),
    makeNode({ id: 'n0', lessonTitle: 'Zeroth', sortOrder: 0 }),
    makeNode({ id: 'n1', lessonTitle: 'First', sortOrder: 1 }),
  ]
  const plan = makeCompiledPlan(nodes)

  const tasks = resolveTodaysTasks(plan, ['n0'], { limit: 5 })

  expect(tasks.map((t) => t.id)).toEqual(['n1', 'n2'])
})

test('resolveTodaysTasks honors limit option for CompiledPlan', () => {
  const nodes = Array.from({ length: 6 }, (_, i) =>
    makeNode({ id: `n${i}`, lessonTitle: `T${i}`, sortOrder: i }),
  )
  const plan = makeCompiledPlan(nodes)

  expect(resolveTodaysTasks(plan, [], { limit: 3 })).toHaveLength(3)
})

test('resolveTodaysTasks marks node ready=false when prerequisite node not completed', () => {
  const nodes = [
    makeNode({ id: 'n0', lessonTitle: 'T0', sortOrder: 0, prerequisiteNodeIds: ['missing-0'] }),
    makeNode({
      id: 'n1',
      lessonTitle: 'T1',
      sortOrder: 1,
      prerequisiteNodeIds: ['missing-1'],
    }),
  ]
  const plan = makeCompiledPlan(nodes)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks[0].id).toBe('n0')
  expect(tasks[0].ready).toBe(false)
  expect(tasks[1].id).toBe('n1')
  expect(tasks[1].ready).toBe(false)
})

test('resolveTodaysTasks hides blocked CompiledPlan nodes when ready nodes exist', () => {
  const nodes = [
    makeNode({ id: 'n0', lessonTitle: 'Blocked', sortOrder: 0, prerequisiteNodeIds: ['missing'] }),
    makeNode({ id: 'n1', lessonTitle: 'Ready', sortOrder: 1 }),
  ]
  const plan = makeCompiledPlan(nodes)

  const tasks = resolveTodaysTasks(plan, [])

  expect(tasks.map((task) => task.id)).toEqual(['n1'])
  expect(tasks[0].ready).toBe(true)
})

test('resolveTodaysTasks returns [] for coming-soon plan', () => {
  const plan = makeCompiledPlan(
    [makeNode({ id: 'n0', lessonTitle: 'T0', sortOrder: 0 })],
    {
      metadata: {
        totalEstimatedMinutes: 0,
        lessonCount: 1,
        domainsCovered: [],
        supportStatus: 'coming-soon',
        supportMessage: 'まもなく対応',
      },
    },
  )

  expect(resolveTodaysTasks(plan, [])).toEqual([])
})

test('resolveTodaysTasks returns [] for empty CompiledPlan', () => {
  const plan = makeCompiledPlan([])
  expect(resolveTodaysTasks(plan, [])).toEqual([])
})

test('resolveTodaysTasks ignores `today` option for now (forward-compat hook)', () => {
  const plan = makeAtomPlan([makeAtomStep({ atomId: 'a', title: 'A' })])

  const without = resolveTodaysTasks(plan, [])
  const withToday = resolveTodaysTasks(plan, [], { today: new Date('2026-05-01') })

  expect(withToday).toEqual(without)
})
