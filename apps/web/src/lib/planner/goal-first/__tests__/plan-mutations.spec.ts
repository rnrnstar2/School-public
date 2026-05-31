import { describe, expect, it } from 'vitest'
import { markPlanStepSkipped } from '../plan-mutations'
import type { AtomCompiledPlan } from '../plan-compiler'

function makePlan(overrides: Partial<AtomCompiledPlan> = {}): AtomCompiledPlan {
  return {
    goal: 'ゴール',
    goalTags: [],
    steps: [
      {
        atomId: 'atom.a',
        title: 'A',
        rationale: '',
        estimatedMinutes: 10,
        milestoneId: null,
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
      {
        atomId: 'atom.b',
        title: 'B',
        rationale: '',
        estimatedMinutes: 10,
        milestoneId: null,
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
      },
    ],
    milestones: [],
    coverageScore: 0,
    unsupportedCapabilities: [],
    rationale: '',
    source: 'topo',
    ...overrides,
  }
}

describe('markPlanStepSkipped', () => {
  it('flips the matching step skipped to true without mutating the input', () => {
    const input = makePlan()
    const { plan: output, mutated } = markPlanStepSkipped(input, 'atom.b')

    expect(mutated).toBe(true)
    expect(output).not.toBe(input)
    expect(output.steps[1].skipped).toBe(true)
    expect(output.steps[0].skipped).toBeUndefined()
    // original untouched
    expect(input.steps[1].skipped).toBeUndefined()
  })

  it('returns mutated:false when atomId is not present', () => {
    const input = makePlan()
    const { plan: output, mutated } = markPlanStepSkipped(input, 'atom.not-there')

    expect(mutated).toBe(false)
    expect(output).toBe(input)
  })

  it('returns mutated:false when step is already skipped', () => {
    const plan = makePlan()
    plan.steps[0].skipped = true
    const { plan: output, mutated } = markPlanStepSkipped(plan, 'atom.a')
    expect(mutated).toBe(false)
    expect(output).toBe(plan)
  })
})
