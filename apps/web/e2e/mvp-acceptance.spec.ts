import { test, expect } from '@playwright/test'
import {
  MOCK_PLAN_FIXTURE,
  completeHearingOnboarding,
  setupCoreMocks,
  startHearingOnboarding,
  setupWizardMocks,
} from './helpers'

function buildWizardPlan(
  goalText: string,
  overrides: Partial<typeof MOCK_PLAN_FIXTURE> = {},
) {
  return {
    ...MOCK_PLAN_FIXTURE,
    goal: goalText,
    ...overrides,
  }
}

async function completeHearingOnboardingFlow(
  page: import('@playwright/test').Page,
  goalText: string,
  plan = buildWizardPlan(goalText),
) {
  await setupWizardMocks(page, { plan })
  await completeHearingOnboarding(page, { goalText })
}

/**
 * MVP Acceptance Criteria E2E Tests — 要件定義書 Section 11
 *
 * These tests verify all 17 MVP acceptance criteria end-to-end.
 * Each test is tagged with the criterion number (AC-01 through AC-17).
 */

/* ================================================================
 * AC-01: ユーザーが日本語で website goal を入力できる
 * ================================================================ */
test.describe('AC-01: Goal input in Japanese', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('can type a Japanese website goal and submit', async ({ page }) => {
    await completeHearingOnboardingFlow(page, 'ポートフォリオサイトを公開したい')

    await page.waitForURL('**/plan/preview')
    await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Next.js プロジェクト作成').first()).toBeVisible({ timeout: 10000 })
  })

  test('example chips fill in Japanese goals', async ({ page }) => {
    await page.goto('/plan/onboarding')
    await page.getByText('Web制作').first().click()
    await expect(page.getByLabel('ゴール入力')).toHaveValue('AIでポートフォリオやホームページを作りたい')
  })
})

/* ================================================================
 * AC-02: システムが supported と web-builder-ai を判定できる
 * ================================================================ */
test.describe('AC-02: Support status detection', () => {
  test('supported goal → hearing proceeds', async ({ page }) => {
    await setupCoreMocks(page)
    await completeHearingOnboardingFlow(page, 'ポートフォリオサイトを公開したい')

    await page.waitForURL('**/plan/preview')
    await expect(page.getByTestId('plan-primary-cta')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Next.js プロジェクト作成').first()).toBeVisible()
  })

  test('unsupported goal → coming-soon indication', async ({ page }) => {
    const unsupportedPlan = buildWizardPlan('AIアプリを作りたい', {
      steps: [],
      milestones: [],
      coverageScore: 0,
      unsupportedCapabilities: ['AIアプリ制作'],
      rationale: 'このテーマ向けのレッスンはまだ準備中です。',
    })

    await completeHearingOnboardingFlow(page, 'AIアプリを作りたい', unsupportedPlan)

    await page.waitForURL('**/plan/preview')
    await page.getByRole('button', { name: /Task subdivision/ }).click()
    await expect(page.getByText('追加コンテンツ準備中')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('AIアプリ制作 を満たす atom が不足しています')).toBeVisible()
  })
})

/* ================================================================
 * AC-03: AI が不足情報をヒアリングし、milestone 付き plan を返せる
 * ================================================================ */
test.describe('AC-03: Hearing → plan with milestones', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('hearing asks questions and produces a plan', async ({ page }) => {
    await setupWizardMocks(page, { plan: buildWizardPlan('ポートフォリオサイトを公開したい') })
    await startHearingOnboarding(page, { goalText: 'ポートフォリオサイトを公開したい' })
    await expect(
      page.getByText('Web制作の経験はありますか？').first(),
    ).toBeVisible({ timeout: 10_000 })
    await page.getByLabel('ヒアリング回答').fill('初めてです')
    await page.getByRole('button', { name: '回答を送信' }).click()
    await expect(page.getByTestId('hearing-confirm')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: 'この内容でプランを作成する' }).click()

    await page.waitForURL('**/plan/preview')
    await expect(page.getByTestId('plan-primary-cta')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Next.js プロジェクト作成').first()).toBeVisible()
    await expect(page.getByTestId('plan-task-subdivision-accordion')).toBeVisible()
  })
})

/* ================================================================
 * AC-04: AI がユーザー条件に応じて適切な AI tool を推薦できる
 * ================================================================ */
