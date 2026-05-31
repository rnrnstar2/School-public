import { type Page, type Route } from '@playwright/test'

// Re-export the new modular helpers so specs can import either path.
// New code should prefer `./helpers/index` (or the module subpaths) — this
// file exists to keep the legacy specs working without a mass rename.
export {
  createLessonChatRetrySequence,
  mockHearingFirstTurn,
  mockHearingComplete,
  mockLessonChat,
  mockLessonChatHistory,
  mockEmptyMentorSession,
  mockMentorSessionRoute,
  mockPlanReview,
  mockArtifactVerify,
  mockAiResponses,
  mockSupabaseAuth,
  loginAsOwner,
  loginAsTestUser,
  TEST_OWNER_EMAIL,
  TEST_OWNER_PASSWORD,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_USER_ID,
  GOAL_TREE_FIXTURE_GOAL_ID,
  GOAL_TREE_FIXTURE_LESSON_ID,
  GOAL_TREE_FIXTURE_NODE_IDS,
  getDecisionLedgerClient,
  LOCAL_SUPABASE_URL,
  LOCAL_SERVICE_ROLE_KEY,
  getAdminClient,
  ensureOwnerUser,
  ensureTestUser,
  resetTestUserData,
  seedAsk2ActionPlanFixture,
  seedGoalContextFixture,
  seedGoalTreeFixture,
  seedTestPlan,
  isLocalSupabaseReady,
  startHearingOnboarding,
  advanceHearingToConfirm,
  completeHearingOnboarding,
} from './helpers/index'

import {
  mockHearingFirstTurn,
  mockHearingComplete,
  mockLessonChat,
  mockPlanReview,
  mockArtifactVerify,
  mockSupabaseAuth,
} from './helpers/index'

