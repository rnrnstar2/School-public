import { describe, expect, it } from 'vitest'

import {
  mineConfusionFindings,
  mineFreshnessFindings,
  mineGapFindings,
} from './miners'

describe('improvement miners', () => {
  it('flags confusion when stuck events cross the threshold', () => {
    const findings = mineConfusionFindings([
      { event_name: 'stuck_reported', atom_id: 'atom.sql', plan_id: 'plan-1', occurred_at: '2026-04-08T00:00:00.000Z', properties: null },
      { event_name: 'stuck_reported', atom_id: 'atom.sql', plan_id: 'plan-2', occurred_at: '2026-04-08T01:00:00.000Z', properties: null },
      { event_name: 'stuck_reported', atom_id: 'atom.sql', plan_id: 'plan-3', occurred_at: '2026-04-08T02:00:00.000Z', properties: null },
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      finding_type: 'confusion',
      atom_id: 'atom.sql',
      severity: 'medium',
    })
  })

  it('flags freshness when an old atom loses evidence pass rate', () => {
    const findings = mineFreshnessFindings({
      currentVersions: [
        {
          atom_id: 'atom.rls',
          version_id: 'version-1',
          imported_at: '2025-12-01T00:00:00.000Z',
        },
      ],
      telemetryEvents: [
        { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'a', occurred_at: '2026-03-27T00:00:00.000Z', properties: null },
        { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'b', occurred_at: '2026-03-28T00:00:00.000Z', properties: null },
        { event_name: 'evidence_passed', atom_id: 'atom.rls', plan_id: 'a', occurred_at: '2026-03-27T01:00:00.000Z', properties: null },
        { event_name: 'evidence_passed', atom_id: 'atom.rls', plan_id: 'b', occurred_at: '2026-03-28T01:00:00.000Z', properties: null },
        { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'c', occurred_at: '2026-04-07T00:00:00.000Z', properties: null },
        { event_name: 'artifact_submitted', atom_id: 'atom.rls', plan_id: 'd', occurred_at: '2026-04-08T00:00:00.000Z', properties: null },
      ],
      now: new Date('2026-04-08T12:00:00.000Z'),
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      finding_type: 'freshness',
      atom_id: 'atom.rls',
      severity: 'high',
    })
  })

  it('flags gap findings from frequent unsupported capabilities', () => {
    const findings = mineGapFindings([
      { plan_id: 'plan-1', persona_id: 'persona.web', unsupported_capabilities: ['webhook-delivery'], created_at: '2026-04-01T00:00:00.000Z' },
      { plan_id: 'plan-2', persona_id: 'persona.web', unsupported_capabilities: ['webhook-delivery'], created_at: '2026-04-02T00:00:00.000Z' },
      { plan_id: 'plan-3', persona_id: 'persona.ops', unsupported_capabilities: ['webhook-delivery'], created_at: '2026-04-03T00:00:00.000Z' },
    ])

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      finding_type: 'gap',
      capability: 'webhook-delivery',
      persona_id: 'persona.web',
      severity: 'medium',
    })
  })
})
