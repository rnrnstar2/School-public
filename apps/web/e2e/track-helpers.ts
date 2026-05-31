import { type Page, type Route } from '@playwright/test'
import { mockSupabaseAuth, mockHearingFirstTurn, mockHearingComplete, MOCK_PLAN_RESULT } from './helpers'

/* ================================================================
 * Per-track mock plan results for 4-track E2E coverage (TQ-101)
 * ================================================================ */

interface TrackMockConfig {
  trackId: string
  trackLabel: string
  goalText: string
  matchedIntent: string
  hearingFirstQuestion: string
  hearingChoices: string[]
  planTitle: string
  stepTitle: string
  lessonId: string
  lessonTitle: string
  milestones: { id: string; title: string }[]
}

const TRACK_CONFIGS: Record<string, TrackMockConfig> = {
  'web-builder-ai': {
    trackId: 'web-builder-ai',
    trackLabel: 'Webサイト制作',
    goalText: 'ポートフォリオサイトを公開したい',
    matchedIntent: 'website',
    hearingFirstQuestion: 'Web制作の経験はありますか？',
    hearingChoices: ['初めてです', '少しあります', '実務経験があります'],
    planTitle: 'Webサイト制作プラン',
    stepTitle: '開発環境セットアップ',
    lessonId: 'web-001',
    lessonTitle: 'Next.js プロジェクト作成',
    milestones: [
      { id: 'ms-1', title: 'ローカル開発環境で動くサイト' },
      { id: 'ms-2', title: '公開されたポートフォリオ' },
    ],
  },
  'ai-automation': {
    trackId: 'ai-automation',
    trackLabel: 'AI業務自動化',
    goalText: '業務を自動化したい',
    matchedIntent: 'ai-automation',
    hearingFirstQuestion: '自動化したい業務はどんな内容ですか？',
    hearingChoices: ['メール返信の自動化', 'データ集計の効率化', 'レポート作成の自動化'],
    planTitle: 'AI業務自動化プラン',
    stepTitle: 'AIチャット活用基礎',
    lessonId: 'auto-001',
    lessonTitle: 'AIチャットで業務効率化',
    milestones: [
      { id: 'ms-ai-chat', title: 'AIチャットスキル習得' },
      { id: 'ms-automation', title: '自動化スクリプト完成' },
    ],
  },
  'ai-content-creator': {
    trackId: 'ai-content-creator',
    trackLabel: 'AIコンテンツ制作',
    goalText: 'AIでブログ記事を書きたい',
    matchedIntent: 'ai-content-creator',
    hearingFirstQuestion: 'どんなコンテンツを作りたいですか？',
    hearingChoices: ['ブログ記事', 'SNS投稿', 'プレゼン資料'],
    planTitle: 'AIコンテンツ制作プラン',
    stepTitle: 'AIライティング基礎',
    lessonId: 'content-001',
    lessonTitle: 'AIライティング入門',
    milestones: [
      { id: 'ms-writing', title: 'AI文章生成スキル' },
      { id: 'ms-workflow', title: 'コンテンツワークフロー構築' },
    ],
  },
  'ai-app-builder': {
    trackId: 'ai-app-builder',
    trackLabel: 'AIアプリ制作',
    goalText: 'Webアプリを作りたい',
    matchedIntent: 'app',
    hearingFirstQuestion: 'どんなアプリを作りたいですか？',
    hearingChoices: ['タスク管理アプリ', 'ECサイト', 'ダッシュボード'],
    planTitle: 'AIアプリ制作プラン',
    stepTitle: 'アプリ設計・要件整理',
    lessonId: 'app-001',
    lessonTitle: 'AIでアプリ要件を整理',
    milestones: [
      { id: 'ms-requirements', title: 'アプリ要件確定' },
      { id: 'ms-deployed', title: 'アプリ公開' },
    ],
  },
}

export function getTrackConfig(trackId: string): TrackMockConfig {
  return TRACK_CONFIGS[trackId] ?? TRACK_CONFIGS['web-builder-ai']
}

