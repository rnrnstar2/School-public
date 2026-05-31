import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  createClientMock,
  revalidatePathMock,
  requireOwnerRouteUserMock,
  runLessonProposalBridgeMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  requireOwnerRouteUserMock: vi.fn(),
  runLessonProposalBridgeMock: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}))

vi.mock('@/app/api/admin/atom-versions/_server', () => ({
  requireOwnerRouteUser: requireOwnerRouteUserMock,
}))

vi.mock('@/lib/goal-action/bridge-runner', () => ({
  runLessonProposalBridge: runLessonProposalBridgeMock,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: createClientMock,
}))

import {
  reviewLessonProposalGateAction,
  type ReviewLessonProposalGateInput,
} from './actions'

function mockRpcResult({
  rpcData = {
    id: 'gate-1',
    metadata: {
      lesson_dev_proposal_id: '22222222-2222-4222-8222-222222222222',
    },
  },
  rpcError = null,
  gateMetadataData = {
    metadata: {
      lesson_dev_proposal_id: '22222222-2222-4222-8222-222222222222',
    },
  },
  gateMetadataError = null,
}: {
  rpcData?: Record<string, unknown> | null
  rpcError?: { message: string } | null
  gateMetadataData?: Record<string, unknown> | null
  gateMetadataError?: { message: string } | null
}) {
  const rpcMock = vi.fn().mockResolvedValue({ data: rpcData, error: rpcError })
  const singleMock = vi.fn().mockResolvedValue({
    data: gateMetadataData,
    error: gateMetadataError,
  })
  const eqMock = vi.fn(() => ({
    single: singleMock,
  }))
  const selectMock = vi.fn(() => ({
    eq: eqMock,
  }))
  const fromMock = vi.fn(() => ({
    select: selectMock,
  }))
  const schemaMock = vi.fn(() => ({
    rpc: rpcMock,
    from: fromMock,
  }))

  createClientMock.mockResolvedValue({
    schema: schemaMock,
  })

  return {
    eqMock,
    fromMock,
    rpcMock,
    schemaMock,
    selectMock,
    singleMock,
  }
}

