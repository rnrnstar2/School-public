import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@school/ui/theme-provider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('@/components/analytics/posthog-provider', () => ({
  PostHogProvider: () => <div data-testid="posthog-provider" />,
}))

vi.mock('@/components/analytics/analytics-identify', () => ({
  AnalyticsIdentify: () => <div data-testid="analytics-identify" />,
}))

vi.mock('@/components/analytics/web-vitals', () => ({
  WebVitals: () => <div data-testid="web-vitals" />,
}))

describe('RootLayout', () => {
  it('mounts AnalyticsIdentify at the root layout level', async () => {
    const RootLayout = (await import('./layout')).default
    const element = RootLayout({
      children: <div data-testid="child" />,
    }) as ReactElement

    render(element)

    expect(screen.getByTestId('analytics-identify')).toBeInTheDocument()
    expect(screen.getByTestId('posthog-provider')).toBeInTheDocument()
    expect(screen.getByTestId('web-vitals')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  }, 15000)
})