function buildTrackPlanResult(config: TrackMockConfig) {
  return {
    adapter: {
      id: 'mock-planner',
      label: 'ローカル簡易プランナー',
      mode: 'mock' as const,
      status: 'fallback' as const,
      message: 'ローカルの判定ロジックで提案しています。',
    },
    recommendation: {
      status: 'supported' as const,
      normalizedGoal: config.goalText,
      userFacingGoal: config.goalText,
      matchedIntent: config.matchedIntent,
      title: `${config.trackLabel}プランをおすすめします`,
      summary: `${config.trackLabel}トラックの学習プランです。`,
      detail: `入力内容から、${config.trackLabel}の意図だと判断しました。`,
      supportMessage: 'ローカルの判定ロジックで提案しています。',
      nextAction: {
        type: 'inline-continuation' as const,
        label: 'このプランで学習を進める',
      },
      hearing: {
        experience: '初めてです',
        purpose: config.goalText,
        existingMaterials: 'なし',
        operatingSystem: 'mac',
        localWorkCapability: 'できます',
        cliFamiliarity: 'beginner' as const,
        aiTools: 'Claude Code',
      },
      hearingInsights: {
        buildGoal: config.goalText,
        audience: null,
        projectType: 'content-site' as const,
        constraints: [],
        preferences: [],
        mustHaveFeatures: [],
        planningFocus: [],
      },
      continuation: {
        kind: 'inline-plan' as const,
        title: config.planTitle,
        summary: `${config.trackLabel}の学習プランです。`,
        ctaLabel: 'このプランで学習を進める',
        steps: [
          {
            id: 'step-1',
            title: config.stepTitle,
            description: `${config.stepTitle}を実施します。`,
            outcome: `${config.stepTitle}が完了する`,
            purpose: '学習の第一歩',
            completionCriteria: `${config.stepTitle}完了`,
            artifacts: ['screenshot'],
            requirement: 'required' as const,
            milestoneId: config.milestones[0].id,
            lessonRefs: [
              {
                lessonId: config.lessonId,
                title: config.lessonTitle,
                summary: `${config.lessonTitle}の概要`,
                estimatedMinutes: 15,
                moduleTitle: config.stepTitle,
              },
            ],
          },
          {
            id: 'step-2',
            title: '実践演習',
            description: '学んだ内容を実践します。',
            outcome: '実践スキルの定着',
            purpose: '知識の定着',
            completionCriteria: '実践完了',
            artifacts: ['screenshot'],
            requirement: 'required' as const,
            milestoneId: config.milestones[1].id,
            lessonRefs: [],
          },
        ],
        milestones: config.milestones.map((m) => ({
          id: m.id,
          title: m.title,
          description: m.title,
          artifactGoal: 'screenshot',
          evidenceRule: m.title,
          steps: [],
        })),
      },
      mentorWorkspace: {
        currentTask: {
          id: 'step-1',
          title: config.stepTitle,
          do: `${config.stepTitle}を始める`,
          learn: `${config.trackLabel}の基礎知識`,
          why: '学習の土台を作るため',
          outcome: `${config.stepTitle}完了`,
          lessonRefs: [
            {
              lessonId: config.lessonId,
              title: config.lessonTitle,
              summary: `${config.lessonTitle}の概要`,
              estimatedMinutes: 15,
              moduleTitle: config.stepTitle,
            },
          ],
          resumeSummary: null,
        },
        relevantLessons: [
          {
            lessonId: config.lessonId,
            title: config.lessonTitle,
            moduleTitle: config.stepTitle,
            summary: `${config.lessonTitle}の概要`,
            estimatedMinutes: 15,
          },
        ],
        toolRecommendation: {
          name: 'Claude Code',
          reason: '学習全般に最適なAIツールです。',
        },
        mentorMemory: {
          title: 'メンターメモ',
          bullets: ['初心者', 'macOS環境'],
        },
      },
      recommendedTrack: {
        trackId: config.trackId,
        trackLabel: config.trackLabel,
        headline: `AIを使って${config.trackLabel}を進める`,
        summary: `${config.trackLabel}の学習プランです。`,
        promise: 'ゴール達成まで一気通貫',
        targetStack: [],
        modules: [
          { id: 'mod-1', title: config.stepTitle, lessonCount: 4 },
        ],
        milestones: config.milestones.map((m) => ({ id: m.id, title: m.title })),
        starterLessons: [],
        totalLessons: 8,
      },
    },
  }
}

