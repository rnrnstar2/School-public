import { expect, test } from '@playwright/test'
import {
  getCapturedEvents,
  installAnalyticsCapture,
} from './helpers/analytics-capture'
import { setupWizardMocks } from './helpers'

/**
 * TQ-126 — /plan primary submit blocked-event regression guard.
 *
 * Closed-loop demo derived from TQ-122 generate-task-queue. The fixture-based
 * P1 candidate surfaced `testid=plan-submit / path=/plan / reason=disabled`
 * `blocked` events accumulating against the plan wizard's "次へ" button.
 * Before the fix, Step 1 disabled the button when the goal textarea was empty
 * and nothing told the user how to unblock it → the BlockedClickTracker
 * (TQ-120) captured one `blocked` event per frustrated click.
 *
 * After the fix, the button is always enabled; clicking with an empty goal
 * simply focuses the textarea and reveals the helper text. Therefore the
 * `blocked` event must NOT fire for `target_testid === 'plan-submit'`.
 */

async function stubPostHogIngest(page: import('@playwright/test').Page) {
  // Avoid any real PostHog network hit during CI — we only read the in-browser
  // capture mirror.
  await page.route('**/*i.posthog.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

test.describe(
  'TQ-126-01: /plan-submit disabled shows helper and no blocked event',
  { tag: ['@node:TQ-126-01', '@db:mock'] },
  () => {
    test('plan-submit click on empty goal focuses textarea, emits no blocked event, and shows helper text', async ({
      page,
    }) => {
      await installAnalyticsCapture(page)
      await stubPostHogIngest(page)
      await setupWizardMocks(page)

      await page.goto('/plan/onboarding')
      await page.waitForLoadState('domcontentloaded')

      // ── Assert plan-submit button is present and not disabled ──
      const planSubmit = page.locator('[data-testid="plan-submit"]')
      await expect(planSubmit).toBeVisible()
      // Must NOT be disabled — that was the TQ-126 regression.
      await expect(planSubmit).not.toBeDisabled()
      await expect(planSubmit).not.toHaveAttribute('aria-disabled', 'true')
      // aria-describedby must point to the helper so screen readers announce
      // the reason when the button is focused.
      await expect(planSubmit).toHaveAttribute(
        'aria-describedby',
        'plan-submit-helper',
      )

      // Helper text must exist in the DOM and be visible while empty.
      const helper = page.locator('#plan-submit-helper')
      await expect(helper).toBeVisible()
      await expect(helper).toHaveText(/ゴールを入力すると次へ進めます/)

      // ── Clicking with empty goal: focus returns to textarea, no blocked event ──
      await planSubmit.click()

      // Textarea should be focused after the click.
      await expect(page.getByLabel('ゴール入力')).toBeFocused()

      // Wait a tick so any (unexpected) blocked event would be captured.
      await page.waitForTimeout(150)

      const captured = await getCapturedEvents(page)
      const planSubmitBlocked = captured.filter(
        (c) =>
          c.event === 'blocked' &&
          c.properties.target_testid === 'plan-submit',
      )
      expect(planSubmitBlocked).toHaveLength(0)

      // ── Fill goal → helper fades (aria-hidden), button still enabled ──
      await page.getByLabel('ゴール入力').fill('ポートフォリオサイトを作りたい')
      await expect(helper).toHaveAttribute('aria-hidden', 'true')
      await expect(planSubmit).not.toBeDisabled()

      // ── Click advances to the hearing chat ──
      await planSubmit.click()
      await expect(page.getByTestId('hearing-messages')).toBeVisible()
      await expect(
        page.getByText('Web制作の経験はありますか？').first(),
      ).toBeVisible()

      // Still no plan-submit blocked events on the happy path.
      const afterAdvance = await getCapturedEvents(page)
      const planSubmitBlockedAfter = afterAdvance.filter(
        (c) =>
          c.event === 'blocked' &&
          c.properties.target_testid === 'plan-submit',
      )
      expect(planSubmitBlockedAfter).toHaveLength(0)
    })
  },
)
