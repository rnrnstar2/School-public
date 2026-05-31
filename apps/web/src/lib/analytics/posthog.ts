import posthog from 'posthog-js'

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

let initialized = false

/**
 * Initialize PostHog client-side SDK.
 * Safe to call multiple times — only initializes once.
 */
export function initPostHog() {
  if (initialized || typeof window === 'undefined' || !POSTHOG_KEY) return

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Capture page views automatically via Next.js router events
    capture_pageview: false, // We handle manually via PostHogPageView
    capture_pageleave: true,
    // Session recording (opt-in via PostHog dashboard)
    disable_session_recording: true,
    // Respect Do-Not-Track
    respect_dnt: true,
    // Persistence for returning user identification
    persistence: 'localStorage+cookie',
    // Reduce network overhead in development
    ...(process.env.NODE_ENV === 'development' && { disable_compression: true }),
  })

  initialized = true
}

export { posthog }
