import { expect, test } from '@playwright/test'

test.describe(
  'perf: /lessons SSR',
  { tag: ['@node:perf-lessons-ssr', '@db:real'] },
  () => {
    test.skip(process.env.CI_PERF !== '1', 'Set CI_PERF=1 to run warm SSR timing checks')
    test.setTimeout(15_000)

    test('header visible within 500ms and grid card visible within 3000ms', async ({ page }) => {
      await page.goto('/lessons', { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () => document.querySelector('[data-atom-card]'),
        undefined,
        { timeout: 10_000 },
      )
      await page.goto('about:blank')

      const navStart = Date.now()
      await page.goto('/lessons', { waitUntil: 'commit' })

      await page.waitForFunction(
        () => {
          const heading = document.querySelector('h1')
          return Boolean(
            heading &&
              heading.textContent?.includes('レッスン一覧') &&
              getComputedStyle(heading).visibility !== 'hidden',
          )
        },
        undefined,
        { timeout: 500 },
      )
      const headerAt = Date.now() - navStart

      await page.waitForFunction(
        () => document.querySelector('[data-atom-card]'),
        undefined,
        { timeout: 3000 },
      )
      const gridAt = Date.now() - navStart

      expect(headerAt).toBeLessThan(500)
      expect(gridAt).toBeLessThan(3000)
    })
  },
)