function buildTrackHearingFirstTurn(config: TrackMockConfig) {
  return (route: Route) => {
    const body = [
      `event: transport\ndata: ${JSON.stringify({ transport: { status: 'live', label: 'AI 応答 (mock)', message: 'mock hearing' } })}\n\n`,
      `event: token\ndata: ${JSON.stringify({ text: config.hearingFirstQuestion })}\n\n`,
      `event: result\ndata: ${JSON.stringify({
        completed: false,
        session: {
          answers: {},
          insights: {},
          messages: [
            { id: `mock-track-${config.trackId}-hearing-first`, role: 'assistant', content: config.hearingFirstQuestion },
          ],
          lastQuestionId: 'experience',
          transport: { status: 'live', label: 'AI 応答 (mock)', message: 'mock' },
          completedAt: null,
        },
        questionChoices: config.hearingChoices,
      })}\n\n`,
      `event: done\ndata: ${JSON.stringify({
        structuredOutput: {
          reply: config.hearingFirstQuestion,
          decisions: [],
          open_questions: ['経験の有無を確認する必要がある'],
          next_question: config.hearingFirstQuestion,
          next_action: null,
        },
      })}\n\n`,
    ].join('')

    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body,
    })
  }
}

function buildTrackHearingComplete(config: TrackMockConfig) {
  return (route: Route) => {
    const body = [
      `event: transport\ndata: ${JSON.stringify({ transport: { status: 'live', label: 'AI 応答 (mock)', message: 'mock' } })}\n\n`,
      `event: token\ndata: ${JSON.stringify({ text: 'ありがとうございます。プランを作成します。' })}\n\n`,
      `event: result\ndata: ${JSON.stringify({
        completed: true,
        session: {
          answers: {
            experience: config.hearingChoices[0],
            purpose: config.goalText,
          },
          insights: {},
          messages: [
            { id: `mock-track-${config.trackId}-hearing-complete`, role: 'assistant', content: 'ありがとうございます。プランを作成します。' },
          ],
          lastQuestionId: null,
          transport: { status: 'live', label: 'AI 応答 (mock)', message: 'mock' },
          completedAt: new Date().toISOString(),
        },
      })}\n\n`,
      `event: done\ndata: ${JSON.stringify({
        structuredOutput: {
          reply: 'ありがとうございます。プランを作成します。',
          decisions: ['プラン作成に必要な hearing が完了した'],
          open_questions: [],
          next_question: null,
          next_action: 'プランを確認する',
        },
      })}\n\n`,
    ].join('')

    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      body,
    })
  }
}

function buildTrackGraduationResult(config: TrackMockConfig, graduated: boolean) {
  return (route: Route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        graduation: {
          allMilestonesCompleted: graduated,
          completedMilestoneCount: graduated ? config.milestones.length : 0,
          totalMilestoneCount: config.milestones.length,
          criteria: [],
          graduated,
          completedAt: graduated ? new Date().toISOString() : null,
        },
      }),
    })
  }
}

/**
 * Set up all mocks for a specific track E2E flow.
 */
