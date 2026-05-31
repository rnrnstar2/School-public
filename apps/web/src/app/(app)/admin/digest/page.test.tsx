import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { NightlyDigestSnapshot } from '@/lib/scheduler/types'

import AdminDigestPage from './page'

const { requireOwnerRouteUserMock } = vi.hoisted(() => ({
  requireOwnerRouteUserMock: vi.fn(),
}))

const snapshot: NightlyDigestSnapshot = {
  digests: Array.from({ length: 7 }, (_, index) => ({
    digestId: `digest-${index + 1}`,
    runDate: `2026-04-${String(index + 11).padStart(2, '0')}`,
    status: index === 6 ? 'completed_with_failures' : 'completed',
    startedAt: `2026-04-${String(index + 11).padStart(2, '0')}T02:00:00.000Z`,
    finishedAt: `2026-04-${String(index + 11).padStart(2, '0')}T02:10:00.000Z`,
    newGapCount: index + 1,
    newProposalCount: index + 2,
    judgeScoreHistogram: { '8-10': index + 1 },
    pendingOwnerReviewCount: index === 6 ? 2 : 0,
    failedStages: index === 6 ? ['judge_run'] : [],
    summary: `Digest summary ${index + 1}`,
    pendingApprovalsHref: '/admin/scheduler#pending-approvals',
  })),
}

vi.mock('@/app/api/admin/atom-versions/_server', () => ({
  requireOwnerRouteUser: requireOwnerRouteUserMock,
}))

vi.mock('@/lib/scheduler/digest', () => ({
  createServerNightlyDigestPageRepository: vi.fn(async () => ({
    listRecentDigests: vi.fn(),
  })),
  loadNightlyDigestSnapshot: vi.fn(async () => snapshot),
}))

describe('admin digest page', () => {
  it('renders the last seven digests for an owner user and links each row to pending approvals', async () => {
    requireOwnerRouteUserMock.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.test',
    })

    render(await AdminDigestPage())

    expect(screen.getByText('Nightly flywheel digest')).toBeInTheDocument()
    expect(screen.getAllByTestId(/nightly-digest-digest-/)).toHaveLength(7)
    expect(screen.getByText('2026-04-11')).toBeInTheDocument()
    expect(screen.getByText('2026-04-17')).toBeInTheDocument()

    const links = screen.getAllByRole('link', { name: /Pending approvals/ })
    expect(links).toHaveLength(7)
    expect(links[0]).toHaveAttribute('href', '/admin/scheduler#pending-approvals')
    expect(screen.getByText('judge_run')).toBeInTheDocument()
  })

  it('shows the owner access guard when the current user is not an owner', async () => {
    requireOwnerRouteUserMock.mockResolvedValue(null)

    render(await AdminDigestPage())

    expect(screen.getByText('Owner access required')).toBeInTheDocument()
    expect(screen.queryByTestId('nightly-digest-list')).not.toBeInTheDocument()
  })
})
