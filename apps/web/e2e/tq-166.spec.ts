import { expect, test, type Route } from '@playwright/test'
import { mockLessonChatHistory, mockMentorSessionRoute, mockSupabaseAuth } from './helpers'

test.describe(
  'TQ-166-01: Chat structured output sections render',
  { tag: ['@node:TQ-166-01', '@db:mock'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await mockSupabaseAuth(page)
      await page.route('**/api/lessons/*/chat/history', (route) =>
        mockLessonChatHistory(route, []),
      )
      const structuredOutputHandler = (route: Route) => {
        const body = [
          `event: transport\ndata: ${JSON.stringify({ transport: { status: 'live', label: 'AI 応答 (mock)', message: 'structured output' } })}\n\n`,
          `event: token\ndata: ${JSON.stringify({ text: 'ポートフォリオのLPとして進める前提で整理できました。' })}\n\n`,
          `event: done\ndata: ${JSON.stringify({
            structuredOutput: {
              reply: 'ポートフォリオのLPとして進める前提で整理できました。',
              decisions: ['最初の成果物をポートフォリオLPにする'],
              open_questions: ['CTA を資料請求にするか問い合わせにするか'],
              next_question: '最初に誰へ見せるLPにしたいですか？',
              next_action: '参考LPを2件集めて共有する',
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

      await page.route('**/api/lessons/*/chat', structuredOutputHandler)
      await page.route(
        '**/api/mentor/session**',
        mockMentorSessionRoute(structuredOutputHandler),
      )
    })

    test('structured output の 4 セクションと CTA placeholder が表示される', async ({ page }) => {
      await page.goto('/dev/sp-chat')

      await page.getByRole('button', { name: 'レッスン内容について質問する' }).click()
      await page.getByLabel('質問を入力').fill('このレッスンの次に何をすればいいですか？')
      await page.getByRole('button', { name: '質問を送信' }).click()

      await expect(page.getByText('ポートフォリオのLPとして進める前提で整理できました。')).toBeVisible()
      await expect(page.getByText('決まったこと')).toBeVisible()
      await expect(page.getByText('最初の成果物をポートフォリオLPにする')).toBeVisible()
      await expect(page.getByText('未決事項')).toBeVisible()
      await expect(page.getByText('CTA を資料請求にするか問い合わせにするか')).toBeVisible()
      await expect(page.getByText('次の問い')).toBeVisible()
      await expect(page.getByText('最初に誰へ見せるLPにしたいですか？')).toBeVisible()
      await expect(page.getByText('次の 1 アクション')).toBeVisible()
      await expect(page.getByText('参考LPを2件集めて共有する')).toBeVisible()
      await expect(
        page.getByRole('button', { name: '練習タスクに追加 (TQ-171)' }),
      ).toBeDisabled()
    })
  },
)
