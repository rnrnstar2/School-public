import { expect, test } from '@playwright/test'

test.describe(
  'TQ-174-01: Landing page shows the new mentor workspace positioning',
  { tag: ['@node:TQ-174-01', '@db:mock'] },
  () => {
    test('renders the new tagline, goal-first flow, and onboarding CTA', async ({ page }) => {
      await page.goto('/')

      await expect(page.locator('h1')).toContainText(
        'AI で実現したい人が、迷わず前進する mentor workspace',
      )
      await expect(page.getByText('Goal を共有すると、chat で前提を整え、plan と次の action まで mentor workspace にまとめます。')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Goal を共有する' }).first()).toHaveAttribute(
        'href',
        '/plan/onboarding',
      )

      await expect(page.getByText('Goal Tree', { exact: true })).toBeVisible()
      await expect(page.getByText('Ask2Action', { exact: true })).toBeVisible()
      await expect(page.getByText('Speak2Action', { exact: true })).toBeVisible()
      await expect(page.getByText('Agent2Action', { exact: true })).toBeVisible()
      await expect(page.getByText('Context Panel', { exact: true })).toBeVisible()
    })
  },
)
