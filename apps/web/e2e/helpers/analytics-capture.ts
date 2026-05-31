import type { Page } from '@playwright/test'

/**
 * Browser-side shape maintained by the `apps/web/src/lib/analytics/client.ts`
 * test hook. Each `trackEvent` call appends one entry.
 */
export interface CapturedAnalyticsEvent {
  event: string
  properties: Record<string, unknown>
}

/**
 * Install a window-level array (`__SCHOOL_POSTHOG_CAPTURES__`) so that every
 * PostHog capture made on the page during the test is mirrored into a JS
 * array we can read with `getCapturedEvents(page)`.
 *
 * Must be called BEFORE `page.goto(...)` so `addInitScript` runs on load.
 */
export async function installAnalyticsCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // Initialise the array only once per document.
    const w = window as unknown as {
      __SCHOOL_POSTHOG_CAPTURES__?: unknown[]
    }
    if (!Array.isArray(w.__SCHOOL_POSTHOG_CAPTURES__)) {
      w.__SCHOOL_POSTHOG_CAPTURES__ = []
    }
  })
}

/** Read the captured events from the page. */
export async function getCapturedEvents(
  page: Page,
): Promise<CapturedAnalyticsEvent[]> {
  const events = await page.evaluate(() => {
    const w = window as unknown as {
      __SCHOOL_POSTHOG_CAPTURES__?: CapturedAnalyticsEvent[]
    }
    return Array.isArray(w.__SCHOOL_POSTHOG_CAPTURES__)
      ? [...w.__SCHOOL_POSTHOG_CAPTURES__]
      : []
  })
  return events
}

/** Find every capture with the given event name. */
export async function findCaptured(
  page: Page,
  eventName: string,
): Promise<CapturedAnalyticsEvent[]> {
  const all = await getCapturedEvents(page)
  return all.filter((capture) => capture.event === eventName)
}

/** Clear the captured buffer (between phases of a test). */
export async function resetCapturedEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __SCHOOL_POSTHOG_CAPTURES__?: unknown[] }
    if (Array.isArray(w.__SCHOOL_POSTHOG_CAPTURES__)) {
      w.__SCHOOL_POSTHOG_CAPTURES__.length = 0
    }
  })
}