/** Mock plan generation result returned by the planner adapter */
export const MOCK_PLAN_RESULT = {
  adapter: {
    id: 'mock-planner',
    label: 'ローカル簡易プランナー',
    mode: 'mock' as const,
    status: 'fallback' as const,
    message: 'ローカルの判定ロジックで提案しています。',
  },
  recommendation: {
    status: 'supported' as const,
    normalizedGoal: 'AI ツールで小さな Web アプリを作って公開したい',
    userFacingGoal: 'AI ツールで小さな Web アプリを作って公開したい',
    matchedIntent: 'website' as const,
    title: 'AI vibe coding で Web アプリを公開するプランをおすすめします',
    summary:
      'コードを書かずに v0 / Lovable / Bolt.new に依頼して画面を出し、Vercel CLI で公開する no-code-first プランです。',
    detail:
      '入力内容から、ブラウザで動く Web アプリを AI に作ってもらい公開したい意図だと判断しました。',
    supportMessage:
      'ローカルの判定ロジックで提案しています。聞き取った前提もこの mentor workspace に反映しています。',
    nextAction: {
      type: 'inline-continuation' as const,
      label: 'このプランで学習を進める',
    },
    hearing: {
      experience: '初めてです',
      purpose: 'ブラウザで動く Web アプリを作って公開したい',
      existingMaterials: 'なし',
      operatingSystem: 'mac',
      localWorkCapability: 'できます',
      cliFamiliarity: 'beginner' as const,
      aiTools: 'v0 / Lovable / Bolt.new',
    },
    hearingInsights: {
      buildGoal: 'AI vibe coding で作る Web アプリ',
      audience: null,
      projectType: 'content-site' as const,
      constraints: [],
      preferences: [],
      mustHaveFeatures: [],
      planningFocus: [],
    },
    continuation: {
      kind: 'inline-plan' as const,
      title: 'AI vibe coding × Vercel CLI 公開プラン',
      summary: 'v0 / Lovable / Bolt.new で画面を出し、Vercel CLI で公開するまでのプランです。',
      ctaLabel: 'このプランで学習を進める',
      steps: [
        {
          id: 'step-1',
          title: 'v0 で最初の画面を出す',
          description:
            'v0.dev に日本語 1 文で依頼し、ブラウザで動く最初の画面を URL として手に入れます。',
          outcome: 'v0 が生成した画面の URL が手元にある',
          purpose: 'コードを書かずに「画面が出る」体験を最短で得るため',
          completionCriteria: 'v0 のプレビュー URL が開ける',
          artifacts: ['url', 'screenshot'],
          requirement: 'required' as const,
          milestoneId: 'ms-1',
          lessonRefs: [
            {
              lessonId: 'atom.common.scaffold-with-v0',
              title: 'v0 で UI を 1 ショット生成して Vercel に公開する',
              summary: 'v0.dev に作りたい画面を日本語 1 文で投げて URL を取得します',
              estimatedMinutes: 20,
              moduleTitle: 'AI で画面を出す',
            },
          ],
        },
        {
          id: 'step-2',
          title: 'Lovable で動くプロトタイプを得る',
          description:
            'Lovable に作りたい Web アプリを 1 文で指示し、UI とロジックがそろった状態のプロトタイプ URL を取得します。',
          outcome: 'Lovable のプロトタイプ URL が手元にある',
          purpose: '画面だけでなく動くアプリを 20 分で得るため',
          completionCriteria: 'Lovable の共有 URL が他人に渡せる',
          artifacts: ['url'],
          requirement: 'required' as const,
          milestoneId: 'ms-1',
          lessonRefs: [
            {
              lessonId: 'atom.common.use-lovable-1shot',
              title: 'Lovable に「作りたい」を 1 文書いてアプリを得る',
              summary: 'Lovable に依頼して動くプロトタイプを 1 ショットで取得します',
              estimatedMinutes: 20,
              moduleTitle: 'AI で画面を出す',
            },
          ],
        },
        {
          id: 'step-3',
          title: 'Vercel CLI で 1 コマンド deploy する',
          description:
            'ターミナルで `vercel` を 1 回叩くだけで、いま手元にある Web アプリを公開 URL に変換します。',
          outcome: '公開 URL が他人に共有できる状態',
          purpose: '動くものを誰でもアクセスできる場所に置くため',
          completionCriteria: '`vercel` 実行後の Production URL が開ける',
          artifacts: ['url'],
          requirement: 'required' as const,
          milestoneId: 'ms-2',
          lessonRefs: [
            {
              lessonId: 'atom.web-builder.deploy-with-vercel-cli',
              title: 'Vercel CLI で 1 コマンド deploy する',
              summary: '`vercel` 1 コマンドで公開 URL を取得します',
              estimatedMinutes: 15,
              moduleTitle: '公開する',
            },
          ],
        },
      ],
      milestones: [
        {
          id: 'ms-1',
          title: 'AI にお任せで「画面が出る」まで',
          description: 'v0 / Lovable / Bolt.new など AI に依頼して動くものができる段階',
          artifactGoal: 'プレビュー URL または screenshot',
          evidenceRule: 'AI ツールが生成した画面 URL またはスクリーンショット',
          steps: [],
        },
        {
          id: 'ms-2',
          title: '公開 URL として共有できる状態',
          description: 'Vercel CLI で公開された URL',
          artifactGoal: '公開 URL',
          evidenceRule: 'Vercel 等にデプロイされた公開 URL',
          steps: [],
        },
      ],
    },
    mentorWorkspace: {
      currentTask: {
        id: 'step-1',
        title: 'v0 で最初の画面を出す',
        do: 'v0.dev に日本語 1 文で「こういう画面が欲しい」と依頼する',
        learn: 'AI vibe coding ツールへの依頼の出し方（明確な 1 文）',
        why: 'コードを書かずに動く画面を最短で出せるかを最初に確認するため',
        outcome: 'v0 が生成した画面の URL が手元にある',
        lessonRefs: [
          {
            lessonId: 'atom.common.scaffold-with-v0',
            title: 'v0 で UI を 1 ショット生成して Vercel に公開する',
            summary: 'v0.dev に作りたい画面を日本語 1 文で投げて URL を取得します',
            estimatedMinutes: 20,
            moduleTitle: 'AI で画面を出す',
          },
        ],
        resumeSummary: null,
      },
      relevantLessons: [
        {
          lessonId: 'atom.common.scaffold-with-v0',
          title: 'v0 で UI を 1 ショット生成して Vercel に公開する',
          moduleTitle: 'AI で画面を出す',
          summary: 'v0.dev に作りたい画面を日本語 1 文で投げて URL を取得します',
          estimatedMinutes: 20,
        },
      ],
      toolRecommendation: {
        name: 'v0 / Lovable / Bolt.new',
        reason:
          'コードを書かずブラウザだけで動くものを最短で出せる AI vibe coding ツール群です。CLI 経験ゼロでも進められます。',
      },
      mentorMemory: {
        title: 'メンターメモ',
        bullets: [
          'Web アプリ制作は初めて',
          'CLI 経験ゼロ・no-code-first 前提',
          'AI ツールに任せて最短で公開を目指す',
        ],
      },
    },
    recommendedTrack: {
      trackId: 'ai-app-builder',
      trackLabel: 'AI vibe coding で Web アプリを作る',
      headline: 'AI に依頼して動く Web アプリを作り、公開する',
      summary:
        'v0 / Lovable / Bolt.new に依頼して画面を出し、Vercel CLI で公開する no-code-first 構成です。',
      promise: 'idea から live URL まで、コードを書かずに到達できる',
      targetStack: ['v0', 'Lovable', 'Bolt.new', 'Vercel'],
      modules: [
        { id: 'mod-1', title: 'AI で画面を出す', lessonCount: 3 },
        { id: 'mod-2', title: '公開する', lessonCount: 2 },
      ],
      milestones: [
        { id: 'ms-1', title: 'AI にお任せで「画面が出る」まで' },
        { id: 'ms-2', title: '公開 URL として共有できる状態' },
      ],
      starterLessons: [],
      totalLessons: 5,
    },
  },
}

