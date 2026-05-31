'use client'

/**
 * BlockedClickTracker (TQ-120-02)
 *
 * Global document-level `click` listener that fires a `blocked` PostHog
 * event whenever the user clicks an element that is:
 *   - `<button disabled>` / `<a aria-disabled="true">`
 *   - any element with the `aria-disabled="true"` attribute
 *
 * We rely on event-capture (phase 1) so we observe the click even when an
 * inner component calls `stopPropagation()` — and we use `pointerdown`
 * for the iOS-friendly path and `click` as a fallback because some browsers
 * skip click dispatch on `disabled` buttons entirely.
 *
 * Properties sent to PostHog:
 *   - `target_testid`  : `data-testid` or empty string
 *   - `path`           : `window.location.pathname` at click time
 *   - `reason`         : `"disabled" | "aria-disabled"`
 *   - `tag`            : lowercased tag name (button / a / div / ...)
 *
 * PII posture: no text content, aria-label, inner HTML or outer markup is
 * forwarded — only the elements above, all of which are structural.
 */

import { useEffect } from 'react'
import {
  trackBlocked,
  trackEvidencePassedFromClient,
  trackPlanRevisedFromClient,
} from '@/lib/analytics/track-helpers'
import { identifyUser, resetUser } from '@/lib/analytics/client'

type BlockedReason = 'disabled' | 'aria-disabled'

interface BlockedHit {
  reason: BlockedReason
  target: Element
}

function findBlockedAncestor(start: EventTarget | null): BlockedHit | null {
  if (!(start instanceof Element)) return null

  // Walk up so that a click on an icon inside a disabled button still
  // attributes the event to the button.
  let node: Element | null = start
  for (let depth = 0; node && depth < 6; depth += 1, node = node.parentElement) {
    if (node.getAttribute('aria-disabled') === 'true') {
      return { reason: 'aria-disabled', target: node }
    }
    if (
      (node instanceof HTMLButtonElement ||
        node instanceof HTMLInputElement ||
        node instanceof HTMLSelectElement ||
        node instanceof HTMLTextAreaElement) &&
      node.disabled
    ) {
      return { reason: 'disabled', target: node }
    }
  }
  return null
}

function readTestid(element: Element): string {
  return (
    element.getAttribute('data-testid') ??
    element.closest('[data-testid]')?.getAttribute('data-testid') ??
    ''
  )
}

export function BlockedClickTracker() {
  useEffect(() => {
    // Test-only helper exposure: when Playwright has installed the capture
    // mirror (see apps/web/e2e/helpers/analytics-capture.ts), expose the
    // TQ-120 track helpers on window so tests can exercise the real
    // sanitised code path. In production the mirror is never installed so
    // the conditional is a dead branch.
    const w = window as unknown as {
      __SCHOOL_POSTHOG_CAPTURES__?: unknown[]
      __SCHOOL_TRACK__?: {
        evidencePassed: typeof trackEvidencePassedFromClient
        planRevised: typeof trackPlanRevisedFromClient
        identify: typeof identifyUser
        reset: typeof resetUser
      }
    }
    if (Array.isArray(w.__SCHOOL_POSTHOG_CAPTURES__) && !w.__SCHOOL_TRACK__) {
      w.__SCHOOL_TRACK__ = {
        evidencePassed: trackEvidencePassedFromClient,
        planRevised: trackPlanRevisedFromClient,
        // TQ-121: expose identify / reset so E2E can drive the real capture
        // path without spinning up Supabase auth.
        identify: identifyUser,
        reset: resetUser,
      }
    }

    const handler = (ev: Event) => {
      try {
        const hit = findBlockedAncestor(ev.target)
        if (!hit) return
        const testid = readTestid(hit.target)
        const path =
          typeof window !== 'undefined' ? window.location.pathname : '/'
        trackBlocked(testid, path, hit.reason, hit.target.tagName.toLowerCase())
      } catch {
        // Analytics must never break the app.
      }
    }

    // Use capture phase for both events so we observe the click even when
    // the inner widget calls stopPropagation().
    document.addEventListener('pointerdown', handler, { capture: true })
    document.addEventListener('click', handler, { capture: true })

    return () => {
      document.removeEventListener('pointerdown', handler, { capture: true })
      document.removeEventListener('click', handler, { capture: true })
    }
  }, [])

  return null
}
