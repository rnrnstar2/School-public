/**
 * TQ-241: unit tests for plan-step rationale extraction.
 */

import { describe, expect, it } from 'vitest'
import {
  classifyStepRationale,
  extractStepRationales,
  findStepRationale,
} from '@/lib/planner/goal-first/plan-rationale'
import type { AtomCompiledPlan } from '@/lib/planner/goal-first/plan-compiler'

function makePlan(overrides: Partial<AtomCompiledPlan> = {}): AtomCompiledPlan {
  return {
    goal: 'ポートフォリオサイトを作る',
    goalTags: ['portfolio-site'],
    steps: [
      {
        atomId: 'atom.web.intro',
        title: 'Webの基本を理解する',
        rationale: 'ゴールから逆算して最初に固める前提知識',
        estimatedMinutes: 15,
        milestoneId: 'ms-001',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: null,
        delegationBrief: null,
      },
      {
        atomId: 'delegation:leaf-002',
        title: 'デザインカンプを Figma で起こす',
        rationale: '図版作業は v0/Figma に任せる方が早い',
        estimatedMinutes: 30,
        milestoneId: 'ms-001',
        prerequisiteAtomIds: [],
        softPrerequisiteAtomIds: [],
        completedAt: null,
        recommendedTool: 'figma',
        delegationBrief: 'ポートフォリオのトップページのデザインカンプを 1 枚作って',
      },
    ],
    milestones: [
      { id: 'ms-001', title: '土台づくり', description: '', atomIds: ['atom.web.intro', 'delegation:leaf-002'] },
    ],
    coverageScore: 0.8,
    unsupportedCapabilities: [],
    rationale: 'goal-first plan',
    source: 'ai',
    ...overrides,
  }
}

describe('classifyStepRationale', () => {
  it('classifies a real atom step under an ai-source plan as matched_atom', () => {
    const plan = makePlan()
    expect(classifyStepRationale(plan.steps[0], plan.source)).toBe('matched_atom')
  })

  it('classifies a delegation:* atomId as delegation_node regardless of plan source', () => {
    const plan = makePlan()
    expect(classifyStepRationale(plan.steps[1], plan.source)).toBe('delegation_node')

    const anchorPlan = makePlan({ source: 'anchor' })
    expect(classifyStepRationale(anchorPlan.steps[1], anchorPlan.source)).toBe('delegation_node')
  })

  it('classifies a real atom step under an anchor-source plan as persona_anchor', () => {
    const plan = makePlan({ source: 'anchor' })
    expect(classifyStepRationale(plan.steps[0], plan.source)).toBe('persona_anchor')
  })
})

describe('extractStepRationales', () => {
  it('produces one rationale per step in the same order', () => {
    const plan = makePlan()
    const rationales = extractStepRationales(plan)

    expect(rationales).toHaveLength(2)
    expect(rationales[0].stepId).toBe('atom.web.intro')
    expect(rationales[1].stepId).toBe('delegation:leaf-002')
  })

  it('returns null atomId for delegation_node entries', () => {
    const plan = makePlan()
    const rationales = extractStepRationales(plan)

    expect(rationales[0].atomId).toBe('atom.web.intro')
    expect(rationales[1].atomId).toBeNull()
  })

  it('echoes recommendedTool / delegationBrief verbatim from the source step (TQ-220)', () => {
    const plan = makePlan()
    const rationales = extractStepRationales(plan)

    expect(rationales[1].recommendedTool).toBe('figma')
    expect(rationales[1].delegationBrief).toBe(
      'ポートフォリオのトップページのデザインカンプを 1 枚作って',
    )
    // Real-atom row has no tool assignment.
    expect(rationales[0].recommendedTool).toBeNull()
    expect(rationales[0].delegationBrief).toBeNull()
  })

  it('builds a why line that mentions the goal for matched_atom rows', () => {
    const plan = makePlan()
    const rationales = extractStepRationales(plan)

    expect(rationales[0].why).toContain('ポートフォリオサイトを作る')
    expect(rationales[0].why).toContain('Webの基本を理解する')
  })

  it('builds a why line that mentions the recommended tool for delegation_node rows', () => {
    const plan = makePlan()
    const rationales = extractStepRationales(plan)

    expect(rationales[1].why).toContain('figma')
  })

  it('starts with an empty subAgentRuns array — Phase 1 does not require agent_runs', () => {
    const plan = makePlan()
    const rationales = extractStepRationales(plan)

    for (const entry of rationales) {
      expect(entry.subAgentRuns).toEqual([])
    }
  })

  it('handles steps without a rationale gracefully', () => {
    const plan = makePlan({
      steps: [
        {
          atomId: 'atom.bare',
          title: 'Bare step',
          rationale: '',
          estimatedMinutes: 5,
          milestoneId: null,
          prerequisiteAtomIds: [],
          softPrerequisiteAtomIds: [],
          completedAt: null,
        },
      ],
    })
    const rationales = extractStepRationales(plan)
    expect(rationales[0].why.length).toBeGreaterThan(0)
    expect(rationales[0].why).not.toContain('根拠:')
  })
})

describe('findStepRationale', () => {
  it('returns the matching rationale by stepId', () => {
    const plan = makePlan()
    const found = findStepRationale(plan, 'delegation:leaf-002')
    expect(found?.rationaleType).toBe('delegation_node')
  })

  it('returns null for unknown step ids', () => {
    const plan = makePlan()
    expect(findStepRationale(plan, 'atom.unknown')).toBeNull()
  })
})
