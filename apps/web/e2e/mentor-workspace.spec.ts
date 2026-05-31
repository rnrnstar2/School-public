import { expect, test, type Page } from '@playwright/test'
import { MOCK_PLAN_FIXTURE, setupCoreMocks } from './helpers'

async function seedPreviewPlan(page: Page) {
  await page.addInitScript((plan) => {
    sessionStorage.setItem(
      'school:preview:plan',
      JSON.stringify({
        plan,
        goal: plan.goal,
        tools: ['claude-code'],
        compiledAt: new Date().toISOString(),
      }),
    )
  }, MOCK_PLAN_FIXTURE)
}

test.describe('Mentor workspace skim flow', () => {
  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
    await seedPreviewPlan(page)
  })

  test('preview default keeps secondary details collapsed', async ({ page }) => {
    await page.goto('/plan/preview')

    await expect(page.getByTestId('plan-goal-summary')).toContainText('ポートフォリオサイトを公開したい')
    await expect(page.getByTestId('plan-current-task')).toContainText('Next.js プロジェクト作成')
    await expect(page.getByTestId('plan-primary-cta')).toContainText('このタスクを始める')
    await expect(page.getByText('トップページを作る')).not.toBeVisible()

    await page.getByRole('button', { name: /Task subdivision/ }).click()
    await expect(page.getByText('トップページを作る')).toBeVisible()
  })

})
