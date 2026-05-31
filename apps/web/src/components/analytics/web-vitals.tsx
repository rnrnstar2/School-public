'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { trackWebVital } from '@/lib/analytics/events'

/**
 * Reports Core Web Vitals (CLS, FID, FCP, LCP, TTFB) to the console
 * in development, to /api/vitals in production, and to PostHog.
 *
 * Mount this component once in the root layout.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    // Log in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(1)}`)
    }

    // Send to PostHog for unified dashboard
    trackWebVital(metric.name, metric.value, metric.rating)

    // In production, send to analytics endpoint (beacon API for reliability)
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(
        '/api/vitals',
        JSON.stringify({
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          id: metric.id,
          navigationType: metric.navigationType,
        }),
      )
    }
  })

  return null
}
