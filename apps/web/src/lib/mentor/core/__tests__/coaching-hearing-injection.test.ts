import { describe, expect, it } from 'vitest'
import { buildMentorPrompt } from '../prompt-builder'
import { buildHearingDigest } from '../context-builder'
import type { HearingDigest, MentorContext } from '../context-builder'
import { COACHING_CONFIG } from '../roles'

/**
 * TQ-214: coaching prompt がヒアリング深掘り情報を必ず含むことを担保する
 * 単体テスト。
 *
 * Owner Pain「ヒアリングを反映していない」を構造的に解消するため、
 * COACHING_SYSTEM_PROMPT の `{{hearing_digest_block}}` placeholder と
 * メンター voice 指示が prompt build 段階で常に注入されることを検証する。
 */

function buildBaseContext(overrides?: Partial<MentorContext>): MentorContext {
  return {
    learnerProfile: null,
    learnerState: null,
    mentorMemories: [],
    completedLessonIds: [],
    availableLessons: [],
    currentLesson: null,
    negativeFeedback: [],
    goal: '採用担当向けポートフォリオを 2 週間で公開する',
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
    ...overrides,
  }
}

describe('buildHearingDigest', () => {
  it('returns null when all sources are empty', () => {
    expect(buildHearingDigest(null)).toBeNull()
    expect(buildHearingDigest(undefined)).toBeNull()
    expect(
      buildHearingDigest({
        summaryKeyPoints: [],
        personaIds: [],
        answers: {},
        insights: null,
      }),
    ).toBeNull()
  })

  it('preserves priority ordering and trims values', () => {
    const digest = buildHearingDigest({
      summaryKeyPoints: ['採用担当向けポートフォリオを 2 週間で公開したい', '   ', 'Mac と Claude Code を使える'],
      personaIds: ['p-portfolio', 'p-engineer-prototype'],
      answers: {
        purpose: '採用担当に見せるポートフォリオを公開する',
        siteBehavior: 'プロフィールと作品 3 つを 1 ページにまとめる',
        existingMaterials: 'Notion に下書きあり',
        experience: '未経験',
      },
      insights: {
        buildGoal: '採用ポートフォリオ',
        audience: '採用担当者',
        deadline: '2 週間',
        projectType: 'content-site',
        constraints: ['平日は 1 時間しか使えない'],
        preferences: [],
        mustHaveFeatures: ['作品ギャラリー', '問い合わせフォーム'],
        planningFocus: [],
      },
    }) as HearingDigest

    expect(digest).not.toBeNull()
    expect(digest.personaIds).toEqual(['p-portfolio', 'p-engineer-prototype'])
    expect(digest.summaryKeyPoints).toEqual([
      '採用担当向けポートフォリオを 2 週間で公開したい',
      'Mac と Claude Code を使える',
    ])
    expect(digest.keyAnswers.length).toBeGreaterThanOrEqual(3)
    // 優先順位: purpose > siteBehavior > existingMaterials > experience
    expect(digest.keyAnswers[0].id).toBe('purpose')
    expect(digest.keyAnswers[1].id).toBe('siteBehavior')

    expect(digest.insightLines.some((line) => line.includes('採用担当者'))).toBe(true)
    expect(digest.insightLines.some((line) => line.includes('2 週間'))).toBe(true)
    expect(digest.insightLines.some((line) => line.includes('content-site'))).toBe(true)
    expect(digest.insightLines.some((line) => line.includes('作品ギャラリー'))).toBe(true)
  })
})

describe('coaching prompt mentor voice (TQ-214)', () => {
  it('injects mentor voice instructions into the coaching system prompt', () => {
    const { system } = buildMentorPrompt(COACHING_CONFIG, buildBaseContext())

    // 傾聴 / 問いかけ
    expect(system).toContain('傾聴と問いかけを優先')
    // 自己決定支援
    expect(system).toContain('自己決定支援')
    // generic 賞賛禁止
    expect(system).toContain('generic 賞賛禁止')
    expect(system).toContain('素晴らしい質問ですね')
    // 簡潔さと温度感
    expect(system).toContain('簡潔さと温度感を両立')
    // 1 ターン 1 問い
    expect(system).toContain('1 ターンに 1 つの問い')
  })

  it('renders {{hearing_digest_block}} fallback text when no hearing data is present', () => {
    const { system } = buildMentorPrompt(COACHING_CONFIG, buildBaseContext())
    expect(system).toContain('## ヒアリングで分かっていること')
    expect(system).toContain('（ヒアリング情報なし）')
  })

  it('renders {{learner_state_block}} placeholder so blockers / audience reach coaching', () => {
    const { system } = buildMentorPrompt(
      COACHING_CONFIG,
      buildBaseContext({
        learnerState: {
          user_id: 'user-1',
          target_outcome: '採用担当向けポートフォリオを 2 週間で公開する',
          skill_level: 'beginner',
          active_track_id: null,
          active_task_id: null,
          existing_materials: 'Notion 下書き',
          blockers: ['平日は 1 時間しか使えない'],
          signals: {
            audience: '採用担当',
            deadline: '2 週間',
          },
          created_at: '2026-05-08T00:00:00.000Z',
          updated_at: '2026-05-08T00:00:00.000Z',
        },
      }),
    )

    expect(system).toContain('## 学習者の現在の状態')
    expect(system).toContain('作る相手: 採用担当')
    expect(system).toContain('希望期限: 2 週間')
    expect(system).toContain('平日は 1 時間しか使えない')
  })

  it('embeds hearing digest details (personaIds / summaryKeyPoints / answers / insights) into the system prompt', () => {
    const digest = buildHearingDigest({
      summaryKeyPoints: ['採用担当向けポートフォリオを 2 週間で公開したい', 'Mac と Claude Code を使える'],
      personaIds: ['p-portfolio'],
      answers: {
        purpose: '採用担当に見せるポートフォリオを公開する',
        siteBehavior: '作品 3 つを 1 ページにまとめる',
      },
      insights: {
        buildGoal: '採用ポートフォリオ',
        audience: '採用担当者',
        deadline: '2 週間',
        projectType: 'content-site',
        constraints: [],
        preferences: [],
        mustHaveFeatures: ['作品ギャラリー'],
        planningFocus: [],
      },
    })

    const { system } = buildMentorPrompt(
      COACHING_CONFIG,
      buildBaseContext({ hearingDigest: digest }),
    )

    expect(system).toContain('想定ペルソナ: p-portfolio')
    expect(system).toContain('採用担当向けポートフォリオを 2 週間で公開したい')
    expect(system).toContain('Mac と Claude Code を使える')
    expect(system).toContain('目的: 採用担当に見せるポートフォリオを公開する')
    expect(system).toContain('作りたい挙動: 作品 3 つを 1 ページにまとめる')
    expect(system).toContain('作る相手: 採用担当者')
    expect(system).toContain('期限感: 2 週間')
    expect(system).toContain('必須機能: 作品ギャラリー')
    // 「（ヒアリング情報なし）」フォールバックが上書きされていること
    expect(system).not.toContain('（ヒアリング情報なし）')
  })
})
