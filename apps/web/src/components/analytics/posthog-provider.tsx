'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initPostHog, posthog } from '@/lib/analytics/posthog'

function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    initPostHog()
  }, [])

  // Track page views on route change
  useEffect(() => {
    if (!pathname) return
    const url = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname

    posthog.capture('$pageview', { $current_url: url })
  }, [pathname, searchParams])

  return null
}

/**
 * Initializes PostHog and tracks page views on route changes.
 * Mount once in the root layout. Wrapped in Suspense for SSG compatibility.
 */
export function PostHogProvider() {
  return (
    <Suspense fallback={null}>
      <PostHogPageView />
    </Suspense>
  )
}