/** Mock preview plan returned by `/api/plans/compile` for the intake wizard */
export const MOCK_PLAN_FIXTURE = {
  goal: 'AI ツールで小さな Web アプリを作って公開したい',
  goalTags: ['no-code', 'web-app', 'vibe-coding'] as string[],
  steps: [
    {
      atomId: 'atom.common.scaffold-with-v0',
      title: 'v0 にお願いして、最初の画面を出してみる',
      rationale:
        'コードを書かずに、ブラウザで動く v0 に日本語 1 文で依頼し、最初の画面を URL として手に入れます。',
      estimatedMinutes: 20,
      milestoneId: 'ms-noneng-firstscreen',
      prerequisiteAtomIds: [] as string[],
      softPrerequisiteAtomIds: [] as string[],
      completedAt: null,
    },
    {
      atomId: 'atom.common.use-lovable-1shot',
      title: 'Lovable に「作りたい」を 1 文書いてアプリを得る',
      rationale:
        'UI とロジックがそろった「動くプロトタイプ」を Lovable に 1 文で依頼して、共有できる URL を手に入れます。',
      estimatedMinutes: 20,
      milestoneId: 'ms-noneng-firstscreen',
      prerequisiteAtomIds: [] as string[],
      softPrerequisiteAtomIds: ['atom.common.scaffold-with-v0'],
      completedAt: null,
    },
    {
      atomId: 'atom.common.scaffold-with-bolt',
      title: 'Bolt.new でブラウザ完結の Web アプリを作る',
      rationale:
        'Bolt.new に日本語で機能を依頼し、ブラウザ内で動く Web アプリを 15-25 分で形にします。',
      estimatedMinutes: 25,
      milestoneId: 'ms-noneng-firstscreen',
      prerequisiteAtomIds: [] as string[],
      softPrerequisiteAtomIds: ['atom.common.scaffold-with-v0'],
      completedAt: null,
    },
    {
      atomId: 'atom.web-builder.deploy-with-vercel-cli',
      title: 'Vercel CLI で 1 コマンド deploy する',
      rationale:
        '手元にある Web アプリを `vercel` 1 コマンドで公開 URL に変換し、他人に共有できる状態にします。',
      estimatedMinutes: 15,
      milestoneId: 'ms-noneng-publish',
      prerequisiteAtomIds: [
        'atom.common.scaffold-with-v0',
      ],
      softPrerequisiteAtomIds: [
        'atom.common.use-lovable-1shot',
        'atom.common.scaffold-with-bolt',
      ],
      completedAt: null,
    },
    {
      atomId: 'atom.web-builder.update-and-redeploy',
      title: 'アプリを更新してデプロイし直す',
      rationale: 'AI に変更を依頼し、再デプロイして URL を更新する 1 周目を体験します。',
      estimatedMinutes: 15,
      milestoneId: 'ms-noneng-publish',
      prerequisiteAtomIds: ['atom.web-builder.deploy-with-vercel-cli'],
      softPrerequisiteAtomIds: [] as string[],
      completedAt: null,
    },
  ],
  milestones: [
    {
      id: 'ms-noneng-firstscreen',
      title: 'AI にお任せで「画面が出る」まで',
      description:
        'コードを書かずに、ブラウザだけで AI に依頼して動くものを画面に出す段階です。',
      atomIds: [
        'atom.common.scaffold-with-v0',
        'atom.common.use-lovable-1shot',
        'atom.common.scaffold-with-bolt',
      ],
    },
    {
      id: 'ms-noneng-publish',
      title: '公開 URL として共有できる状態にする',
      description:
        'AI に作ってもらった Web アプリをデプロイして、誰でもアクセスできる URL にします。',
      atomIds: [
        'atom.web-builder.deploy-with-vercel-cli',
        'atom.web-builder.update-and-redeploy',
      ],
    },
  ],
  coverageScore: 1,
  unsupportedCapabilities: [] as string[],
  rationale:
    'コードを書かずに、AI vibe coding ツール (v0 / Lovable / Bolt.new) に依頼して画面を出し、Vercel CLI で公開 URL に到達するまでの最短プランです。',
  source: 'ai' as const,
}

