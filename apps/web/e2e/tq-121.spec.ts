import { expect, test } from '@playwright/test'
import {
  getCapturedEvents,
  installAnalyticsCapture,
  resetCapturedEvents,
} from './helpers/analytics-capture'

/**
 * TQ-121 — PostHog identify / reset on Supabase auth transitions.
 *
 * The production path is:
 *   Supabase `onAuthStateChange`
 *     → `useAnalyticsIdentify`
 *       → `identifyUser(userId)` / `resetUser()`
 *         → `posthog.identify(userId)` / `posthog.reset()`
 *
 * We drive the bottom half directly via the `__SCHOOL_TRACK__` window shim
 * installed by `BlockedClickTracker` in E2E mode, so that:
 *   1. The real `identifyUser` / `resetUser` code is executed (not a mock).
 *   2. The tests don't depend on a running Supabase stack.
 *
 * PostHog ingest is stubbed; the in-browser `__SCHOOL_POSTHOG_CAPTURES__`
 * mirror is used for assertions (no `NEXT_PUBLIC_POSTHOG_KEY` required).
 */

async function stubPostHogIngest(page: import('@playwright/test').Page) {
  await page.route('**/*i.posthog.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  )
}

test.describe(
  'TQ-121-01: identifyUser fires on SIGNED_IN / reset on SIGNED_OUT',
  { tag: ['@node:TQ-121-01', '@db:mock'] },
  () => {
    test('identifies once per user with user_id only, resets on signout', async ({
      page,
    }) => {
      await installAnalyticsCapture(page)
      await stubPostHogIngest(page)

      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')

      // Wait for BlockedClickTracker to register the __SCHOOL_TRACK__ shim
      // with identify / reset exposed.
      await page.waitForFunction(
        () => {
          const w = window as unknown as {
            __SCHOOL_TRACK__?: { identify?: unknown; reset?: unknown }
          }
          return (
            !!w.__SCHOOL_TRACK__ &&
            typeof w.__SCHOOL_TRACK__.identify === 'function' &&
            typeof w.__SCHOOL_TRACK__.reset === 'function'
          )
        },
        { timeout: 5_000 },
      )

      // Start from a clean capture buffer: the page may have fired other
      // analytics events on mount (pageview, etc.).
      await resetCapturedEvents(page)

      // Simulate Supabase `SIGNED_IN` → identifyUser('user-tq121-e2e')
      await page.evaluate(() => {
        const w = window as unknown as {
          __SCHOOL_TRACK__: { identify: (id: string) => void }
        }
        w.__SCHOOL_TRACK__.identify('user-tq121-e2e')
      })

      // Simulate Supabase `TOKEN_REFRESHED` with the same user — should NOT
      // produce a second $identify (dedupe).
      await page.evaluate(() => {
        const w = window as unknown as {
          __SCHOOL_TRACK__: { identify: (id: string) => void }
        }
        w.__SCHOOL_TRACK__.identify('user-tq121-e2e')
      })

      let captured = await getCapturedEvents(page)
      const identifyEvents = captured.filter((c) => c.event === '$identify')
      expect(identifyEvents.length).toBe(1)

      // PII guard: identify payload must contain `user_id` only.
      const [entry] = identifyEvents
      expect(entry.properties).toEqual({ user_id: 'user-tq121-e2e' })
      expect(entry.properties).not.toHaveProperty('email')
      expect(entry.properties).not.toHaveProperty('display_name')
      expect(entry.properties).not.toHaveProperty('full_name')
      expect(entry.properties).not.toHaveProperty('goal')
      expect(entry.properties).not.toHaveProperty('created_at')

      // Simulate Supabase `SIGNED_OUT` → resetUser()
      await page.evaluate(() => {
        const w = window as unknown as {
          __SCHOOL_TRACK__: { reset: () => void }
        }
        w.__SCHOOL_TRACK__.reset()
      })

      captured = await getCapturedEvents(page)
      const resetEvents = captured.filter((c) => c.event === '$reset')
      expect(resetEvents.length).toBe(1)
      expect(resetEvents[0].properties).toEqual({})

      // After a reset, a subsequent identify of the same userId must fire
      // again — the dedupe cache was cleared by the reset.
      await page.evaluate(() => {
        const w = window as unknown as {
          __SCHOOL_TRACK__: { identify: (id: string) => void }
        }
        w.__SCHOOL_TRACK__.identify('user-tq121-e2e')
      })

      captured = await getCapturedEvents(page)
      const identifyAfterReset = captured.filter(
        (c) => c.event === '$identify',
      )
      expect(identifyAfterReset.length).toBe(2)
    })
  },
)
