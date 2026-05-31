import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PlanPage from './page'

const mocks = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  createClientMock: vi.fn(),
  getCompiledPlanRecordMock: vi.fn(),
  persistCompiledPlanSnapshotMock: vi.fn(),
  getMentorMemoriesMock: vi.fn(),
  getLessonFeedbackSummaryMock: vi.fn(),
  buildUnderstandingProfileMock: vi.fn(),
  buildAtomPlanFromGoalCachedMock: vi.fn(),
  resolveNextActionMock: vi.fn(),
  attachBridgeQuestionToNextActionMock: vi.fn(),
  getTaskProgressByPlanMock: vi.fn(),
  toTaskProgressRecordMock: vi.fn(),
  resolveAsk2ActionGoalIdMock: vi.fn(),
  goalFirstPlanClientMock: vi.fn(),
  fetchUserPersonaIdsMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirectMock,
}))

vi.mock('@/lib/compiled-plans', () => ({
  getCompiledPlanRecord: mocks.getCompiledPlanRecordMock,
  persistCompiledPlanSnapshot: mocks.persistCompiledPlanSnapshotMock,
}))

vi.mock('@/lib/learner-models', () => ({
  getLessonFeedbackSummary: mocks.getLessonFeedbackSummaryMock,
  getMentorMemories: mocks.getMentorMemoriesMock,
}))

vi.mock('@/lib/planner/resume-personalization', () => ({
  buildUnderstandingProfile: mocks.buildUnderstandingProfileMock,
}))

vi.mock('@/lib/planner/goal-first', () => ({
  buildAtomPlanFromGoalCached: mocks.buildAtomPlanFromGoalCachedMock,
  resolveNextAction: mocks.resolveNextActionMock,
}))

vi.mock('@/lib/planner/goal-first/bridge-question', () => ({
  attachBridgeQuestionToNextAction: mocks.attachBridgeQuestionToNextActionMock,
}))

vi.mock('@/lib/goals/ask2action', () => ({
  resolveAsk2ActionGoalId: mocks.resolveAsk2ActionGoalIdMock,
}))

vi.mock('@/lib/supabase/task-progress', () => ({
  getTaskProgressByPlan: mocks.getTaskProgressByPlanMock,
  toTaskProgressRecord: mocks.toTaskProgressRecordMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClientMock,
}))

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchUserPersonaIds: mocks.fetchUserPersonaIdsMock,
}))

vi.mock('./goal-first/goal-first-plan-client', () => ({
  GoalFirstPlanClient: (props: { goalSummary?: string }) => {
    mocks.goalFirstPlanClientMock(props)
    return <div data-testid="goal-first-plan-client">{props.goalSummary ?? 'missing'}</div>
  },
}))

function createQueryResult(data: unknown) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn().mockResolvedValue({ data }),
  }

  return builder
}

