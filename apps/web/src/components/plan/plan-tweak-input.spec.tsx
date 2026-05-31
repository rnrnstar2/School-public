/**
 * PlanTweakInput — W16-C BudgetCapBanner wiring spec.
 *
 * `/api/mentor/session` SSE が `event: error` で `mentor_budget_cap_exceeded`
 * を返したとき、BudgetCapBanner を render し、parent client のために
 * `mentor-budget-cap-exceeded` window event を dispatch することを保証する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@/components/chat/mentor-action-card', () => ({
  MentorActionCard: () => <div data-testid="mentor-action-card" />,
}))

vi.mock('@school/ui/markdown-renderer', () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}))

import { PlanTweakInput } from './plan-tweak-input'

function createSseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

describe('PlanTweakInput — BudgetCapBanner wiring (W16-C)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render the BudgetCapBanner before any cap event arrives', () => {
    render(<PlanTweakInput goalSummary="AIでポートフォリオを作りたい" />)
    expect(screen.queryByTestId('mentor-budget-cap-banner')).not.toBeInTheDocument()
  })

  it('renders the BudgetCapBanner and dispatches a window event when SSE returns budget_cap', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createSseResponse([
          {
            event: 'error',
            data: {
              error: 'mentor_budget_cap_exceeded',
              message: '今月のメンター利用上限に達しました。',
              cap: {
                userId: 'user-1',
                currentUsd: 4.5,
                capUsd: 5,
                estimateUsd: 0.5,
              },
            },
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const propagatedEvents: CustomEvent[] = []
    const propagationListener = ((event: Event) => {
      propagatedEvents.push(event as CustomEvent)
    }) as EventListener
    window.addEventListener('mentor-budget-cap-exceeded', propagationListener)

    try {
      const user = userEvent.setup()
      render(<PlanTweakInput goalSummary="AIでポートフォリオを作りたい" />)

      fireEvent.change(screen.getByTestId('plan-tweak-textarea'), {
        target: { value: 'もう一度説明してほしい' },
      })
      await user.click(screen.getByTestId('plan-tweak-submit'))

      await waitFor(() => {
        expect(screen.getByTestId('mentor-budget-cap-banner')).toBeInTheDocument()
      })
      expect(screen.getByTestId('cap-cap')).toHaveTextContent('$5.00')
      expect(screen.getByTestId('cap-used')).toHaveTextContent('$4.50')

      // parent client (e.g. GoalFirstPlanClient) が拾えるよう window event が出る
      expect(propagatedEvents.length).toBeGreaterThan(0)
      expect(propagatedEvents[0].detail).toMatchObject({
        kind: 'budget_cap',
        capUsd: 5,
        usedUsd: 4.5,
      })
    } finally {
      window.removeEventListener('mentor-budget-cap-exceeded', propagationListener)
    }
  })
})
