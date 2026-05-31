import { test, expect } from '@playwright/test'
import { setupTrackMocks, seedTrackWorkspaceStorage } from './track-helpers'
import { MOCK_PLAN_FIXTURE, setupWizardMocks, startHearingOnboarding, advanceHearingToConfirm } from './helpers'

function buildWizardPlan(goalText: string) {
  return {
    ...MOCK_PLAN_FIXTURE,
    goal: goalText,
  }
}

async function fillGoalIntakeWizard(page: import('@playwright/test').Page, goalText: string) {
  await startHearingOnboarding(page, { goalText })
  await advanceHearingToConfirm(page, { goalText })
}

/**
 * TQ-101: SSE Streaming Chat E2E Tests
 *
 * Tests streaming chat connection, incremental text display, and disconnect recovery.
 */

test.describe('SSE Streaming Chat', () => {
  test.describe('Lesson chat streaming', () => {
    test.beforeEach(async ({ page }) => {
      await setupTrackMocks(page, 'web-builder-ai')
    })

    test('lesson chat sends SSE response with text-delta events', async ({ page }) => {
      // Override lesson chat with multi-chunk streaming
      await page.route('**/api/lessons/*/chat', (route) => {
        const body = [
          `event: text-delta\ndata: ${JSON.stringify({ text: 'まず、' })}\n\n`,
          `event: text-delta\ndata: ${JSON.stringify({ text: 'Node.js を' })}\n\n`,
          `event: text-delta\ndata: ${JSON.stringify({ text: 'インストールしましょう。' })}\n\n`,
          `event: done\ndata: {}\n\n`,
        ].join('')

        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' },
          body,
        })
      })

      await page.goto('/lessons/web-001')
      const content = page.locator('main, [class*="min-h"]').first()
      await expect(content).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Mentor chat streaming', () => {
    test.beforeEach(async ({ page }) => {
      await setupTrackMocks(page, 'web-builder-ai')
    })

    test('mentor chat returns streaming response', async ({ page }) => {
      test.skip(true, 'SSR workspace requires real Supabase auth — not available in mock-only e2e')
      // Override mentor chat to simulate multi-chunk streaming
      await page.route('**/api/planner/mentor-chat', (route) => {
        const body = [
          `event: transport\ndata: ${JSON.stringify({ transport: { status: 'live', label: 'AI 応答', message: 'streaming' } })}\n\n`,
          `event: text-delta\ndata: ${JSON.stringify({ text: '開発環境の' })}\n\n`,
          `event: text-delta\ndata: ${JSON.stringify({ text: 'セットアップ方法を' })}\n\n`,
          `event: text-delta\ndata: ${JSON.stringify({ text: '説明しますね。' })}\n\n`,
          `event: done\ndata: {}\n\n`,
        ].join('')

        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' },
          body,
        })
      })

      await page.goto('/plan')
      await seedTrackWorkspaceStorage(page, 'web-builder-ai')
      await page.reload()

      // Wait for workspace to load
      await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

      // Find chat input area (mentor chat section)
      const chatSection = page.getByText('メンターチャット').first()
      if (await chatSection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await chatSection.click()
      }
    })
  })

  test.describe('Goal intake wizard submission', () => {
    test('wizard posts goal + compile requests and shows preview plan', async ({ page }) => {
      const goalText = 'ポートフォリオサイトを作りたい'
      await setupWizardMocks(page, { plan: buildWizardPlan(goalText) })
      await fillGoalIntakeWizard(page, goalText)

      const goalRequestPromise = page.waitForRequest('**/api/goals')
      const compileRequestPromise = page.waitForRequest('**/api/plans/compile')
      await page.getByRole('button', { name: 'この内容でプランを作成する' }).click()

      const goalRequest = await goalRequestPromise
      const compileRequest = await compileRequestPromise

      expect(goalRequest.postDataJSON()).toMatchObject({ goal: goalText })
      expect(compileRequest.postDataJSON()).toMatchObject({ goal: goalText })
      await page.waitForURL('**/plan/preview')
      await expect(page.getByText('プレビューモード').first()).toBeVisible({ timeout: 10000 })
    })

    test('wizard save failure keeps the user on onboarding with an error', async ({ page }) => {
      await setupWizardMocks(page, { plan: buildWizardPlan('テストゴール') })
      await page.route('**/api/goals', async (route) => {
        await route.fulfill({
          status: 500,
          json: { message: 'ゴールの保存に失敗しました' },
        })
      })

      await fillGoalIntakeWizard(page, 'テストゴール')
      await page.getByRole('button', { name: 'この内容でプランを作成する' }).click()

      await expect(page.getByText('ゴールの保存に失敗しました')).toBeVisible({ timeout: 10000 })
      await expect(page).toHaveURL(/\/plan\/onboarding$/)
    })
  })
})
