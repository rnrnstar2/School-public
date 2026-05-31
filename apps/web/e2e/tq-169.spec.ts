import { expect, test } from '@playwright/test'

import {
  loginAsTestUser,
  seedGoalContextFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-169-01 Task AI delegation brief',
  { tag: ['@node:TQ-169-01', '@db:real'] },
  () => {
    let goalId = ''

    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalContextFixture({ namespace: 'tq-169' })
      if (!seeded) {
        test.skip(true, 'Local Supabase fixture could not be prepared.')
        return
      }

      goalId = seeded.goalId

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('creates a mock AI brief from /goals and shows it in the goal context panel', async ({ page }) => {
      await page.goto('/goals')

      const goalSection = page.locator('section').filter({
        has: page.locator(`a[href="/goals/${goalId}"]`),
      }).first()
      const targetNode = goalSection.getByRole('treeitem', {
        name: /E2E を green にする/,
      })

      await expect(targetNode.getByRole('button', { name: 'AI に任せる' })).toBeVisible()
      await targetNode.getByRole('button', { name: 'AI に任せる' }).click()

      const popover = page.getByRole('dialog', { name: 'E2E を green にする の AI delegation' })
      await expect(popover).toBeVisible()

      const delegateResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST'
          && response.url().includes(`/api/goals/${goalId}/nodes/`)
          && response.url().endsWith('/delegate'),
      )

      await popover.locator('[data-testid^="ai-delegation-option-code_brief-"]').click()
      await delegateResponse

      await expect(page.getByRole('status')).toContainText('delegation brief を保存しました。')
      await expect(popover.locator('[data-testid^="ai-delegation-result-"]')).toContainText(
        '[Mock Code Brief] E2E を green にする',
      )

      await popover.getByRole('link', { name: 'goal context で確認' }).click()
      await page.waitForURL(`**/goals/${goalId}#ai-delegation-briefs`)

      await expect(
        page.getByRole('heading', { level: 1, name: 'Goal Context Panel を整える' }),
      ).toBeVisible()

      const briefSection = page.locator('details').filter({
        has: page.getByText('AI Delegation Briefs', { exact: true }),
      }).first()
      await briefSection.locator('summary').click()
      await expect(briefSection.getByText('Code Brief', { exact: true })).toBeVisible()
      await expect(briefSection.getByText('E2E を green にする', { exact: true })).toBeVisible()
      await expect(briefSection.getByText('[Mock Code Brief] E2E を green にする')).toBeVisible()
    })
  },
)