function createSupabaseClient() {
  const goalQuery = createQueryResult({
    outcome: 'Next.js app を仕上げたい',
    preferred_tools: ['claude-code'],
  })
  const learnerStateQuery = createQueryResult({
    target_outcome: 'Next.js app を仕上げたい',
    skill_level: 'beginner',
    blockers: [],
    signals: {},
  })
  const learnerProfileQuery = createQueryResult({
    available_ai_tools: ['claude-code'],
  })
  // TQ-251 / TQ-252 — page.tsx が graduation_decisions を SSR で読むようになった
  // ので mock も用意する。未保存ケース (data: null) を返す。
  const graduationDecisionQuery = createQueryResult(null)

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'goals') {
        return goalQuery
      }

      if (table === 'learner_state') {
        return learnerStateQuery
      }

      if (table === 'learner_profile') {
        return learnerProfileQuery
      }

      if (table === 'graduation_decisions') {
        return graduationDecisionQuery
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

const atomPlan = {
  goal: 'Next.js app を仕上げたい',
  goalTags: ['website-launch'],
  steps: [
    {
      atomId: 'atom-1',
      title: '最初の atom',
      rationale: '最初に着手する',
      estimatedMinutes: 20,
      milestoneId: 'ms-1',
      prerequisiteAtomIds: [],
      softPrerequisiteAtomIds: [],
      completedAt: null,
    },
  ],
  milestones: [
    {
      id: 'ms-1',
      title: '最初のマイルストーン',
      description: 'desc',
      atomIds: ['atom-1'],
    },
  ],
  coverageScore: 1,
  unsupportedCapabilities: [],
  rationale: 'fresh',
  source: 'topo' as const,
}

describe('PlanPage', () => {
  it('passes the freshly persisted plan id to the client when there is no active plan record', async () => {
    mocks.createClientMock.mockResolvedValue(createSupabaseClient())
    mocks.getCompiledPlanRecordMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: atomPlan,
      seed: 'seed-123',
      fromCache: false,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-fresh',
      parentPlanId: null,
    })
    mocks.resolveNextActionMock.mockReturnValue(null)
    mocks.attachBridgeQuestionToNextActionMock.mockReturnValue(null)
    mocks.getMentorMemoriesMock.mockResolvedValue({ data: [], error: null })
    mocks.getLessonFeedbackSummaryMock.mockResolvedValue({ data: [], error: null })
    mocks.buildUnderstandingProfileMock.mockReturnValue({
      overallLevel: 'first-visit',
      completedTaskCount: 0,
      blockedTaskCount: 0,
      averageDifficulty: null,
      averageClarity: null,
      commonBlockers: [],
      strengths: [],
      weaknesses: [],
      resumeMessage: '',
      adjustmentHints: [],
    })
    mocks.getTaskProgressByPlanMock.mockResolvedValue({ data: [], error: null })
    mocks.toTaskProgressRecordMock.mockReturnValue({})
    mocks.resolveAsk2ActionGoalIdMock.mockResolvedValue('goal-tree-123')
    mocks.fetchUserPersonaIdsMock.mockResolvedValue([])
    render(await PlanPage())

    expect(screen.getByTestId('goal-first-plan-client')).toHaveTextContent(
      'Next.js app を仕上げたい',
    )
    expect(mocks.goalFirstPlanClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goalSummary: 'Next.js app を仕上げたい',
        goalId: 'goal-tree-123',
        initialNextQuestion: null,
      }),
    )
    expect(mocks.getTaskProgressByPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 'plan-fresh' }),
    )
  })

  it('omits ask2action props when goal resolution misses', async () => {
    mocks.createClientMock.mockResolvedValue(createSupabaseClient())
    mocks.getCompiledPlanRecordMock.mockResolvedValue(null)
    mocks.buildAtomPlanFromGoalCachedMock.mockResolvedValue({
      plan: atomPlan,
      seed: 'seed-123',
      fromCache: false,
    })
    mocks.persistCompiledPlanSnapshotMock.mockResolvedValue({
      synced: true,
      message: null,
      planId: 'plan-fresh',
      parentPlanId: null,
    })
    mocks.resolveNextActionMock.mockReturnValue(null)
    mocks.attachBridgeQuestionToNextActionMock.mockReturnValue(null)
    mocks.getMentorMemoriesMock.mockResolvedValue({ data: [], error: null })
    mocks.getLessonFeedbackSummaryMock.mockResolvedValue({ data: [], error: null })
    mocks.buildUnderstandingProfileMock.mockReturnValue({
      overallLevel: 'first-visit',
      completedTaskCount: 0,
      blockedTaskCount: 0,
      averageDifficulty: null,
      averageClarity: null,
      commonBlockers: [],
      strengths: [],
      weaknesses: [],
      resumeMessage: '',
      adjustmentHints: [],
    })
    mocks.getTaskProgressByPlanMock.mockResolvedValue({ data: [], error: null })
    mocks.toTaskProgressRecordMock.mockReturnValue({})
    mocks.resolveAsk2ActionGoalIdMock.mockResolvedValue(null)
    mocks.fetchUserPersonaIdsMock.mockResolvedValue([])

    render(await PlanPage())

    expect(mocks.goalFirstPlanClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        goalId: null,
        initialNextQuestion: null,
      }),
    )
  })
})