export async function setupTrackMocks(page: Page, trackId: string) {
  const config = getTrackConfig(trackId)
  const planResult = buildTrackPlanResult(config)

  await mockSupabaseAuth(page)

  let hearingCallCount = 0
  const hearingFirst = buildTrackHearingFirstTurn(config)
  const hearingDone = buildTrackHearingComplete(config)

  const hearingHandler = (route: Route) => {
    hearingCallCount++
    if (hearingCallCount <= 1) return hearingFirst(route)
    return hearingDone(route)
  }
  await page.route('**/api/planner/hearing', hearingHandler)
  await page.route('**/api/mentor/session', hearingHandler)

  await page.route('**/api/artifacts', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artifacts: [] }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artifact: { id: 'art-1' } }) })
  })

  await page.route('**/api/artifacts/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ verification: { verified: true, milestoneCompleted: true, summary: '確認完了' } }),
    })
  )

  await page.route('**/api/lessons/*/chat', (route) => {
    const body = [
      `event: token\ndata: ${JSON.stringify({ text: `${config.trackLabel}の学習を始めましょう。` })}\n\n`,
      `event: done\ndata: ${JSON.stringify({
        structuredOutput: {
          reply: `${config.trackLabel}の学習を始めましょう。`,
          decisions: [`${config.trackLabel}の学習を始める`],
          open_questions: [],
          next_question: null,
          next_action: '最初のレッスンを開く',
        },
      })}\n\n`,
    ].join('')
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body })
  })

  await page.route('**/api/lessons/*/complete', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ completed: true }) })
  )
  await page.route('**/api/lessons/*/feedback', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  )
  await page.route('**/api/planner/task-progress', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
  )
  await page.route('**/api/planner/graduation', buildTrackGraduationResult(config, true))
  await page.route('**/api/planner/plan-review', (route) => {
    const body = [
      `event: text-delta\ndata: ${JSON.stringify({ text: 'プランの調整提案です。' })}\n\n`,
      `event: done\ndata: {}\n\n`,
    ].join('')
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body })
  })
  await page.route('**/api/planner/recommendation', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(planResult) })
  )
  await page.route('**/api/learner/resume', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ learnerState: null, mentorMemories: [] }) })
  )
  await page.route('**/api/planner/goal-history', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
  )
  await page.route('**/api/planner/mentor-chat', (route) => {
    const body = [
      `event: token\ndata: ${JSON.stringify({ text: 'メンターからのアドバイスです。' })}\n\n`,
      `event: done\ndata: ${JSON.stringify({
        structuredOutput: {
          reply: 'メンターからのアドバイスです。',
          decisions: ['次に確認する論点を整理した'],
          open_questions: ['どのレッスンで詰まっているか'],
          next_question: 'どのレッスンで一番止まっていますか？',
          next_action: '詰まっている箇所を1つ書き出す',
        },
      })}\n\n`,
    ].join('')
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' }, body })
  })
  await page.route('**/api/notifications/in-app', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    })
  })

  return { config, planResult }
}

/**
 * Seed localStorage for a specific track workspace.
 */
export async function seedTrackWorkspaceStorage(
  page: Page,
  trackId: string,
  options: { allCompleted?: boolean } = {},
) {
  const config = getTrackConfig(trackId)
  const planResult = buildTrackPlanResult(config)

  await page.evaluate(
    ({ pr, cfg, allCompleted }) => {
      const goal = cfg.goalText
      const goalKey = goal.trim().toLowerCase()

      localStorage.setItem('school:planner-goal-v1', goal)

      const taskProgress: Record<string, { status: string; updatedAt: string }> = {}
      if (allCompleted) {
        taskProgress['step-1'] = { status: 'completed', updatedAt: new Date().toISOString() }
        taskProgress['step-2'] = { status: 'completed', updatedAt: new Date().toISOString() }
      }

      const snapshot = {
        goal,
        result: pr,
        hearing: {
          answers: { experience: '初めてです', purpose: goal },
          messages: [],
          lastQuestionId: null,
          transport: { status: 'live', label: 'mock', message: 'mock' },
          completedAt: new Date().toISOString(),
        },
        taskProgress,
        selectedStepId: null,
        mentorMessages: [],
        planId: null,
        savedAt: new Date().toISOString(),
      }

      localStorage.setItem(
        'school:mentor-workspace-v2',
        JSON.stringify({ [goalKey]: snapshot }),
      )
      localStorage.setItem('school:onboarding-tour-completed', '1')
    },
    { pr: planResult, cfg: config, allCompleted: options.allCompleted ?? false },
  )
}