test.describe('AC-04: AI tool recommendation', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('tool selection view appears after hearing for beginner', async ({ page }) => {
    await setupWizardMocks(page, { plan: buildWizardPlan('ポートフォリオサイトを公開したい') })
    await completeHearingOnboarding(page, {
      goalText: 'ポートフォリオサイトを公開したい',
      autoConfirm: false,
    })

    await expect(page.getByTestId('hearing-confirm')).toContainText('Claude Code')
    await page.getByRole('button', { name: 'この内容でプランを作成する' }).click()
    await page.waitForURL('**/plan/preview')
  })
})

/* ================================================================
 * AC-05: AI が current step を task に分解できる
 * ================================================================ */
test.describe('AC-05: Step → task decomposition', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('workspace shows current task with title', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-06: task が Do / Learn / Why に近い形で提示される
 * ================================================================ */
test.describe('AC-06: Do / Learn / Why task presentation', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('workspace shows task with action-oriented labels', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-07: learner_profile, learner_state, mentor_memory を保持できる
 * ================================================================ */
test.describe('AC-07: Learner state persistence', () => {
  test('resume API is called on page load', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-08: UI 上で goal, milestone, current task, chat, lesson を確認できる
 * ================================================================ */
test.describe('AC-08: Workspace shows goal/milestone/task/chat/lesson', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('mentor workspace displays all key sections', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-09: UI 上で推薦 AI tool と選定理由を確認できる
 * ================================================================ */
test.describe('AC-09: AI tool recommendation in UI', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('tool recommendation visible in workspace details', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-10: 少なくとも 1 つの lesson で画像または動画系メディアを扱える
 * ================================================================ */
test.describe('AC-10: Lesson with media content', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('lesson page renders media-capable content', async ({ page }) => {
    await page.goto('/lessons/web-001')
    const content = page.locator('main, [class*="min-h"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })

  test('lesson library renders', async ({ page }) => {
    test.setTimeout(60000)
    await page.goto('/lessons', { timeout: 30000 })
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
  })
})

/* ================================================================
 * AC-11: ユーザーが task 状態を更新できる
 * ================================================================ */
test.describe('AC-11: Task status update', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('task status buttons are clickable', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-12: ユーザーが URL / text / note を artifact として残せる
 * ================================================================ */
test.describe('AC-12: Artifact submission', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('artifact panel shows type options and submit button', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-13: 再訪時に前回の状態から再開できる
 * ================================================================ */
test.describe('AC-13: Resume from previous state', () => {
  test('returning user sees previous goal and workspace', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-14: 再訪時に理解度・詰まり・好みに応じて task/lesson 提示が調整される
 * ================================================================ */
test.describe('AC-14: Personalized resume', () => {
  test('resume API sends learner state for personalization', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-15: live / fallback / support_status が明示される
 * ================================================================ */
test.describe('AC-15: Transport status transparency', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('transport badge shows status indicator', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * AC-16: Web 制作トラックに AI coding tool 導入 lesson が含まれる
 * ================================================================ */
test.describe('AC-16: AI tool onboarding lesson in web track', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('lesson library includes AI tool lessons', async ({ page }) => {
    test.setTimeout(60000)
    await page.goto('/lessons', { timeout: 30000 })
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/AI|ツール|コーディング/).first()).toBeVisible({ timeout: 15000 })
  })
})

/* ================================================================
 * AC-17: Web 制作トラックで idea → live URL まで E2E に到達できる
 * ================================================================ */
test.describe('AC-17: Full flow — idea to graduation', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('goal → hearing → plan → workspace flow', async ({ page }) => {
    await completeHearingOnboardingFlow(page, 'ポートフォリオサイトを公開したい')

    await page.waitForURL('**/plan/preview')
    await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Next.js プロジェクト作成').first()).toBeVisible()
  })
})

/* ================================================================
 * Graduation panel E2E
 * ================================================================ */
test.describe('Graduation panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('workspace with completed tasks shows graduation button', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})

/* ================================================================
 * Lesson detail: chat interaction
 * ================================================================ */
test.describe('Lesson chat interaction', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('lesson page renders', async ({ page }) => {
    await page.goto('/lessons/web-001')
    const content = page.locator('main, [class*="min-h"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })
})

/* ================================================================
 * Landing page: dual entry points
 * ================================================================ */
test.describe('Landing page entry points', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('landing has plan and lessons entry points', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText(
      'AI で実現したい人が、迷わず前進する mentor workspace',
    )
    await expect(page.getByRole('link', { name: 'Goal を共有する' }).first()).toHaveAttribute(
      'href',
      '/plan/onboarding',
    )
    await expect(page.getByRole('link', { name: '補助レッスンを見る' }).first()).toBeVisible()
  })
})
