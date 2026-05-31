import { test, expect } from '@playwright/test'
import {
  MOCK_PLAN_FIXTURE,
  completeHearingOnboarding,
  setupCoreMocks,
  setupWizardMocks,
} from './helpers'

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

test.describe('Goal-First Learning Flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('user can enter a goal and see a compiled plan', async ({ page }) => {
    await completeGoalIntakeWizard(page, 'ポートフォリオサイトを作りたい')

    await page.waitForURL('**/plan/preview')
    await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Next.js プロジェクト作成').first()).toBeVisible({ timeout: 10000 })
  })

  test('goal suggestions are clickable', async ({ page }) => {
    await page.goto('/plan/onboarding')

    // Example suggestion chips should be visible
    const chip = page.getByText('Web制作').first()
    await expect(chip).toBeVisible({ timeout: 5000 })

    await chip.click()
    await expect(page.getByLabel('ゴール入力')).toHaveValue('AIでポートフォリオやホームページを作りたい')
  })

  test('compiled plan shows progress', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })

  test('evidence submission form works', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })

  test('block renderer displays lesson content', async ({ page }) => {
    test.slow()
    // Navigate to a curriculum lesson that renders client-side
    await page.goto('/lessons/web-001', { waitUntil: 'domcontentloaded' })

    // Should show lesson content or fallback
    const content = page.locator('main, [class*="min-h"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })

    // Check for common block elements (markdown text, headings, etc.)
    // The lesson may render from curriculum fallback data
    const heading = page.locator('h1, h2, h3').first()
    await expect(heading).toBeVisible({ timeout: 5000 })
  })

  test('mentor workspace shows current task info', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })

  test('lesson navigation from plan works', async () => {
    test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
  })
})
