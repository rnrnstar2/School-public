export type ImprovementProposalFilter =
  | 'all'
  | 'acknowledged'
  | 'unacknowledged'

export interface ImprovementProposalListLike {
  proposal_id: string
}

export interface ImprovementFindingLinkLike {
  atom_id: string | null
  persona_id: string | null
}

export function resolveImprovementProposalFilter(
  value: string | undefined,
): ImprovementProposalFilter {
  if (value === 'acknowledged' || value === 'unacknowledged') {
    return value
  }

  return 'all'
}

export function buildImprovementProposalHref({
  filter,
  proposalId,
}: {
  filter: ImprovementProposalFilter
  proposalId?: string | null
}) {
  const searchParams = new URLSearchParams()

  if (filter !== 'all') {
    searchParams.set('status', filter)
  }

  if (proposalId) {
    searchParams.set('proposal', proposalId)
  }

  const query = searchParams.toString()
  return query.length > 0
    ? `/admin/improvement-proposals?${query}`
    : '/admin/improvement-proposals'
}

export function selectImprovementProposalId<T extends ImprovementProposalListLike>(
  proposals: T[],
  requestedProposalId: string | undefined,
) {
  if (requestedProposalId && proposals.some((proposal) => proposal.proposal_id === requestedProposalId)) {
    return requestedProposalId
  }

  return proposals[0]?.proposal_id ?? null
}

export function buildFindingDetailHref(finding: ImprovementFindingLinkLike) {
  if (finding.atom_id) {
    return `/admin/atoms#${finding.atom_id}`
  }

  if (finding.persona_id) {
    return `/admin/personas#${finding.persona_id}`
  }

  return null
}
