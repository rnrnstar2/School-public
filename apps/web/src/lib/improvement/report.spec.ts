import { describe, expect, it } from 'vitest'

import {
  buildProposalSummary,
  generateImprovementProposalMarkdown,
} from './report'
import type { ImprovementFindingRecord } from './types'

const findings: ImprovementFindingRecord[] = [
  {
    finding_id: 'finding-1',
    source_job: 'job-1',
    finding_type: 'confusion',
    atom_id: 'atom.sql',
    persona_id: null,
    capability: null,
    severity: 'medium',
    evidence: { stuck_count: 3 },
    detected_at: '2026-04-08T00:00:00.000Z',
    status: 'open',
  },
  {
    finding_id: 'finding-2',
    source_job: 'job-2',
    finding_type: 'gap',
    atom_id: null,
    persona_id: 'persona.web',
    capability: 'webhook-delivery',
    severity: 'high',
    evidence: { occurrence_count: 6 },
    detected_at: '2026-04-08T00:00:00.000Z',
    status: 'open',
  },
]

describe('improvement proposal report', () => {
  it('builds a compact summary line', () => {
    expect(buildProposalSummary(findings)).toBe('2 improvement findings / 1 confusion / 0 freshness / 1 gap')
  })

  it('renders markdown with snapshot and action tables', () => {
    const markdown = generateImprovementProposalMarkdown({
      findings,
      generatedAt: '2026-04-08T12:00:00.000Z',
    })

    expect(markdown).toContain('# Nightly Improvement Proposal')
    expect(markdown).toContain('## Snapshot')
    expect(markdown).toContain('## Confusion Miner')
    expect(markdown).toContain('## Gap Miner')
    expect(markdown).toContain('Improve atom `atom.sql`')
    expect(markdown).toContain('Consider a new atom for capability `webhook-delivery` and extend persona `persona.web`')
  })
})