/** Mock plan result for unsupported goal (coming-soon) */
export const MOCK_PLAN_RESULT_UNSUPPORTED = {
  adapter: {
    id: 'mock-planner',
    label: 'ローカル簡易プランナー',
    mode: 'mock' as const,
    status: 'fallback' as const,
    message: 'ローカルの判定ロジックで提案しています。',
  },
  recommendation: {
    status: 'coming-soon' as const,
    normalizedGoal: 'aiアプリを作りたい',
    userFacingGoal: 'AIアプリを作りたい',
    matchedIntent: 'unsupported' as const,
    title: 'このゴール向けのプランは準備中です',
    summary: 'AI 学習プランナーの土台は用意していますが、MVP で安定して案内できるのは Webサイト制作プランのみです。',
    detail: '入力いただいたゴールは今後サポート予定です。',
    supportMessage: '未対応テーマは無理に既存プランへ当てはめず、そのまま準備中として案内します。',
    nextAction: {
      type: 'browse-lessons' as const,
      label: '今あるレッスンを見る',
      href: '/lessons',
    },
    futureCategories: ['AI アプリ制作', '業務自動化'],
  },
}

/** Mock learner resume with existing state */
export const MOCK_LEARNER_RESUME = {
  learnerState: {
    target_outcome: 'AI ツールで小さな Web アプリを作って公開したい',
    skill_level: 'beginner',
    active_track_id: 'ai-app-builder',
    blockers: null,
    signals: null,
  },
  mentorMemories: [
    {
      id: 'mem-1',
      title: '初回ヒアリングメモ',
      bullets: ['Web アプリ制作は初めて', 'CLI 経験ゼロ・no-code-first 前提'],
      source: 'hearing',
    },
  ],
}

/** Mock artifacts API */
export function mockArtifactsGet(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ artifacts: [] }),
  })
}

export function mockArtifactsPost(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      artifact: {
        id: 'art-1',
        user_id: 'mock-user',
        task_id: 'step-1',
        type: 'url',
        body: 'https://example.com',
        title: null,
        created_at: new Date().toISOString(),
        milestone_id: 'ms-1',
        milestone_title: 'AI にお任せで「画面が出る」まで',
        step_title: 'v0 で最初の画面を出す',
        planner_goal: 'AI ツールで小さな Web アプリを作って公開したい',
        track_id: 'ai-app-builder',
      },
    }),
  })
}

/** Mock lesson complete */
export function mockLessonComplete(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ completed: true }),
  })
}

/** Mock lesson feedback */
export function mockLessonFeedback(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  })
}

/** Mock task progress */
export function mockTaskProgress(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true }),
  })
}

/** Mock graduation check */
export function mockGraduationCheck(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      graduation: {
        allMilestonesCompleted: true,
        completedMilestoneCount: 2,
        totalMilestoneCount: 2,
        criteria: [
          { criterion: { id: 'git-nextjs', label: 'Git 管理された Next.js アプリ', description: '', keywords: [] }, met: true, source: 'ローカル開発環境で動くサイト' },
          { criterion: { id: 'ai-coding-tool', label: 'AI コーディングツールが使える状態', description: '', keywords: [] }, met: true, source: null },
          { criterion: { id: 'ai-tool-reasoning', label: 'AI ツール選定理由を説明できる', description: '', keywords: [] }, met: true, source: null },
          { criterion: { id: 'tailwind-shadcn-ui', label: 'Tailwind CSS + shadcn/ui の UI', description: '', keywords: [] }, met: true, source: null },
          { criterion: { id: 'supabase-workflow', label: 'Supabase ワークフロー', description: '', keywords: [] }, met: true, source: null },
          { criterion: { id: 'vercel-deploy', label: 'Vercel デプロイ済み', description: '', keywords: [] }, met: true, source: '公開されたポートフォリオ' },
          { criterion: { id: 'stack-understanding', label: 'スタックの主要役割を説明できる', description: '', keywords: [] }, met: true, source: null },
        ],
        graduated: true,
        completedAt: new Date().toISOString(),
      },
    }),
  })
}

