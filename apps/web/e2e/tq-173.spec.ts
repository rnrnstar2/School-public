import { expect, test } from '@playwright/test'

import {
  loginAsTestUser,
  seedGoalContextFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-173-01 Progress Timeline',
  { tag: ['@node:TQ-173-01', '@db:real'] },
  () => {
    let goalId = ''

    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalContextFixture({ namespace: 'tq-173' })
      if (!seeded) {
        test.skip(true, 'Local Supabase fixture could not be prepared.')
        return
      }

      goalId = seeded.goalId

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('renders the merged progress timeline at the end of /goals/[id]', async ({ page }) => {
      await page.goto(`/goals/${goalId}`)

      const section = page.locator('details').filter({
        has: page.getByText('Progress Timeline', { exact: true }),
      }).first()

      await expect(section).toBeVisible()
      await expect(section).toHaveAttribute('open', '')
      await expect(section.getByText('Lesson completed', { exact: true }).first()).toBeVisible()
      await expect(section.getByText('Task completed', { exact: true })).toBeVisible()
      await expect(section.getByText('Node completed', { exact: true })).toBeVisible()
      await expect(section.getByText('Context: doc', { exact: true })).toBeVisible()
      await expect(section.getByText('Progress Timeline section を追加する')).toBeVisible()
    })
  },
)
