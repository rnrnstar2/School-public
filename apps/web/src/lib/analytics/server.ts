import { sanitizeAnalyticsProperties } from './safe-properties'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

/**
 * Capture an analytics event server-side via PostHog HTTP API.
 * Fire-and-forget — never blocks the request.
 *
 * Properties are sanitised against the TQ-120 deny list before the payload
 * leaves the server so that free-text fields (goal, revision_summary, chat
 * body) never escape to PostHog even when a caller forgets to strip them.
 */
export function captureServerEvent(opts: {
  event: string
  distinctId: string
  properties?: Record<string, unknown>
}) {
  if (!POSTHOG_KEY) return

  const sanitisedProps = sanitizeAnalyticsProperties({
    ...opts.properties,
    $lib: 'server',
  })

  const payload = {
    api_key: POSTHOG_KEY,
    event: opts.event,
    distinct_id: opts.distinctId,
    properties: sanitisedProps,
    timestamp: new Date().toISOString(),
  }

  // Fire-and-forget fetch — do not await
  fetch(`${POSTHOG_HOST}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Analytics failures must never affect the app
  })
}