/** Mock graduation check with unmet criteria */
export function mockGraduationPartial(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      graduation: {
        allMilestonesCompleted: true,
        completedMilestoneCount: 2,
        totalMilestoneCount: 2,
        criteria: [
          { criterion: { id: 'git-nextjs', label: 'Git 管理された Next.js アプリ', description: '', keywords: [] }, met: true, source: null },
          { criterion: { id: 'vercel-deploy', label: 'Vercel デプロイ済み', description: '', keywords: [] }, met: false, source: null },
        ],
        graduated: false,
        completedAt: null,
      },
    }),
  })
}

/**
 * Set up all API mocks needed for the core planner flow.
 */
export async function setupCoreMocks(page: Page) {
  await mockSupabaseAuth(page)

  let hearingCallCount = 0
  const hearingHandler = (route: Route) => {
    hearingCallCount++
    // First call: return first question. Subsequent: complete hearing.
    if (hearingCallCount <= 1) {
      return mockHearingFirstTurn(route)
    }
    return mockHearingComplete(route)
  }
  await page.route('**/api/planner/hearing', hearingHandler)
  await page.route('**/api/mentor/session', hearingHandler)

  await page.route('**/api/artifacts', (route) => {
    if (route.request().method() === 'GET') return mockArtifactsGet(route)
    return mockArtifactsPost(route)
  })

  await page.route('**/api/artifacts/verify', mockArtifactVerify)
  await page.route('**/api/lessons/*/chat', mockLessonChat)
  await page.route('**/api/lessons/*/complete', mockLessonComplete)
  await page.route('**/api/lessons/*/feedback', mockLessonFeedback)
  await page.route('**/api/planner/task-progress', mockTaskProgress)
  await page.route('**/api/planner/graduation', mockGraduationCheck)
  await page.route('**/api/planner/plan-review', mockPlanReview)
  await page.route('**/api/planner/recommendation', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PLAN_RESULT),
    })
  )
  await page.route('**/api/learner/resume', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ learnerState: null, mentorMemories: [] }),
    })
  )
  await page.route('**/api/planner/goal-history', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    })
  )
}

/**
 * Set up mocks for the unsupported goal (coming-soon) flow.
 */
export async function setupUnsupportedGoalMocks(page: Page) {
  await mockSupabaseAuth(page)

  await page.route('**/api/planner/hearing', mockHearingFirstTurn)
  await page.route('**/api/mentor/session', mockHearingFirstTurn)
  await page.route('**/api/planner/recommendation', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PLAN_RESULT_UNSUPPORTED),
    })
  )
  await page.route('**/api/learner/resume', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ learnerState: null, mentorMemories: [] }),
    })
  )
  await page.route('**/api/planner/goal-history', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    })
  )
}

/**
 * Set up the intake wizard mocks for the preview flow.
 *
 * The onboarding client currently reads `data.preview` and `data.plan`, so the
 * mock payload includes those fields while keeping the top-level `plan` shape
 * from the legacy helper sketch for compatibility.
 */
export async function setupWizardMocks(page: Page, opts?: { plan?: object }) {
  const plan = opts?.plan ?? MOCK_PLAN_FIXTURE
  let hearingCallCount = 0

  const hearingHandler = async (route: Route) => {
    hearingCallCount += 1

    if (hearingCallCount <= 1) {
      return mockHearingFirstTurn(route)
    }

    return mockHearingComplete(route)
  }
  await page.route('**/api/planner/hearing', hearingHandler)
  await page.route('**/api/mentor/session', hearingHandler)

  await page.route('**/api/goals', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        data: { id: 'mock-goal', preview: true },
        id: 'mock-goal',
        preview: true,
      },
    })
  })

  await page.route('**/api/plans/compile', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        data: { plan, planId: null, preview: true },
        plan,
      },
    })
  })
}

/**
 * Set up mocks that simulate a returning user with existing state.
 */
