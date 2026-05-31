/**
 * HearingOnboardingClient — W16-C BudgetCapBanner wiring spec.
 *
 * `/api/mentor/session` SSE が `event: error` で `mentor_budget_cap_exceeded`
 * を返したとき、BudgetCapBanner を render することを保証する。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.pushMock,
    replace: mocks.replaceMock,
    refresh: mocks.refreshMock,
  }),
}))

vi.mock('@/components/onboarding', () => ({
  GoalSuggestions: () => null,
}))

vi.mock('@/components/onboarding/hearing-chat-thread', () => ({
  HearingChatThread: () => <div data-testid="hearing-chat-thread" />,
}))

vi.mock('@/components/onboarding/hearing-confirm-step', () => ({
  HearingConfirmStep: () => <div data-testid="hearing-confirm-step" />,
}))

vi.mock('@/components/mentor/SubAgentProgressPanel', () => ({
  SubAgentProgressPanel: () => null,
}))

import { HearingOnboardingClient } from './hearing-onboarding-client'

function createSseResponse(events: Array<{ event: string; data: unknown }>) {
  const body = events
    .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    .join('')

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  })
}

describe('HearingOnboardingClient — BudgetCapBanner wiring (W16-C)', () => {
  beforeEach(() => {
    mocks.pushMock.mockReset()
    mocks.replaceMock.mockReset()
    mocks.refreshMock.mockReset()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not render the BudgetCapBanner before any cap event arrives', () => {
    render(<HearingOnboardingClient />)
    expect(screen.queryByTestId('mentor-budget-cap-banner')).not.toBeInTheDocument()
  })

  it('renders the BudgetCapBanner when the SSE error is mentor_budget_cap_exceeded', async () => {
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
                currentUsd: 4.83,
                capUsd: 5,
                estimateUsd: 0.25,
              },
            },
          },
        ]),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(<HearingOnboardingClient />)

    // 1. ゴールを入力 → handleGoalSubmit (advanceHearing 起動)
    fireEvent.change(screen.getByLabelText('ゴール入力'), {
      target: { value: 'AIでポートフォリオを作りたい' },
    })
    fireEvent.click(screen.getByTestId('plan-submit'))

    // 2. SSE error 受信後に banner が出る
    await waitFor(() => {
      expect(screen.getByTestId('mentor-budget-cap-banner')).toBeInTheDocument()
    })
    expect(screen.getByTestId('cap-cap')).toHaveTextContent('$5.00')
    expect(screen.getByTestId('cap-used')).toHaveTextContent('$4.83')
  })
})
