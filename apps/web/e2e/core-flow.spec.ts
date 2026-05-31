import { test, expect } from '@playwright/test'
import { MOCK_PLAN_FIXTURE, completeHearingOnboarding, setupCoreMocks, setupWizardMocks } from './helpers'

function buildWizardPlan(goalText: string) {
  return {
    ...MOCK_PLAN_FIXTURE,
    goal: goalText,
  }
}

async function completeGoalIntakeWizard(page: import('@playwright/test').Page, goalText: string) {
  await setupWizardMocks(page, { plan: buildWizardPlan(goalText) })
  await completeHearingOnboarding(page, { goalText })
}

test.describe('Core Flow Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('landing page loads with two entry points', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText(
      'AI で実現したい人が、迷わず前進する mentor workspace',
    )
    const planLink = page.getByRole('link', { name: 'Goal を共有する' }).first()
    await expect(planLink).toBeVisible()
    const lessonsLink = page.getByRole('link', { name: '補助レッスンを見る' }).first()
    await expect(lessonsLink).toBeVisible()
    await expect(page.getByText('Goal Tree', { exact: true })).toBeVisible()
    await expect(page.getByText('Context Panel', { exact: true })).toBeVisible()
  })

  test('navigate to planner page from landing', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Goal を共有する' }).first().click()
    await page.waitForURL('**/plan/onboarding')
    await expect(page.getByLabel('ゴール入力')).toBeVisible()
  })

  test('goal input: type goal and see example chips', async ({ page }) => {
    await page.goto('/plan/onboarding')

    const textarea = page.getByLabel('ゴール入力')
    await expect(textarea).toBeVisible()

    // Example chips should be present
    const suggestion = page.getByText('Web制作').first()
    await expect(suggestion).toBeVisible()

    // Clicking a suggestion fills the goal draft for the hearing flow.
    await suggestion.click()
    await expect(textarea).toHaveValue('AIでポートフォリオやホームページを作りたい')
  })

  test('goal submit shows the compiled preview plan', async ({ page }) => {
    await completeGoalIntakeWizard(page, 'ポートフォリオサイトを公開したい')

    await page.waitForURL('**/plan/preview')
    await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Next.js プロジェクト作成').first()).toBeVisible({ timeout: 10000 })
  })

  test('wizard completion lands on the plan review step', async ({ page }) => {
    await completeGoalIntakeWizard(page, 'ポートフォリオサイトを公開したい')

    await page.waitForURL('**/plan/preview')
    await expect(page.getByTestId('plan-primary-cta')).toBeVisible()
    await expect(page.getByTestId('plan-current-task')).toContainText('Next.js プロジェクト作成')
  })

  test('lesson library page loads', async ({ page }) => {
    test.setTimeout(60000)
    await page.goto('/lessons')
    // The lessons browser should render
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
  })

  test('curriculum lesson detail page renders', async ({ page }) => {
    // web-001 is a curriculum lesson that renders client-side without Supabase
    await page.goto('/lessons/web-001')
    // Should show lesson title or "レッスンが見つかりません"
    const content = page.locator('main, [class*="min-h"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
  })
})
