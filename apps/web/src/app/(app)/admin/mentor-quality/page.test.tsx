import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MentorQualitySnapshot } from '@/lib/admin/mentor-metrics'

import AdminMentorQualityPage from './page'

const { requireAdminRouteUserMock, loadMentorQualitySnapshotMock } = vi.hoisted(() => ({
  requireAdminRouteUserMock: vi.fn(),
  loadMentorQualitySnapshotMock: vi.fn(),
}))

vi.mock('@/app/api/admin/atom-versions/_server', () => ({
  requireAdminRouteUser: requireAdminRouteUserMock,
}))

vi.mock('@/lib/admin/mentor-quality-loader', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/admin/mentor-quality-loader')>(
      '@/lib/admin/mentor-quality-loader',
    )
  return {
    ...actual,
    createSupabaseMentorQualityRepository: vi.fn(() => ({
      listRecentAgentRuns: vi.fn(),
      listRecentEvaluationRuns: vi.fn(),
    })),
    loadMentorQualitySnapshot: loadMentorQualitySnapshotMock,
  }
})

const SAMPLE_SNAPSHOT: MentorQualitySnapshot = {
  generatedAt: '2026-05-09T12:00:00.000Z',
  qualityTimeline: [
    {
      date: '2026-05-08',
      count: 3,
      ai_utilization: 0.7,
      non_eng_friendly: 0.6,
      shortest_path: 0.55,
      fit: 0.85,
    },
  ],
  costByMonth: [
    {
      month: '2026-05',
      totalCostUsd: 1.23,
      runs: 12,
      plans: 3,
      costPerPlanUsd: 0.41,
    },
  ],
  subAgentFailures: {
    total: 12,
    byStatus: {
      success: 9,
      failed: 1,
      timeout: 1,
      cancelled: 0,
      running: 1,
      other: 0,
    },
    failureRate: 2 / 12,
  },
  modelUsage: [
    { model: 'claude-opus-4-7', runs: 7, totalCostUsd: 0.83, avgLatencyMs: 1200 },
    { model: 'claude-sonnet-4-6', runs: 5, totalCostUsd: 0.4, avgLatencyMs: 600 },
  ],
  recentPlans: [
    {
      planId: 'plan-A',
      lastActivityAt: '2026-05-08T10:01:00.000Z',
      runs: 4,
      averageScore: 0.78,
      models: ['claude-opus-4-7'],
      totalCostUsd: 0.42,
    },
  ],
}

describe('admin mentor-quality page', () => {
  it('renders the snapshot for an admin user', async () => {
    requireAdminRouteUserMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.test',
    })
    loadMentorQualitySnapshotMock.mockResolvedValue(SAMPLE_SNAPSHOT)

    render(await AdminMentorQualityPage())

    expect(screen.getByText('Mentor Quality')).toBeInTheDocument()
    expect(screen.getByTestId('quality-timeline-row-2026-05-08')).toBeInTheDocument()
    expect(screen.getByTestId('cost-trend-2026-05')).toBeInTheDocument()
    expect(screen.getByTestId('sub-agent-failure-rate')).toHaveTextContent('16.7%')
    expect(screen.getByTestId('model-usage-row-claude-opus-4-7')).toBeInTheDocument()
    expect(screen.getByTestId('recent-plan-plan-A')).toBeInTheDocument()
  })

  it('shows the access guard for non-admin users', async () => {
    requireAdminRouteUserMock.mockResolvedValue(null)

    render(await AdminMentorQualityPage())

    expect(screen.getByText('Admin access required')).toBeInTheDocument()
    expect(screen.queryByTestId('quality-timeline-table')).not.toBeInTheDocument()
  })
})