export async function setupResumeMocks(page: Page) {
  await mockSupabaseAuth(page)

  let hearingCallCount = 0
  const hearingHandler = (route: Route) => {
    hearingCallCount++
    if (hearingCallCount <= 1) return mockHearingFirstTurn(route)
    return mockHearingComplete(route)
  }
  await page.route('**/api/planner/hearing', hearingHandler)
  await page.route('**/api/mentor/session', hearingHandler)

  await page.route('**/api/artifacts', (route) => {
    if (route.request().method() === 'GET') return mockArtifactsGet(route)
    return mockArtifactsPost(route)
  })

  await page.route('**/api/artifacts/verify', mockArtifactVerify)
  await page.route('**/api/lessons/*/chat', mockLessonChat)
  await page.route('**/api/lessons/*/complete', mockLessonComplete)
  await page.route('**/api/lessons/*/feedback', mockLessonFeedback)
  await page.route('**/api/planner/task-progress', mockTaskProgress)
  await page.route('**/api/planner/graduation', mockGraduationCheck)
  await page.route('**/api/planner/plan-review', mockPlanReview)
  await page.route('**/api/planner/recommendation', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PLAN_RESULT),
    })
  )
  await page.route('**/api/learner/resume', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_LEARNER_RESUME),
    })
  )
  await page.route('**/api/planner/goal-history', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [] }),
    })
  )
}

/** Mock lesson chat messages persistence endpoint */
export function mockLessonChatMessages(route: Route) {
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ messages: [], summary_key_points: null }),
  })
}

/**
 * Seed localStorage with a workspace snapshot so the planner dashboard
 * restores directly into workspace view (skipping hearing and tool selection).
 *
 * Must be called after page.goto() so we have a document context,
 * then followed by page.reload() to trigger hydration from storage.
 */
export async function seedWorkspaceStorage(page: Page, planResult = MOCK_PLAN_RESULT) {
  await page.evaluate((pr) => {
    const goal = 'AI ツールで小さな Web アプリを作って公開したい'
    const goalKey = goal.trim().toLowerCase()

    // school:planner-goal-v1 — plain string (no JSON.stringify)
    localStorage.setItem('school:planner-goal-v1', goal)

    // school:mentor-workspace-v2 — Record<string, PlannerWorkspaceSnapshot>
    const snapshot = {
      goal,
      result: pr,
      hearing: {
        answers: pr.recommendation.hearing,
        messages: [],
        lastQuestionId: null,
        transport: { status: 'live', label: 'mock', message: 'mock' },
        completedAt: new Date().toISOString(),
      },
      taskProgress: {},
      selectedStepId: null,
      mentorMessages: [],
      planId: null,
      savedAt: new Date().toISOString(),
    }

    localStorage.setItem(
      'school:mentor-workspace-v2',
      JSON.stringify({ [goalKey]: snapshot })
    )

    // Mark onboarding tour as completed so overlay doesn't block interactions
    localStorage.setItem('school:onboarding-tour-completed', '1')
  }, planResult)
}

/**
 * Seed localStorage with workspace + completed tasks to simulate graduation readiness.
 */
export async function seedGraduationStorage(page: Page, planResult = MOCK_PLAN_RESULT) {
  await page.evaluate((pr) => {
    const goal = 'AI ツールで小さな Web アプリを作って公開したい'
    const goalKey = goal.trim().toLowerCase()

    localStorage.setItem('school:planner-goal-v1', goal)

    const snapshot = {
      goal,
      result: pr,
      hearing: {
        answers: pr.recommendation.hearing,
        messages: [],
        lastQuestionId: null,
        transport: { status: 'live', label: 'mock', message: 'mock' },
        completedAt: new Date().toISOString(),
      },
      taskProgress: {
        'step-1': { status: 'completed', updatedAt: new Date().toISOString() },
        'step-2': { status: 'completed', updatedAt: new Date().toISOString() },
        'step-3': { status: 'completed', updatedAt: new Date().toISOString() },
      },
      selectedStepId: null,
      mentorMessages: [],
      planId: null,
      savedAt: new Date().toISOString(),
    }

    localStorage.setItem(
      'school:mentor-workspace-v2',
      JSON.stringify({ [goalKey]: snapshot })
    )

    // Mark onboarding tour as completed so overlay doesn't block interactions
    localStorage.setItem('school:onboarding-tour-completed', '1')
  }, planResult)
}
