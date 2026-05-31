import { describe, expect, it } from 'vitest'

import {
  buildFindingDetailHref,
  buildImprovementProposalHref,
  resolveImprovementProposalFilter,
  selectImprovementProposalId,
} from './improvement-proposals'

describe('improvement proposal helpers', () => {
  it('normalizes filter values', () => {
    expect(resolveImprovementProposalFilter('acknowledged')).toBe('acknowledged')
    expect(resolveImprovementProposalFilter('unacknowledged')).toBe('unacknowledged')
    expect(resolveImprovementProposalFilter('unexpected')).toBe('all')
  })

  it('builds stable list/detail hrefs', () => {
    expect(buildImprovementProposalHref({
      filter: 'unacknowledged',
      proposalId: 'proposal-1',
    })).toBe('/admin/improvement-proposals?status=unacknowledged&proposal=proposal-1')
  })

  it('selects the requested proposal when available', () => {
    expect(selectImprovementProposalId([
      { proposal_id: 'proposal-1' },
      { proposal_id: 'proposal-2' },
    ], 'proposal-2')).toBe('proposal-2')
    expect(selectImprovementProposalId([
      { proposal_id: 'proposal-1' },
    ], 'proposal-missing')).toBe('proposal-1')
  })

  it('prefers atom links before persona links', () => {
    expect(buildFindingDetailHref({
      atom_id: 'atom.sql',
      persona_id: 'persona.web',
    })).toBe('/admin/atoms#atom.sql')
    expect(buildFindingDetailHref({
      atom_id: null,
      persona_id: 'persona.web',
    })).toBe('/admin/personas#persona.web')
  })
})
