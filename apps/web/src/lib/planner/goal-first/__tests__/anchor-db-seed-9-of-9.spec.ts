/**
 * W51 — lesson_anchors を 4/9 不在から 9/9 にする regression test。
 *
 * Audit G2 hands-on で「W46 で yaml 9 anchor land 済みだが local supabase の
 * lesson_anchors は 5 row のみで、persona.ai-content-creator 等で compile
 * すると step_count: 0 が再現する」状態を検出。本 W51 は seed.sql に 4 row を
 * 追加し、新しい migration `20260509170000_anchor_db_seed_9_of_9.sql` で
 * production DB にも push する。
 *
 * このテストは以下を契約化する:
 *  1. local yaml fallback 経路で 4 persona (ai-content-creator /
 *     ai-freelancer / ai-automation / crm-builder) が non-null anchor を返す
 *     (anchor が 1 件以上 step を持つ → compile が step_count >= 1 にできる)。
 *  2. DB-first 経路で 4 persona が anchor を返す (本 W51 で seed/migration
 *     によって追加された row が `fetchAnchorForPersona()` 経由で取れる)。
 */

import { describe, expect, it, vi } from 'vitest'

const fetchAnchorForPersonaMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchAnchorForPersona: fetchAnchorForPersonaMock,
}))

import { resolvePersonaAnchor } from '../persona-anchor'

const W51_PERSONAS = [
  'persona.ai-content-creator',
  'persona.ai-freelancer',
  'persona.ai-automation',
  'persona.crm-builder',
] as const

describe('W51 — local yaml fallback for the 4 W51-added personas', () => {
  it('resolves all 4 new personas to non-null anchors with at least 1 step', async () => {
    fetchAnchorForPersonaMock.mockResolvedValue(null)

    for (const personaId of W51_PERSONAS) {
      const anchor = await resolvePersonaAnchor(personaId)
      expect(anchor, `expected anchor for ${personaId}`).not.toBeNull()
      expect(
        (anchor?.orderedAtomIds.length ?? 0) >= 1,
        `${personaId} must have at least 1 ordered atom (step_count >= 1)`,
      ).toBe(true)
      expect(anchor?.personaId).toBe(personaId)
    }
  })

  it('persona.ai-content-creator anchor places a content-output atom at position 0', async () => {
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    const anchor = await resolvePersonaAnchor('persona.ai-content-creator')
    expect(anchor?.orderedAtomIds[0]).toBe('atom.video-creator.generate-video-ideas')
  })

  it('persona.ai-freelancer anchor places a freelancing sample atom at position 0', async () => {
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    const anchor = await resolvePersonaAnchor('persona.ai-freelancer')
    expect(anchor?.orderedAtomIds[0]).toBe('atom.ai-freelancer.mock-project-writing')
  })

  it('persona.ai-automation anchor places an automation atom at position 0', async () => {
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    const anchor = await resolvePersonaAnchor('persona.ai-automation')
    expect(anchor?.orderedAtomIds[0]).toBe('atom.office-automator.spreadsheet-formula-ai')
  })

  it('persona.crm-builder anchor places a table-design atom at position 0', async () => {
    fetchAnchorForPersonaMock.mockResolvedValue(null)
    const anchor = await resolvePersonaAnchor('persona.crm-builder')
    expect(anchor?.orderedAtomIds[0]).toBe('atom.nocode-builder.design-tables-and-relations')
  })
})

describe('W51 — DB-first path returns the new seeded rows', () => {
  it('returns the W51-seeded DB anchors verbatim for all 4 personas', async () => {
    // 本 W51 で seed.sql + migration が追加する 4 row を DB が返す前提を mock。
    const dbRows: Record<string, {
      anchorId: string
      personaId: string
      orderedAtomIds: string[]
      requiredCapabilities: string[]
      description: string | null
    }> = {
      'persona.ai-content-creator': {
        anchorId: 'anchor.ai-content-creator.default',
        personaId: 'persona.ai-content-creator',
        orderedAtomIds: [
          'atom.video-creator.generate-video-ideas',
          'atom.common.choose-llm-by-task',
          'atom.video-creator.batch-produce-short-scripts',
          'atom.ai-freelancer.sns-copy-ai',
          'atom.common.draft-content-calendar',
        ],
        requiredCapabilities: [
          'generate-video-ideas-with-ai',
          'choose-llm-by-task',
          'batch-produce-short-scripts',
          'generate-sns-copy-with-ai',
          'content-calendar-drafted',
        ],
        description: null,
      },
      'persona.ai-freelancer': {
        anchorId: 'anchor.ai-freelancer.default',
        personaId: 'persona.ai-freelancer',
        orderedAtomIds: [
          'atom.ai-freelancer.mock-project-writing',
          'atom.ai-freelancer.niche-positioning',
          'atom.ai-freelancer.portfolio-with-ai',
          'atom.ai-freelancer.twitter-branding',
          'atom.ai-freelancer.first-job-strategy',
        ],
        requiredCapabilities: ['produce-mock-writing-with-ai'],
        description: null,
      },
      'persona.ai-automation': {
        anchorId: 'anchor.ai-automation.default',
        personaId: 'persona.ai-automation',
        orderedAtomIds: [
          'atom.office-automator.spreadsheet-formula-ai',
          'atom.office-automator.daily-report-automation',
          'atom.office-automator.zapier-basics',
          'atom.office-automator.cross-app-sync',
          'atom.office-automator.create-automation-roadmap',
        ],
        requiredCapabilities: ['automate-spreadsheet-with-ai'],
        description: null,
      },
      'persona.crm-builder': {
        anchorId: 'anchor.crm-builder.default',
        personaId: 'persona.crm-builder',
        orderedAtomIds: [
          'atom.nocode-builder.design-tables-and-relations',
          'atom.nocode-builder.design-access-control',
          'atom.nocode-builder.build-request-form',
          'atom.nocode-builder.build-status-visibility',
          'atom.ai-marketer.nurture-flow-design',
          'atom.ai-marketer.next-actions-prioritize',
          'atom.nocode-builder.design-reporting-views',
          'atom.nocode-builder.build-readable-dashboards',
        ],
        requiredCapabilities: ['design-table-schema-with-ai'],
        description: null,
      },
    }

    fetchAnchorForPersonaMock.mockImplementation((personaId: string) =>
      Promise.resolve(dbRows[personaId] ?? null),
    )

    for (const personaId of W51_PERSONAS) {
      const anchor = await resolvePersonaAnchor(personaId)
      expect(anchor, `expected DB anchor for ${personaId}`).not.toBeNull()
      // anchor_id 命名統一: 既存 5 row と同じ `<persona>.default` 形式。
      expect(anchor?.anchorId).toMatch(/\.default$/)
      expect(anchor?.personaId).toBe(personaId)
      expect((anchor?.orderedAtomIds.length ?? 0) >= 1).toBe(true)
    }
  })
})
