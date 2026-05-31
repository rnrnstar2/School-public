import { expect, test, type Route } from '@playwright/test'
import { mockMentorSessionRoute } from './helpers'
import { seedTrackWorkspaceStorage, setupTrackMocks } from './track-helpers'

test.describe(
  'TQ-176-01: Mentor chat preserves action-only finalization',
  { tag: ['@node:TQ-176-01', '@db:mock'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await setupTrackMocks(page, 'web-builder-ai')

      await page.route('**/api/planner/mentor-chat/suggested-questions**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ questions: [] }),
        }),
      )

      const actionOnlyHandler = (route: Route) => {
        const body = [
          `event: transport\ndata: ${JSON.stringify({ transport: { status: 'live', label: 'AI 応答', message: 'streaming' } })}\n\n`,
          `event: actions\ndata: ${JSON.stringify({
            actions: [{ type: 'recompile_plan', reason: '今の進捗に合わせて更新する' }],
          })}\n\n`,
          `event: done\ndata: ${JSON.stringify({
            structuredOutput: {
              reply: '',
              decisions: [],
              open_questions: [],
              next_question: null,
              next_action: null,
            },
          })}\n\n`,
        ].join('')

        return route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
          },
          body,
        })
      }

      await page.route('**/api/planner/mentor-chat', actionOnlyHandler)
      await page.route(
        '**/api/mentor/session**',
        mockMentorSessionRoute(actionOnlyHandler),
      )
    })

    test('renders action cards without falling back to an empty placeholder bubble', async ({ page }) => {
      await page.goto('/plan')
      await seedTrackWorkspaceStorage(page, 'web-builder-ai')
      await page.reload()

      await expect(page.getByText('ゴール').first()).toBeVisible({ timeout: 15000 })

      await page.getByRole('button', { name: 'メンターに相談' }).click()
      await expect(page.getByRole('dialog', { name: 'メンターチャット' })).toBeVisible()

      await page.getByLabel('メンターへの相談').fill('進め方を見直したい')
      await page.getByRole('button', { name: '相談する' }).click()

      await expect(page.getByText('プランを再生成', { exact: true })).toBeVisible()
      await expect(page.getByText('理由: 今の進捗に合わせて更新する')).toBeVisible()
      await expect(page.getByRole('button', { name: '適用する' })).toBeVisible()
      await expect(page.getByText('応答を表示できませんでした。')).toHaveCount(0)
    })
  },
)
