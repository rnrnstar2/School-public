import { describe, expect, it } from 'vitest'

import {
  ApprovalMissingError,
  loadApprovalGate,
  type ApprovalGateFetcher,
} from '../src/approval-gate.js'
import type { ApprovalRow } from '../src/schema.js'

const PROPOSAL_ID = '11111111-1111-4111-a111-111111111111'

function makeFetcher(row: ApprovalRow | null): ApprovalGateFetcher {
  return {
    fetchRow: async () => row,
  }
}

function makeApprovedRow(overrides: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: 'gate-1',
    gate_type: 'general',
    status: 'approved',
    decided_by: 'owner',
    decided_at: '2026-04-17T09:00:00.000Z',
    reason: 'LGTM',
    expires_at: null,
    metadata: { lesson_dev_proposal_id: PROPOSAL_ID },
    ...overrides,
  }
}

describe('loadApprovalGate', () => {
  it('returns the row when approved and metadata matches', async () => {
    const row = makeApprovedRow()
    const result = await loadApprovalGate(PROPOSAL_ID, makeFetcher(row))
    expect(result.id).toBe('gate-1')
    expect(result.status).toBe('approved')
  })

  it('throws ApprovalMissingError when no row exists', async () => {
    await expect(
      loadApprovalGate(PROPOSAL_ID, makeFetcher(null)),
    ).rejects.toBeInstanceOf(ApprovalMissingError)
  })

  it('throws when the row is pending', async () => {
    await expect(
      loadApprovalGate(
        PROPOSAL_ID,
        makeFetcher(makeApprovedRow({ status: 'pending' })),
      ),
    ).rejects.toThrow(/status=pending/)
  })

  it('throws when the row is rejected', async () => {
    await expect(
      loadApprovalGate(
        PROPOSAL_ID,
        makeFetcher(makeApprovedRow({ status: 'rejected' })),
      ),
    ).rejects.toBeInstanceOf(ApprovalMissingError)
  })

  it('throws when metadata.lesson_dev_proposal_id does not match', async () => {
    await expect(
      loadApprovalGate(
        PROPOSAL_ID,
        makeFetcher(
          makeApprovedRow({
            metadata: { lesson_dev_proposal_id: 'a-different-id' },
          }),
        ),
      ),
    ).rejects.toThrow(/mismatch/)
  })

  it('throws when the approval has expired', async () => {
    const expired = makeApprovedRow({
      expires_at: '2026-04-16T00:00:00.000Z',
    })
    await expect(
      loadApprovalGate(PROPOSAL_ID, makeFetcher(expired), {
        now: () => new Date('2026-04-17T00:00:00.000Z'),
      }),
    ).rejects.toThrow(/expired/)
  })

  it('accepts a future expires_at', async () => {
    const active = makeApprovedRow({
      expires_at: '2026-05-01T00:00:00.000Z',
    })
    const result = await loadApprovalGate(
      PROPOSAL_ID,
      makeFetcher(active),
      { now: () => new Date('2026-04-17T00:00:00.000Z') },
    )
    expect(result.id).toBe('gate-1')
  })

  it('ApprovalMissingError carries the proposalId and reason', async () => {
    try {
      await loadApprovalGate(PROPOSAL_ID, makeFetcher(null))
      throw new Error('expected throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalMissingError)
      const e = err as ApprovalMissingError
      expect(e.proposalId).toBe(PROPOSAL_ID)
      expect(e.reason).toMatch(/no approval_gates row/)
    }
  })
})
