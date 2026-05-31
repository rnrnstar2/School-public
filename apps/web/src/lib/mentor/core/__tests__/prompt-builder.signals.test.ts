import { describe, expect, it } from 'vitest'
import { buildMentorPrompt } from '../prompt-builder'
import type { MentorContext } from '../context-builder'
import type { MentorRoleConfig } from '../roles'
import type { LearnerState } from '@/types'

function buildLearnerState(
  overrides?: Partial<LearnerState>,
): LearnerState {
  return {
    user_id: 'user-1',
    target_outcome: '学習プランを前に進める',
    skill_level: 'beginner',
    active_track_id: null,
    active_task_id: null,
    existing_materials: '前回メモ',
    blockers: ['時間を取りづらい'],
    signals: {
      audience: '自分用',
      deadline: '今週中',
    },
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

function buildContext(
  learnerState: LearnerState | null,
): MentorContext {
  return {
    learnerProfile: null,
    learnerState,
    mentorMemories: [],
    completedLessonIds: [],
    availableLessons: [],
    currentLesson: null,
    negativeFeedback: [],
    goal: 'Welcome back',
    planSummary: null,
    evidenceContent: null,
    rubricText: null,
    conversationHistory: [],
    lessonFeedbackSummaries: [],
    learningStyle: null,
    stuckPatterns: [],
    currentPlanState: null,
    blockerHistory: null,
    recompileReason: null,
    hearingDigest: null,
  }
}

const roleConfig: MentorRoleConfig = {
  role: 'planning',
  description: 'test',
  systemPromptTemplate: '学習者状態\n{{learner_state_block}}',
  temperature: 0,
  maxTokens: 500,
  outputFormat: 'text',
  requiredContext: [],
}

describe('prompt-builder signals', () => {
  it('injects todayIntent into learner state with the expected line order', () => {
    const { system } = buildMentorPrompt(
      roleConfig,
      buildContext(
        buildLearnerState({
          signals: {
            audience: '自分用',
            deadline: '今週中',
            todayIntent: 'quick_win',
          },
        }),
      ),
    )

    expect(system).toContain(
      [
        '作る相手: 自分用',
        '希望期限: 今週中',
        '今日の学習意図: 短時間で 1 問だけ解きたい',
        '既存素材: 前回メモ',
      ].join('\n'),
    )
  })

  it('keeps existing behavior when todayIntent is absent or unknown', () => {
    const withoutIntent = buildMentorPrompt(
      roleConfig,
      buildContext(buildLearnerState()),
    )
    const unknownIntent = buildMentorPrompt(
      roleConfig,
      buildContext(
        buildLearnerState({
          signals: {
            audience: '自分用',
            deadline: '今週中',
            todayIntent: 'unknown' as never,
          },
        }),
      ),
    )

    expect(withoutIntent.system).not.toContain('今日の学習意図:')
    expect(unknownIntent.system).not.toContain('今日の学習意図:')
  })
})
