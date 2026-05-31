import { expect, test } from '@playwright/test'
import {
  appendJourneyReport,
  loadPersona,
  mockLessonChatHistory,
  mockLessonChatStreaming,
  mockMentorSessionRoute,
  startJourneyRecorder,
} from './helpers/index'
import { mockSupabaseAuth } from './helpers/auth'

/**
 * TQ-124 — SP (mobile) planner / chat UI readability.
 *
 * Covers Owner directive #17 (example badges fade / sticky composer) and
 * directive #18 (streaming shows motion before any token arrives). All
 * assertions run at 375x812 to pin P-ENG-PROTOTYPE's mobile usage lane.
 */

const SP_VIEWPORT = { width: 375, height: 812 } as const

test.describe(
  'TQ-124-01..03 (PJ-ENG-03): SP planner/chat UI readability',
  { tag: ['@persona:P-ENG-PROTOTYPE', '@node:PJ-ENG-03', '@db:mock'] },
  () => {
    test.use({ viewport: SP_VIEWPORT })

    test.beforeEach(async ({ page }) => {
      await mockSupabaseAuth(page)
      // Empty chat history so the LessonAiChat harness starts with its
      // example badges visible.
      await page.route('**/api/lessons/*/chat/history', (route) =>
        mockLessonChatHistory(route, []),
      )
      // Streaming lesson chat with a 400ms pre-token delay so we have time to
      // sample the "thinking" indicator (TQ-124-03).
      await page.route('**/api/lessons/*/chat', (route) => mockLessonChatStreaming(route, 400))
      await page.route(
        '**/api/mentor/session**',
        mockMentorSessionRoute((route) => mockLessonChatStreaming(route, 400)),
      )
    })

    test('SP viewport で example badges fade / sticky input / streaming indicator が出る', async ({
      page,
    }) => {
      const persona = await loadPersona('P-ENG-PROTOTYPE')
      const journey = startJourneyRecorder(page, persona)

      // ── TQ-124-01: GoalSuggestions fade-out in onboarding wizard ──
      await page.goto('/plan/onboarding')

      // The suggestions DOM node stays mounted (for the CSS fade), so we
      // target it by aria-label directly instead of getByRole — the node sets
      // aria-hidden once faded, which removes it from the a11y tree.
      const suggestionsGroup = page.locator('[aria-label="ゴールの候補"]').first()
      await expect(suggestionsGroup).toBeVisible()
      await expect(suggestionsGroup).toHaveAttribute('data-state', 'visible')

      // Simulate "conversation started": once the user has typed a real goal
      // (>=6 chars) the chips must fade out via CSS transition, not a snap.
      await page.getByLabel('ゴール入力').fill('AIアプリのプロトタイプを2週間で作りたい')

      await expect(suggestionsGroup).toHaveAttribute('data-state', 'faded')
      const suggestionClasses = await suggestionsGroup.getAttribute('class')
      expect(suggestionClasses ?? '').toContain('transition-opacity')
      expect(suggestionClasses ?? '').toContain('opacity-0')
      // pointer-events-none ensures the faded chips don't steal taps.
      expect(suggestionClasses ?? '').toContain('pointer-events-none')
      await page.screenshot({
        path: 'test-results/tq-124/ac01-fade-sp.png',
        fullPage: false,
      })

      // ── TQ-124-02 / 03: LessonAiChat SP harness ──
      await page.goto('/dev/sp-chat')

      // Open the chat sheet.
      await page.getByRole('button', { name: 'レッスン内容について質問する' }).click()

      const chatForm = page.locator('form[data-sp-sticky="true"]')
      await expect(chatForm).toBeVisible()
      const formClasses = await chatForm.getAttribute('class')
      // SP viewport (<sm) must use sticky positioning so the composer hugs
      // the visible viewport bottom even as messages grow.
      expect(formClasses ?? '').toContain('sticky')
      expect(formClasses ?? '').toContain('bottom-0')

      // Scroll the chat into view so the sticky composer docks at the viewport
      // bottom (sticky only pins once the container edge meets the viewport).
      await chatForm.scrollIntoViewIfNeeded()
      await page.waitForTimeout(150)

      const chatBox = await chatForm.boundingBox()
      expect(chatBox).not.toBeNull()
      if (chatBox) {
        // The composer must live inside (or within a small fudge of) the
        // mobile viewport so it never drifts below the fold. Allow a 16px
        // tolerance to absorb safe-area padding and sub-pixel layout rounding.
        expect(chatBox.y + chatBox.height).toBeLessThanOrEqual(SP_VIEWPORT.height + 16)
      }
      await page.screenshot({
        path: 'test-results/tq-124/ac02-sticky-sp.png',
        fullPage: false,
      })

      // Send a question and sample the DOM before the first token arrives so
      // we can assert the "thinking" indicator is already there.
      await page.getByLabel('質問を入力').fill('Next.js とは何ですか？')
      await page.getByRole('button', { name: '質問を送信' }).click()

      const streamingIndicator = page.locator('[data-streaming-indicator="true"]').first()
      await expect(streamingIndicator).toBeVisible({ timeout: 2_000 })
      // Phase must be present so operators can tell connecting/receiving apart.
      await expect(streamingIndicator).toHaveAttribute('data-streaming-phase', /connecting|receiving/)
      await page.screenshot({
        path: 'test-results/tq-124/ac03-streaming-sp.png',
        fullPage: false,
      })

      // Once tokens arrive the indicator stays (now as "receiving" bubble).
      await expect(page.getByText('Next.js は React ベースのフレームワークです。')).toBeVisible({
        timeout: 5_000,
      })

      const report = await journey.finish()
      await appendJourneyReport(
        persona,
        test.info().titlePath.join(' > '),
        report,
        test.info().project.name,
      )
      expect(report.criteriaViolations).toHaveLength(0)
    })
  },
)
