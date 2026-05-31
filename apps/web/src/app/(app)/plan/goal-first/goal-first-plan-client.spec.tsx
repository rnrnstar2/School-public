import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GoalFirstPlanClient } from './goal-first-plan-client'

const mocks = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  clearWorkspaceSnapshotMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.pushMock,
    refresh: mocks.refreshMock,
  }),
}))

vi.mock('@/components/plan/compiled-plan-page', () => ({
  CompiledPlanPage: () => <div data-testid="compiled-plan-page" />,
}))

vi.mock('@/hooks/use-refresh-on-visible', () => ({
  useRefreshOnVisible: vi.fn(),
}))

vi.mock('@/lib/planner/workspace-session', () => ({
  clearWorkspaceSnapshot: mocks.clearWorkspaceSnapshotMock,
  PLANNER_GOAL_STORAGE_KEY: 'school:planner-goal-v1',
}))

const plan = {
  goal: 'AIでポートフォリオを作りたい',
  goalTags: [],
  steps: [],
  milestones: [],
  coverageScore: 1,
  unsupportedCapabilities: [],
  rationale: 'test',
  source: 'topo' as const,
}

describe('GoalFirstPlanClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mocks.pushMock.mockReset()
    mocks.refreshMock.mockReset()
    mocks.clearWorkspaceSnapshotMock.mockReset()
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('clears prior mentor state before restarting onboarding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    window.localStorage.setItem('school:planner-goal-v1', 'AIでポートフォリオを作りたい')
    window.sessionStorage.setItem('school:preview:plan', '{"old":true}')

    render(
      <GoalFirstPlanClient
        goalSummary="AIでポートフォリオを作りたい"
        plan={plan}
        nextAction={null}
        completedNodeIds={[]}
      />,
    )

    fireEvent.click(screen.getByTestId('plan-restart-cta'))

    await waitFor(() => {
      expect(mocks.pushMock).toHaveBeenCalledWith('/plan/onboarding?restart=1')
    })

    expect(mocks.clearWorkspaceSnapshotMock).toHaveBeenCalledWith('AIでポートフォリオを作りたい')
    expect(window.localStorage.getItem('school:planner-goal-v1')).toBeNull()
    expect(window.sessionStorage.getItem('school:preview:plan')).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/mentor/session?goal=AI%E3%81%A7%E3%83%9D%E3%83%BC%E3%83%88%E3%83%95%E3%82%A9%E3%83%AA%E3%82%AA%E3%82%92%E4%BD%9C%E3%82%8A%E3%81%9F%E3%81%84',
      { method: 'DELETE' },
    )
  })

  // W16-C: BudgetCapBanner is propagated from PlanTweakInput via a custom
  // window event. Validate banner visibility flips with the listener.
  it('does not render the BudgetCapBanner before any cap event is dispatched', () => {
    render(
      <GoalFirstPlanClient
        goalSummary="AIでポートフォリオを作りたい"
        plan={plan}
        nextAction={null}
        completedNodeIds={[]}
      />,
    )

    expect(screen.queryByTestId('mentor-budget-cap-banner')).not.toBeInTheDocument()
  })

  it('renders the BudgetCapBanner when a mentor-budget-cap-exceeded window event fires', async () => {
    render(
      <GoalFirstPlanClient
        goalSummary="AIでポートフォリオを作りたい"
        plan={plan}
        nextAction={null}
        completedNodeIds={[]}
      />,
    )

    expect(screen.queryByTestId('mentor-budget-cap-banner')).not.toBeInTheDocument()

    window.dispatchEvent(
      new CustomEvent('mentor-budget-cap-exceeded', {
        detail: {
          kind: 'budget_cap',
          userId: 'user-1',
          usedUsd: 4.83,
          capUsd: 5,
          projectedUsd: 5.08,
          resetAtIso: '2026-06-01T00:00:00.000Z',
          message: '今月のメンター利用上限に達しました。',
        },
      }),
    )

    await waitFor(() => {
      expect(screen.getByTestId('mentor-budget-cap-banner')).toBeInTheDocument()
    })
    expect(screen.getByTestId('cap-cap')).toHaveTextContent('$5.00')
    expect(screen.getByTestId('cap-used')).toHaveTextContent('$4.83')
  })

  // TQ-250 (Auditor C9 / C11): the mentor-action-executed listener must
  // ignore unknown event types and only refresh on the explicit whitelist.
  it('ignores mentor-action-executed events outside the whitelist', () => {
    render(
      <GoalFirstPlanClient
        goalSummary="AIでポートフォリオを作りたい"
        plan={plan}
        nextAction={null}
        completedNodeIds={[]}
      />,
    )

    mocks.refreshMock.mockClear()

    window.dispatchEvent(
      new CustomEvent('mentor-action-executed', {
        detail: { action: { type: 'inject_evil' } },
      }),
    )
    expect(mocks.refreshMock).not.toHaveBeenCalled()

    // missing detail also drops silently
    window.dispatchEvent(new CustomEvent('mentor-action-executed', { detail: undefined }))
    expect(mocks.refreshMock).not.toHaveBeenCalled()

    // whitelisted event triggers refresh
    window.dispatchEvent(
      new CustomEvent('mentor-action-executed', {
        detail: { action: { type: 'switch_tool' } },
      }),
    )
    expect(mocks.refreshMock).toHaveBeenCalledTimes(1)
  })
})
