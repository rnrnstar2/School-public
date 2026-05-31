import { describe, expect, it } from 'vitest'
import { recommendBranch } from '@/lib/lessons/branch-recommender'
import type { LearnerProfile } from '@/types'

function createProfile(overrides: Partial<LearnerProfile>): LearnerProfile {
  return {
    user_id: 'user-1',
    display_name: 'Test User',
    locale: 'ja',
    experience_summary: null,
    operating_system: 'macOS',
    cli_familiarity: 'comfortable',
    available_ai_tools: [],
    can_use_local_tools: true,
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  }
}

describe('recommendBranch', () => {
  it('prefers the most specific macOS/Linux + CLI branch for macOS learners', () => {
    const recommendation = recommendBranch({
      branches: [
        { lessonId: 'lesson-cli', branchLabel: 'CLI を使う' },
        { lessonId: 'lesson-mac-cli', branchLabel: 'macOS/Linux 向け CLI パス' },
        { lessonId: 'lesson-windows', branchLabel: 'Windows 向け' },
      ],
      profile: createProfile({
        operating_system: 'macOS Sonoma',
        cli_familiarity: 'comfortable',
      }),
    })

    expect(recommendation).toEqual({
      recommendedLessonId: 'lesson-mac-cli',
      reason: 'macOS + CLI comfortable なあなたに合っています',
    })
  })

  it('recommends the Windows branch for Windows learners without CLI familiarity', () => {
    const recommendation = recommendBranch({
      branches: [
        { lessonId: 'lesson-unix', branchLabel: 'macOS/Linux 向け' },
        { lessonId: 'lesson-windows', branchLabel: 'Windows 向け' },
      ],
      profile: createProfile({
        operating_system: 'Windows 11',
        cli_familiarity: 'none',
      }),
    })

    expect(recommendation).toEqual({
      recommendedLessonId: 'lesson-windows',
      reason: 'Windows 環境のあなたに合っています',
    })
  })

  it('returns null when none of the branch labels match the learner profile', () => {
    const recommendation = recommendBranch({
      branches: [
        { lessonId: 'lesson-ios', branchLabel: 'iOS 向け' },
        { lessonId: 'lesson-android', branchLabel: 'Android 向け' },
      ],
      profile: createProfile({
        operating_system: 'ChromeOS',
        cli_familiarity: null,
      }),
    })

    expect(recommendation).toEqual({
      recommendedLessonId: null,
      reason: null,
    })
  })

  it('returns null when the learner profile is missing', () => {
    const recommendation = recommendBranch({
      branches: [
        { lessonId: 'lesson-unix', branchLabel: 'macOS/Linux 向け' },
        { lessonId: 'lesson-windows', branchLabel: 'Windows 向け' },
      ],
      profile: null,
    })

    expect(recommendation).toEqual({
      recommendedLessonId: null,
      reason: null,
    })
  })

  it('returns null when there are fewer than two branches', () => {
    const recommendation = recommendBranch({
      branches: [{ lessonId: 'lesson-unix', branchLabel: 'macOS/Linux 向け' }],
      profile: createProfile({}),
    })

    expect(recommendation).toEqual({
      recommendedLessonId: null,
      reason: null,
    })
  })
})
