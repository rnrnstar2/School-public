import { expect, test } from '@playwright/test'

import {
  getAdminClient,
  getDecisionLedgerClient,
  loginAsTestUser,
  seedAsk2ActionPlanFixture,
} from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe(
  'TQ-170-01: Ask2Action next question on /plan',
  { tag: ['@node:TQ-170-01', '@db:real'] },
  () => {
    let goalId = ''

    test.beforeEach(async ({ page }) => {
      const seeded = await seedAsk2ActionPlanFixture()
      if (!seeded) {
        test.skip(true, 'Local Supabase fixture could not be prepared.')
        return
      }

      goalId = seeded.goalId

      const loggedIn = await loginAsTestUser(page)
      expect(loggedIn).toBe(true)
    })

    test('renders NextQuestionCard and stores an answer before showing the follow-up question', async ({ page }) => {
      await page.goto('/plan')

      await expect(page.getByTestId('next-question-card')).toBeVisible()
      await expect(page.getByText('AI からの次の問い')).toBeVisible()
      await expect(page.getByText('今、何に迷っていますか？')).toBeVisible({
        timeout: 20_000,
      })

      const answerRequest = page.waitForResponse((response) =>
        response.request().method() === 'POST'
        && response.url().includes(`/api/goals/${goalId}/next-question/answer`),
      )

      await page.getByRole('button', { name: '手順が不明' }).click()
      await page.getByRole('button', { name: '回答して進む' }).click()
      await answerRequest

      await expect(
        page.getByText('その答えを踏まえて、次にどこを整理したいですか？'),
      ).toBeVisible()

      const admin = await getAdminClient()
      expect(admin).not.toBeNull()
      const ledger = getDecisionLedgerClient(admin!)
      const { data, error } = await ledger
        .from('goal_contexts')
        .select('*')
        .eq('goal_id', goalId)
        .eq('source_type', 'ask2action_answer')
        .order('created_at', { ascending: false })
        .limit(1)

      expect(error).toBeNull()
      expect(Array.isArray(data) && data.length > 0).toBe(true)
      expect(data?.[0]?.content).toContain('手順が不明')
    })
  },
)
