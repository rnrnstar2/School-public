import type {
  OwnerApprovalState,
  ProposalActionClass,
  SchedulerDecisionCandidate,
} from '../types'

const policyTable: Record<ProposalActionClass, OwnerApprovalState> = {
  micro_patch_existing_lesson: 'auto',
  copy_refresh_existing_lesson: 'pending_owner_review',
  new_lesson_scaffold: 'pending_owner_review',
  lesson_rewrite: 'pending_owner_review',
  curriculum_resequence: 'pending_owner_review',
  cross_track_refactor: 'pending_owner_review',
  direct_publish: 'blocked',
  destructive_migration: 'blocked',
}

export function resolveOwnerApproval(
  actionClass: ProposalActionClass,
): OwnerApprovalState {
  return policyTable[actionClass]
}

export function resolveDecisionApproval(
  decision: Pick<SchedulerDecisionCandidate, 'actionClass'>,
): OwnerApprovalState {
  return resolveOwnerApproval(decision.actionClass)
}

export function approvalStateToProposalStatus(
  ownerApproval: OwnerApprovalState,
): 'proposed' | 'approved' | 'rejected' | 'blocked' {
  switch (ownerApproval) {
    case 'auto':
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'rejected'
    case 'blocked':
      return 'blocked'
    case 'pending_owner_review':
    default:
      return 'proposed'
  }
}

export function summarizeApprovalPolicy(decisions: SchedulerDecisionCandidate[]) {
  return decisions.reduce(
    (summary, decision) => {
      const state = resolveDecisionApproval(decision)
      summary[state] += 1
      return summary
    },
    {
      auto: 0,
      pending_owner_review: 0,
      approved: 0,
      rejected: 0,
      blocked: 0,
    } satisfies Record<OwnerApprovalState, number>,
  )
}
