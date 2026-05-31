import { expect, test } from '@playwright/test'

import {
  loginAsTestUser,
  seedGoalContextFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-167-01 Goal Context Panel',
  { tag: ['@node:TQ-167-01', '@db:real'] },
  () => {
    let goalId = ''

    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalContextFixture({ namespace: 'goal-context' })
      if (!seeded) {
        test.skip(true, 'Local Supabase fixture could not be prepared.')
        return
      }

      goalId = seeded.goalId

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('renders hero and expandable context sections on /goals/[id]', async ({ page }) => {
      const openGoalContextPage = async () => {
        await page.goto(`/goals/${goalId}`)
        await page.waitForLoadState('networkidle')

        const notFoundHeading = page.getByRole('heading', {
          level: 1,
          name: 'ページが見つかりません',
        })

        if (await notFoundHeading.isVisible()) {
          const reseeded = await seedGoalContextFixture({ namespace: 'goal-context' })
          expect(reseeded).not.toBeNull()
          goalId = reseeded?.goalId ?? goalId
          await page.goto(`/goals/${goalId}`)
          await page.waitForLoadState('networkidle')
        }
      }

      await openGoalContextPage()

      await expect(
        page.getByRole('heading', { level: 1, name: 'Goal Context Panel を整える' }),
      ).toBeVisible()
      await expect(page.getByText('Current Next Action')).toBeVisible()
      await expect(page.getByText('accordion を開いて内容を確認する')).toBeVisible()

      await expect(page.getByText('Goal Tree (summary)', { exact: true })).toBeVisible()
      await expect(page.getByText('Mentor Memory', { exact: true })).toBeVisible()
      await expect(page.getByText('Context Sources', { exact: true })).toBeVisible()
      await expect(page.getByText('Artifacts', { exact: true })).toBeVisible()
      await expect(page.getByText('Decisions', { exact: true })).toBeVisible()
      await expect(page.getByText('Profile / State', { exact: true })).toBeVisible()

      const treeSection = page.locator('details').filter({
        has: page.getByText('Goal Tree (summary)', { exact: true }),
      }).first()
      await treeSection.locator('summary').click()
      await expect(treeSection.getByText('完成形を決める', { exact: true })).toBeVisible()
      await expect(treeSection.getByRole('link', { name: '完全ツリーを見る' })).toBeVisible()

      const memorySection = page.locator('details').filter({
        has: page.getByText('Mentor Memory', { exact: true }),
      }).first()
      await memorySection.locator('summary').click()
      await expect(memorySection.getByText('hero は above-the-fold に出す')).toBeVisible()
      await expect(memorySection.getByText('accordion は default close')).toBeVisible()

      const contextSection = page.locator('details').filter({
        has: page.getByText('Context Sources', { exact: true }),
      }).first()
      await contextSection.locator('summary').click()
      await expect(contextSection.getByText('Goal Context Panel は hero と accordion を持つ')).toBeVisible()

      const artifactSection = page.locator('details').filter({
        has: page.getByText('Artifacts', { exact: true }),
      }).first()
      await artifactSection.locator('summary').click()
      await expect(artifactSection.getByText('storybook preview')).toBeVisible()
      await expect(artifactSection.getByRole('link', { name: '成果物リンクを開く' })).toBeVisible()

      const decisionSection = page.locator('details').filter({
        has: page.getByText('Decisions', { exact: true }),
      }).first()
      await decisionSection.locator('summary').click()
      await expect(decisionSection.getByText('hero を先に出す')).toBeVisible()
      await expect(decisionSection.getByText('sections は default close にする')).toBeVisible()

      const profileStateSection = page.locator('details').filter({
        has: page.getByText('Profile / State', { exact: true }),
      }).first()
      await profileStateSection.locator('summary').click()
      await expect(profileStateSection.getByText('E2E Learner')).toBeVisible()
      await expect(profileStateSection.getByText('Node.js 環境あり')).toBeVisible()
      await expect(profileStateSection.getByText('copy polish')).toBeVisible()
    })
  },
)