describe('reviewLessonProposalGateAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireOwnerRouteUserMock.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.test',
    })
    runLessonProposalBridgeMock.mockResolvedValue({
      status: 'success',
    })
  })

  it('rejects non-owner access before calling Supabase', async () => {
    requireOwnerRouteUserMock.mockResolvedValue(null)

    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '22222222-2222-4222-8222-222222222222',
      decision: 'approved',
    })

    expect(result).toEqual({
      ok: false,
      message: 'owner 権限が必要です。',
    })
    expect(createClientMock).not.toHaveBeenCalled()
  })

  it('calls the decide_lesson_proposal RPC for approvals and keeps bridge behavior', async () => {
    const rpc = mockRpcResult({})

    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '99999999-9999-4999-8999-999999999999',
      decision: 'approved',
    })

    expect(rpc.schemaMock).toHaveBeenCalledWith('decision_ledger')
    expect(rpc.rpcMock).toHaveBeenCalledWith('decide_lesson_proposal', {
      p_gate_id: '11111111-1111-4111-8111-111111111111',
      p_decision: 'approved',
    })
    expect(runLessonProposalBridgeMock).toHaveBeenCalledWith(
      '22222222-2222-4222-8222-222222222222',
    )
    expect(rpc.fromMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, '/dev/journeys')
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      2,
      '/dev/journeys/approval-inbox',
    )
    expect(result).toEqual({
      ok: true,
      message: '承認しました。lesson-factory bridge を eval まで進めました。',
    })
  })

  it('routes rejections through reject_lesson_proposal and skips follow-up reads', async () => {
    const rpc = mockRpcResult({
      rpcData: {
        id: 'gate-1',
      },
    })

    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '99999999-9999-4999-8999-999999999999',
      decision: 'rejected',
      reason: 'Not needed anymore',
    })

    expect(rpc.rpcMock).toHaveBeenCalledWith('reject_lesson_proposal', {
      p_gate_id: '11111111-1111-4111-8111-111111111111',
      p_reason: 'Not needed anymore',
    })
    expect(rpc.fromMock).not.toHaveBeenCalled()
    expect(runLessonProposalBridgeMock).not.toHaveBeenCalled()
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, '/dev/journeys')
    expect(revalidatePathMock).toHaveBeenNthCalledWith(
      2,
      '/dev/journeys/approval-inbox',
    )
    expect(result).toEqual({
      ok: true,
      message: '却下しました。',
    })
  })

  it('re-binds bridge execution to the RPC-approved proposal when the client proposalId is mismatched', async () => {
    const rpc = mockRpcResult({
      rpcData: {
        id: 'gate-1',
        metadata: {
          lesson_dev_proposal_id: '88888888-8888-4888-8888-888888888888',
        },
      },
    })

    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '99999999-9999-4999-8999-999999999999',
      decision: 'approved',
    })

    expect(runLessonProposalBridgeMock).toHaveBeenCalledWith(
      '88888888-8888-4888-8888-888888888888',
    )
    expect(runLessonProposalBridgeMock).not.toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
    )
    expect(rpc.fromMock).not.toHaveBeenCalled()
    expect(result).toEqual({
      ok: true,
      message: '承認しました。lesson-factory bridge を eval まで進めました。',
    })
  })

  it('re-resolves proposalId from gate metadata when the approval RPC response omits lesson_dev_proposal_id', async () => {
    const rpc = mockRpcResult({
      rpcData: {
        id: 'gate-1',
        metadata: {},
      },
      gateMetadataData: {
        metadata: {
          lesson_dev_proposal_id: '44444444-4444-4444-8444-444444444444',
        },
      },
    })

    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '99999999-9999-4999-8999-999999999999',
      decision: 'approved',
    })

    expect(rpc.fromMock).toHaveBeenCalledWith('approval_gates')
    expect(rpc.selectMock).toHaveBeenCalledWith('metadata')
    expect(rpc.eqMock).toHaveBeenCalledWith(
      'id',
      '11111111-1111-4111-8111-111111111111',
    )
    expect(runLessonProposalBridgeMock).toHaveBeenCalledWith(
      '44444444-4444-4444-8444-444444444444',
    )
    expect(runLessonProposalBridgeMock).not.toHaveBeenCalledWith(
      '99999999-9999-4999-8999-999999999999',
    )
    expect(result).toEqual({
      ok: true,
      message: '承認しました。lesson-factory bridge を eval まで進めました。',
    })
  })

  it.each([
    [
      'forbidden: owner role required',
      'owner 権限が必要です。',
    ],
    [
      'invalid decision: ignored',
      '承認状態が不正です。画面を更新して再試行してください。',
    ],
    [
      'gate not found or not pending (id=gate-1)',
      'この gate は見つからないか、すでに処理済みです。画面を更新してください。',
    ],
    [
      'linked lesson proposal not found or not pending',
      '対応する proposal が見つからないか、すでに処理済みです。',
    ],
    [
      'linked lesson gaps not found (proposal_id=proposal-1)',
      '関連 gap の状態が不整合です。画面を更新して再試行してください。',
    ],
  ])('maps RPC errors to UI messages: %s', async (errorMessage, expectedMessage) => {
    mockRpcResult({
      rpcData: null,
      rpcError: { message: errorMessage },
    })

    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '22222222-2222-4222-8222-222222222222',
      decision: 'rejected',
      reason: 'No longer needed',
    })

    expect(result).toEqual({
      ok: false,
      message: expectedMessage,
    })
    expect(runLessonProposalBridgeMock).not.toHaveBeenCalled()
  })

  it('requires a reason before calling the rejection RPC', async () => {
    const result = await reviewLessonProposalGateAction({
      gateId: '11111111-1111-4111-8111-111111111111',
      proposalId: '22222222-2222-4222-8222-222222222222',
      decision: 'rejected',
      reason: '  ',
    } as ReviewLessonProposalGateInput)

    expect(result).toEqual({
      ok: false,
      message: '却下する場合は理由を入力してください。',
    })
    expect(createClientMock).not.toHaveBeenCalled()
  })
})
