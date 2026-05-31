/**
 * TQ-249 / TQ-256: unit tests for dynamic-plan-edit helpers that mutate
 * `compiled_plans.steps` in response to mentor actions.
 */

import { describe, expect, it } from 'vitest'
import {
  applyAddLesson,
  applyChangeNextLesson,
  applyReorderSchedule,
  applySkipLesson,
  applySwitchTool,
} from '@/lib/planner/dynamic-plan-edit'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

function makePlan(): AtomCompiledPlan {
  return {
    goal: 'ポートフォリオサイトを作る',
    goalTags: ['portfolio-site'],
    steps: [
      {
        atomId: 'atom.a',
        title: 'A',
        rationale: 'aaa',
        estimatedMinutes: 15,
        milestoneId: 'ms-001',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: '2026-05-01T00:00:00Z',
        recommendedTool: null,
        delegationBrief: null,
      },
      {
        atomId: 'atom.b',
        title: 'B',
        rationale: 'bbb',
        estimatedMinutes: 20,
        milestoneId: 'ms-001',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: 'claude-code',
        delegationBrief: null,
      },
      {
        atomId: 'atom.c',
        title: 'C',
        rationale: 'ccc',
        estimatedMinutes: 30,
        milestoneId: 'ms-002',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: null,
        delegationBrief: null,
      },
    ],
    milestones: [
      { id: 'ms-001', title: 'M1', description: '', atomIds: ['atom.a', 'atom.b'] },
      { id: 'ms-002', title: 'M2', description: '', atomIds: ['atom.c'] },
    ],
    coverageScore: 0.8,
    unsupportedCapabilities: [],
    rationale: 'test',
    source: 'topo',
  }
}

describe('applySkipLesson', () => {
  it('marks the matching step as skipped', () => {
    const plan = makePlan()
    const out = applySkipLesson(plan, 'atom.b')
    expect(out.applied).toBe(true)
    expect(out.plan.steps.find((s) => s.atomId === 'atom.b')?.skipped).toBe(true)
    // input plan unchanged
    expect(plan.steps.find((s) => s.atomId === 'atom.b')?.skipped).toBeUndefined()
  })

  it('returns applied=false when the lesson is unknown', () => {
    const plan = makePlan()
    const out = applySkipLesson(plan, 'atom.zzz')
    expect(out.applied).toBe(false)
    expect(out.plan).toBe(plan)
  })
})

describe('applyChangeNextLesson', () => {
  it('moves an existing later step to the front of the incomplete portion', () => {
    const plan = makePlan()
    const out = applyChangeNextLesson(plan, { targetLessonId: 'atom.c' })
    expect(out.applied).toBe(true)
    // completed atom.a stays first; atom.c moves to second
    expect(out.plan.steps.map((s) => s.atomId)).toEqual([
      'atom.a',
      'atom.c',
      'atom.b',
    ])
  })

  it('inserts a synthetic step when the lesson is not in the plan', () => {
    const plan = makePlan()
    const out = applyChangeNextLesson(plan, {
      targetLessonId: 'atom.new',
      targetLessonTitle: 'New thing',
    })
    expect(out.applied).toBe(true)
    expect(out.plan.steps[1]?.atomId).toBe('atom.new')
    expect(out.plan.steps[1]?.title).toBe('New thing')
  })
})

describe('applyAddLesson', () => {
  it('inserts before the named anchor', () => {
    const plan = makePlan()
    const out = applyAddLesson(plan, {
      targetLessonId: 'atom.x',
      beforeLessonId: 'atom.c',
    })
    expect(out.applied).toBe(true)
    expect(out.plan.steps.map((s) => s.atomId)).toEqual([
      'atom.a',
      'atom.b',
      'atom.x',
      'atom.c',
    ])
  })

  it('appends when no anchor is provided', () => {
    const plan = makePlan()
    const out = applyAddLesson(plan, { targetLessonId: 'atom.x' })
    expect(out.applied).toBe(true)
    expect(out.plan.steps.at(-1)?.atomId).toBe('atom.x')
  })

  it('is a no-op when the lesson is already present', () => {
    const plan = makePlan()
    const out = applyAddLesson(plan, { targetLessonId: 'atom.b' })
    expect(out.applied).toBe(false)
  })
})

describe('applyReorderSchedule', () => {
  it('reorders only the incomplete portion and keeps completed steps first', () => {
    const plan = makePlan()
    const out = applyReorderSchedule(plan, ['atom.c', 'atom.b'])
    expect(out.applied).toBe(true)
    expect(out.plan.steps.map((s) => s.atomId)).toEqual([
      'atom.a',
      'atom.c',
      'atom.b',
    ])
  })

  it('drops unknown lesson ids silently and preserves missing-from-list steps at the end', () => {
    const plan = makePlan()
    const out = applyReorderSchedule(plan, ['atom.c', 'atom.unknown'])
    expect(out.applied).toBe(true)
    expect(out.plan.steps.map((s) => s.atomId)).toEqual([
      'atom.a',
      'atom.c',
      'atom.b', // forgotten by the new order, kept at the end of incomplete
    ])
  })

  it('is a no-op when the order is empty', () => {
    const plan = makePlan()
    expect(applyReorderSchedule(plan, []).applied).toBe(false)
  })
})

describe('applySwitchTool', () => {
  it('replaces the recommended_tool on the matching step', () => {
    const plan = makePlan()
    const out = applySwitchTool(plan, { stepId: 'atom.b', toToolId: 'v0' })
    expect(out.applied).toBe(true)
    expect(out.plan.steps.find((s) => s.atomId === 'atom.b')?.recommendedTool).toBe(
      'v0',
    )
  })

  it('returns applied=false when the step already has the target tool', () => {
    const plan = makePlan()
    const out = applySwitchTool(plan, {
      stepId: 'atom.b',
      toToolId: 'claude-code',
    })
    expect(out.applied).toBe(false)
  })

  it('refuses to switch when fromToolId mismatches the current tool', () => {
    const plan = makePlan()
    const out = applySwitchTool(plan, {
      stepId: 'atom.b',
      fromToolId: 'cursor',
      toToolId: 'v0',
    })
    expect(out.applied).toBe(false)
  })

  it('returns applied=false when the step is unknown', () => {
    const plan = makePlan()
    const out = applySwitchTool(plan, { stepId: 'atom.zzz', toToolId: 'v0' })
    expect(out.applied).toBe(false)
  })
})
