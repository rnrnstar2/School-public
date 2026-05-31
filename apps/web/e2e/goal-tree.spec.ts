import { expect, test } from '@playwright/test'

import {
  GOAL_TREE_FIXTURE_NODE_IDS,
  loginAsTestUser,
  seedGoalTreeFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-159-01 Goal tree viz',
  { tag: ['@node:TQ-159-01', '@db:real'] },
  () => {
    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalTreeFixture()
      test.skip(!seeded, 'Local Supabase fixture could not be prepared.')

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('renders the learner goal tree and lesson CTA on /goals', async ({ page }) => {
      await page.goto('/goals')

      await expect(
        page.getByRole('heading', { level: 1, name: 'ゴールツリー' }),
      ).toBeVisible()
      const goalSection = page.locator('section').filter({
        has: page.getByRole('heading', {
          level: 2,
          name: 'ポートフォリオサイトを公開する',
        }),
      }).first()

      await expect(goalSection.getByRole('tree')).toBeVisible({ timeout: 15_000 })
      await expect(goalSection.getByText('Goal root')).toBeVisible()
      await expect(goalSection.getByText('公開する理由と完成像を固める', { exact: true })).toBeVisible()
      await expect(goalSection.getByText('導線を決める', { exact: true })).toBeVisible()
      await expect(goalSection.getByText('プロフィールと制作実績を載せる', { exact: true })).toBeVisible()

      const openLesson = goalSection.getByRole('link', { name: 'Open lesson' })
      await expect(openLesson).toBeVisible()
      await expect(openLesson).toHaveAttribute('href', /\/lessons\/atom\.goal-tree\.fixture$/)
    })
  },
)

test.describe(
  'TQ-165-01 Goal Tree owner + dependency UI',
  { tag: ['@node:TQ-165-01', '@db:real'] },
  () => {
    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalTreeFixture()
      test.skip(!seeded, 'Local Supabase fixture could not be prepared.')

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('renders owner badges, dependency notes, and fallback links', async ({ page }) => {
      await page.goto('/goals')

      const goalSection = page.locator('section').filter({
        has: page.getByRole('heading', {
          level: 2,
          name: 'ポートフォリオサイトを公開する',
        }),
      }).first()
      const targetNode = goalSection.locator(`#goal-node-${GOAL_TREE_FIXTURE_NODE_IDS[4]}`)

      await expect(targetNode.getByText('🧑🤖 協働')).toBeVisible()
      await expect(
        targetNode.getByText('↑ トップページの情報設計を決める を先に完了'),
      ).toBeVisible()
      await expect(
        targetNode.getByRole('link', { name: 'Open fallback: 公開 URL を確認する' }),
      ).toBeVisible()
    })
  },
)

test.describe(
  'TQ-168-01 Task owner_type badge',
  { tag: ['@node:TQ-168-01', '@db:real'] },
  () => {
    test.beforeEach(async ({ page }) => {
      const seeded = await seedGoalTreeFixture()
      test.skip(!seeded, 'Local Supabase fixture could not be prepared.')

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('renders owner badges and the AI delegatable icon on /goals', async ({ page }) => {
      await page.goto('/goals')

      const goalSection = page.locator('section').filter({
        has: page.getByRole('heading', {
          level: 2,
          name: 'ポートフォリオサイトを公開する',
        }),
      }).first()
      const collaborativeNode = goalSection.locator(`#goal-node-${GOAL_TREE_FIXTURE_NODE_IDS[4]}`)
      const aiNode = goalSection.locator(`#goal-node-${GOAL_TREE_FIXTURE_NODE_IDS[5]}`)

      await expect(collaborativeNode.getByText('🧑🤖 協働')).toBeVisible()
      await expect(collaborativeNode.getByLabel('AI 委譲可')).toBeVisible()
      await expect(aiNode.getByText('🤖 AI')).toBeVisible()
      await expect(aiNode.getByLabel('AI 委譲可')).toBeVisible()
    })
  },
)
