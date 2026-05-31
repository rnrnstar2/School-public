import { expect, test } from '@playwright/test'

import {
  loginAsTestUser,
  seedGoalContextFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-172-01 Agent delegation brief copy flow',
  { tag: ['@node:TQ-172-01', '@db:real'] },
  () => {
    let goalId = ''

    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        let copiedText = ''

        Object.defineProperty(window.navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              copiedText = text
              ;(window as Window & { __copiedText?: string }).__copiedText = text
            },
            readText: async () => copiedText,
          },
        })
      })

      const seeded = await seedGoalContextFixture({ namespace: 'tq-172' })
      if (!seeded) {
        test.skip(true, 'Local Supabase fixture could not be prepared.')
        return
      }

      goalId = seeded.goalId

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('creates a mock Codex CLI brief, shows copy feedback, and stores it under agent briefs', async ({ page }) => {
      await page.goto('/goals')

      const goalSection = page.locator('section').filter({
        has: page.locator(`a[href="/goals/${goalId}"]`),
      }).first()
      const targetNode = goalSection.getByRole('treeitem', {
        name: /E2E を green にする/,
      })

      await targetNode.getByRole('button', { name: 'AI に任せる' }).click()

      const popover = page.getByRole('dialog', { name: 'E2E を green にする の AI delegation' })
      await expect(popover).toBeVisible()
      await expect(popover.getByText('Codex CLI 用 brief を生成', { exact: true })).toBeVisible()
      await expect(popover.getByText('Claude Code 用 brief を生成', { exact: true })).toBeVisible()

      const delegateResponse = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST'
          && response.url().includes(`/api/goals/${goalId}/nodes/`)
          && response.url().endsWith('/delegate'),
      )

      await popover.locator('[data-testid^="ai-delegation-option-codex_cli_brief-"]').click()
      await delegateResponse

      await expect(page.getByRole('status')).toContainText('delegation brief を保存しました。')

      const resultCard = popover.locator('[data-testid^="ai-delegation-result-"]')
      await expect(resultCard).toContainText('Codex CLI 用 brief を生成 brief')
      await expect(resultCard).toContainText('cwd: /path/to/project-root')

      const copyButton = popover.locator('[data-testid^="ai-delegation-copy-"]')
      await expect(copyButton).toBeVisible()
      await copyButton.click()

      await expect(page.getByRole('status')).toContainText('コピーしました')
      await expect(copyButton).toContainText('コピーしました')

      const copiedText = await page.evaluate(
        () => (window as Window & { __copiedText?: string }).__copiedText ?? '',
      )
      expect(copiedText).toContain('Codex CLI')
      expect(copiedText).toContain('Execution Steps')

      await popover.getByRole('link', { name: 'goal context で確認' }).click()
      await page.waitForURL(`**/goals/${goalId}#agent-delegation-briefs`)

      const briefSection = page.locator('details').filter({
        has: page.getByText('Agent Delegation Briefs', { exact: true }),
      }).first()
      await briefSection.locator('summary').click()

      await expect(briefSection.getByText('Codex CLI', { exact: true })).toBeVisible()
      await expect(briefSection.getByText('Codex CLI Brief', { exact: true })).toBeVisible()
      await expect(briefSection.getByText('E2E を green にする', { exact: true })).toBeVisible()
      await expect(briefSection.getByText('Execution Steps')).toBeVisible()
    })
  },
)
