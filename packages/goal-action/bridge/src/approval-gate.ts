import type { ApprovalRow } from './schema'

export class ApprovalMissingError extends Error {
  readonly proposalId: string
  readonly reason: string

  constructor(proposalId: string, reason: string) {
    super(
      `Approval gate missing for lesson_dev_proposal ${proposalId}: ${reason}`,
    )
    this.name = 'ApprovalMissingError'
    this.proposalId = proposalId
    this.reason = reason
  }
}

export type ApprovalGateFetcher = {
  /**
   * Return the latest approval_gates row whose `metadata.lesson_dev_proposal_id`
   * matches `proposalId`, or null if none exists. Callers should NOT filter on
   * `status` here — `loadApprovalGate` applies the status/expiry policy.
   */
  fetchRow: (proposalId: string) => Promise<ApprovalRow | null>
}

export type LoadApprovalGateOptions = {
  /** Deterministic now for expiry comparison. Defaults to `new Date()`. */
  now?: () => Date
}

/**
 * Resolve the approval gate row for a proposal and throw
 * `ApprovalMissingError` when:
 *   - no row is linked to the proposal at all
 *   - the linked row is not `status='approved'`
 *   - the approval has expired (expires_at < now)
 *   - `metadata.lesson_dev_proposal_id` does not match the requested id
 *     (defensive check against mis-wired fixtures)
 *
 * Returns the row when everything passes.
 */
export async function loadApprovalGate(
  proposalId: string,
  deps: ApprovalGateFetcher,
  opts: LoadApprovalGateOptions = {},
): Promise<ApprovalRow> {
  const row = await deps.fetchRow(proposalId)
  if (!row) {
    throw new ApprovalMissingError(
      proposalId,
      'no approval_gates row linked via metadata.lesson_dev_proposal_id',
    )
  }

  const metaId = row.metadata?.['lesson_dev_proposal_id']
  if (typeof metaId !== 'string' || metaId !== proposalId) {
    throw new ApprovalMissingError(
      proposalId,
      `approval row metadata.lesson_dev_proposal_id mismatch (got ${String(metaId)})`,
    )
  }

  if (row.status !== 'approved') {
    throw new ApprovalMissingError(
      proposalId,
      `approval row status=${row.status}, expected 'approved'`,
    )
  }

  if (row.expires_at) {
    const now = (opts.now ?? (() => new Date()))()
    const expiresAt = new Date(row.expires_at)
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < now.getTime()) {
      throw new ApprovalMissingError(
        proposalId,
        `approval expired at ${row.expires_at}`,
      )
    }
  }

  return row
}
