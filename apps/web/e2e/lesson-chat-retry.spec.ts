import { expect, test, type Page } from '@playwright/test'
import {
  createLessonChatRetrySequence,
  mockLessonChatHistory,
  mockMentorSessionRoute,
} from './helpers'

async function openLessonChat(page: Page) {
  const openButton = page.getByRole('button', { name: /レッスン内容について質問する/ }).first()
  const chatRegion = page.getByRole('region', { name: 'レッスン AI チャット' })
  const composer = page.getByLabel('質問を入力')

  await expect(openButton).toBeVisible({ timeout: 10_000 })
  await openButton.scrollIntoViewIfNeeded()

  await expect
    .poll(async () => {
      await openButton.click({ force: true }).catch(() => undefined)
      return await chatRegion.isVisible().catch(() => false)
    }, {
      timeout: 20_000,
      intervals: [250, 500, 1_000, 2_000],
      message: 'expected lesson chat region to open after hydration',
    })
    .toBe(true)

  await expect(chatRegion).toBeVisible({ timeout: 10_000 })
  await expect(composer).toBeVisible({ timeout: 10_000 })
}

test.describe(
  'TQ-161-01: Lesson chat retry',
  { tag: ['@node:TQ-161-01', '@db:real'] },
  () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test.beforeEach(async ({ page }) => {
      await page.route('**/api/lessons/*/chat/history', (route) =>
        mockLessonChatHistory(route, []),
      )
      await page.route(
        '**/api/lessons/*/chat',
        createLessonChatRetrySequence(),
      )
      await page.route(
        '**/api/mentor/session**',
        mockMentorSessionRoute(createLessonChatRetrySequence()),
      )
    })

    test('SSE 500 の直後に同じ質問を retry して 200 streaming で回復できる', async ({
      page,
    }) => {
      test.slow()
      await page.goto('/dev/sp-chat', { waitUntil: 'domcontentloaded' })

      await openLessonChat(page)
      await page.getByLabel('質問を入力').fill('Next.js とは何ですか？')
      await page.getByRole('button', { name: '質問を送信' }).click()

      await expect(page.getByText('一時的に AI 応答の取得に失敗しました')).toBeVisible({
        timeout: 5_000,
      })

      let retryButton = page.getByRole('button', { name: 'もう一度送信' })
      if (!(await retryButton.isVisible().catch(() => false))) {
        retryButton = page.getByRole('button', { name: '再試行' })
      }
      await expect(retryButton).toBeVisible()
      await expect(retryButton).toBeEnabled()

      await retryButton.click()

      await expect(page.getByText('直前の質問を同じ内容で再送します')).toBeVisible()

      await expect(page.getByText('Next.js は React ベースのフレームワークです。')).toBeVisible({
        timeout: 5_000,
      })
      await expect(page.getByText('一時的に AI 応答の取得に失敗しました')).toHaveCount(0)
    })
  },
)
