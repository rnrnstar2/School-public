import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
  setupCoreMocks,
  seedWorkspaceStorage,
  mockLessonChatHistory,
} from './helpers'
import { mockSupabaseAuth } from './helpers/auth'

/**
 * Accessibility (a11y) automated tests — axe-core WCAG 2.1 AA
 *
 * Scans 5 priority screens for critical/serious violations.
 * Part of TQ-54: CI自動アクセシビリティテスト+WCAG 2.1 AA継続検証
 */

/** Run axe-core and assert zero critical/serious violations */
async function expectNoA11yViolations(page: import('@playwright/test').Page) {
  // Wait for framer-motion entry animations to settle
  await page.waitForTimeout(1500)

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()

  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  )

  if (serious.length > 0) {
    const summary = serious
      .map(
        (v) =>
          `[${v.impact}] ${v.id}: ${v.description}\n  ${v.nodes.map((n) => n.html).join('\n  ')}`
      )
      .join('\n\n')
    expect(serious, `axe-core violations found:\n${summary}`).toHaveLength(0)
  }
}

async function expectVisibleButtonsToMeetTapTargets(
  root: import('@playwright/test').Locator,
  scopeLabel: string,
) {
  await root.page().waitForTimeout(600)
  const buttons = root.locator('button:visible')
  const count = await buttons.count()

  for (let index = 0; index < count; index += 1) {
    const button = buttons.nth(index)
    const box = await button.boundingBox()

    if (!box) {
      continue
    }

    const accessibleName = await button
      .evaluate((node) => {
        const ariaLabel = node.getAttribute('aria-label')?.trim()
        return ariaLabel || node.textContent?.trim() || ''
      })
      .catch(() => '')

    if (/Next\.js Dev Tools/i.test(accessibleName)) {
      continue
    }

    expect(
      box.width,
      `${scopeLabel}: ${accessibleName || `button-${index}`} width`,
    ).toBeGreaterThanOrEqual(44)
    expect(
      box.height,
      `${scopeLabel}: ${accessibleName || `button-${index}`} height`,
    ).toBeGreaterThanOrEqual(44)
  }
}

async function openLessonChat(page: Page) {
  const openButton = page.getByRole('button', { name: /レッスン内容について質問する/ }).first()
  const chatRegion = page.getByRole('region', { name: 'レッスン AI チャット' })

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
}

test.describe('Accessibility: WCAG 2.1 AA automated scan', () => {
  // Disable animations so axe-core scans fully-rendered colors (not mid-transition opacity)
  test.use({ reducedMotion: 'reduce' } as Parameters<typeof test.use>[0])

  test.beforeEach(async ({ page }) => {
    await setupCoreMocks(page)
  })

  test('Landing page (/) has no critical/serious a11y violations', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 })
    await expectNoA11yViolations(page)
  })

  test('Planner / Hearing page (/plan) has no critical/serious a11y violations', async ({
    page,
  }) => {
    await page.goto('/plan/onboarding')
    await expect(page.getByLabel('ゴール入力')).toBeVisible({ timeout: 10000 })
    await expectNoA11yViolations(page)
  })

  test('Mentor Workspace (/plan with workspace state) has no critical/serious a11y violations', async ({
    page,
  }) => {
    await mockSupabaseAuth(page)
    await page.goto('/plan')
    await seedWorkspaceStorage(page)
    await page.reload()
    const workspace = page.getByText('今やること').first()
    const isVisible = await workspace.isVisible({ timeout: 15000 }).catch(() => false)
    if (!isVisible) {
      await expect(page.locator('main').first()).toBeVisible({ timeout: 10000 })
    } else {
      await expect(workspace).toBeVisible()
    }
    await expectNoA11yViolations(page)
  })

  test('Lesson detail (/lessons/web-001) has no critical/serious a11y violations', async ({
    page,
  }) => {
    await page.goto('/lessons/web-001')
    const content = page.locator('main, [class*="min-h"]').first()
    await expect(content).toBeVisible({ timeout: 10000 })
    await expectNoA11yViolations(page)
  })

  test('Lessons browser (/lessons) has no critical/serious a11y violations', async ({ page }) => {
    test.setTimeout(60000)
    await page.goto('/lessons')
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10000 })
    await expectNoA11yViolations(page)
  })

  test.describe('Mobile tap targets stay >= 44x44', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('Planner / lesson chat controls keep mobile hit areas at 44x44', async ({ page }) => {
      test.slow()
      await page.route('**/api/lessons/*/chat/history', (route) =>
        mockLessonChatHistory(route, []),
      )

      await page.goto('/plan', { waitUntil: 'domcontentloaded' })
      await seedWorkspaceStorage(page)
      await page.reload()
      const planRoot = page.locator('main').first()
      const workspace = page.getByText('今やること').first()
      const workspaceVisible = await workspace.isVisible({ timeout: 15000 }).catch(() => false)
      if (!workspaceVisible) {
        await expect(planRoot).toBeVisible({ timeout: 10000 })
      } else {
        await expect(workspace).toBeVisible()
      }
      await expectVisibleButtonsToMeetTapTargets(planRoot, '/plan')

      await page.goto('/lessons/web-001', { waitUntil: 'domcontentloaded' })
      const lessonRoot = page.locator('main').first()
      await expect(lessonRoot).toBeVisible({ timeout: 10000 })
      await expectVisibleButtonsToMeetTapTargets(lessonRoot, '/lessons/web-001')

      await page.goto('/dev/sp-chat', { waitUntil: 'domcontentloaded' })
      await openLessonChat(page)
      const devChatRoot = page.locator('main').first()
      await expectVisibleButtonsToMeetTapTargets(devChatRoot, '/dev/sp-chat')
    })
  })
})
