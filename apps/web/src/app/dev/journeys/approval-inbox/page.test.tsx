import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  OwnerAppMetadataRoleRequiredErrorMock,
  approvalInboxClientMock,
  createClientMock,
  notFoundMock,
  requireOwnerRouteUserMock,
} = vi.hoisted(() => ({
  OwnerAppMetadataRoleRequiredErrorMock: class OwnerAppMetadataRoleRequiredErrorMock extends Error {},
  approvalInboxClientMock: vi.fn(),
  createClientMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  requireOwnerRouteUserMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
}))

vi.mock('@/app/api/admin/atom-versions/_server', () => ({
  OwnerAppMetadataRoleRequiredError: OwnerAppMetadataRoleRequiredErrorMock,
  requireOwnerRouteUser: requireOwnerRouteUserMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

vi.mock('./ApprovalInboxClient', () => ({
  ApprovalInboxClient: approvalInboxClientMock,
}))

import ApprovalInboxPage from './page'

function createApprovalInboxQueryMock({
  data,
  error = null,
}: {
  data: Record<string, unknown>[] | null
  error?: { message: string } | null
}) {
  const orderMock = vi.fn().mockResolvedValue({ data, error })
  const selectMock = vi.fn(() => ({
    order: orderMock,
  }))
  const fromMock = vi.fn(() => ({
    select: selectMock,
  }))
  const schemaMock = vi.fn(() => ({
    from: fromMock,
  }))

  createClientMock.mockResolvedValue({
    schema: schemaMock,
  })

  return {
    fromMock,
    orderMock,
    schemaMock,
    selectMock,
  }
}

describe('ApprovalInboxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    approvalInboxClientMock.mockImplementation(
      ({ items }: { items: unknown[] }) => (
        <div data-testid="approval-inbox-client">{JSON.stringify(items)}</div>
      ),
    )
  })

  it('shows the owner guard when the current user is not an owner', async () => {
    requireOwnerRouteUserMock.mockResolvedValue(null)

    render(await ApprovalInboxPage())

    expect(requireOwnerRouteUserMock).toHaveBeenCalledWith({
      requireAppMetadataRole: true,
    })
    expect(screen.getByText('owner 権限が必要です')).toBeInTheDocument()
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('shows an explicit configuration error when the user is owner-only in user_metadata', async () => {
    requireOwnerRouteUserMock.mockRejectedValue(
      new OwnerAppMetadataRoleRequiredErrorMock(),
    )

    render(await ApprovalInboxPage())

    expect(screen.getByText('approval inbox を表示できません')).toBeInTheDocument()
    expect(
      screen.getByText(
        'RLS app_metadata 要件を満たしていないため inbox を表示できません。owner の場合は管理者に連絡してください。',
      ),
    ).toBeInTheDocument()
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('loads pending items from the owner inbox view via the SSR client', async () => {
    requireOwnerRouteUserMock.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.test',
    })

    const query = createApprovalInboxQueryMock({
      data: [
        {
          gate_id: 'gate-1',
          requested_at: '2026-04-18T01:02:03.000Z',
          proposal_id: 'proposal-1',
          capability_slug: 'measure',
          outcome_slug: 'improve',
          priority: 'high',
          weakest_axis: 'evidence',
          rationale: 'Need a better measurement lesson',
          candidate_lesson_slug: 'lesson-measure',
          gap_ids: ['gap-1', 'gap-2'],
        },
        {
          gate_id: 'gate-2',
          requested_at: '2026-04-18T00:00:00.000Z',
          proposal_id: null,
          gate_metadata: {
            lesson_dev_proposal_id: 'proposal-2',
          },
          capability_slug: null,
          outcome_slug: null,
          priority: null,
          weakest_axis: null,
          rationale: null,
          candidate_lesson_slug: null,
          gap_ids: null,
        },
      ],
    })

    render(await ApprovalInboxPage())

    expect(requireOwnerRouteUserMock).toHaveBeenCalledWith({
      requireAppMetadataRole: true,
    })
    expect(query.schemaMock).toHaveBeenCalledWith('decision_ledger')
    expect(query.fromMock).toHaveBeenCalledWith('v_owner_pending_lesson_proposals')
    expect(query.selectMock).toHaveBeenCalledWith('*')
    expect(query.orderMock).toHaveBeenCalledWith('requested_at', {
      ascending: false,
    })

    const items = approvalInboxClientMock.mock.calls[0]?.[0]?.items as Array<{
      gateId: string
      proposalId: string
      gapIds: string[]
    }>
    expect(items).toEqual([
      expect.objectContaining({
        gateId: 'gate-1',
        proposalId: 'proposal-1',
        gapIds: ['gap-1', 'gap-2'],
      }),
      expect.objectContaining({
        gateId: 'gate-2',
        proposalId: 'proposal-2',
        gapIds: [],
      }),
    ])
  })
})
