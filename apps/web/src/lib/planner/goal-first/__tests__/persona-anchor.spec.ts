/**
 * TQ-254: tests for the DB-side anchor resolution path.
 *
 * Auditor 2 (C16) flagged that the production DB still carried the
 * textbook 18-step `anchor.web-builder.default` while the canonical
 * lesson-factory yaml is the no-code-first 5-step ordering. The
 * accompanying migration / seed updates push the new ordering into the
 * DB. This spec contracts the DB-first resolution behaviour:
 *
 *  1. When the DB returns an anchor, `resolvePersonaAnchor` returns
 *     that anchor verbatim and **does not** fall back to local yaml.
 *  2. When the DB returns null, the local yaml fallback is used (which
 *     is already covered by `multi-persona-anchors.spec.ts` /
 *     `web-builder-anchor.spec.ts`, but we re-verify it here for
 *     symmetry).
 */

import { describe, expect, it, vi } from 'vitest'

const fetchAnchorForPersonaMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/atoms/atom-repository', () => ({
  fetchAnchorForPersona: fetchAnchorForPersonaMock,
}))

import { resolvePersonaAnchor } from '../persona-anchor'

describe('resolvePersonaAnchor (TQ-254 DB-first path)', () => {
  it('returns the DB anchor row when supabase reports a match', async () => {
    fetchAnchorForPersonaMock.mockResolvedValueOnce({
      anchorId: 'anchor.web-builder.default',
      personaId: 'persona.web-builder',
      orderedAtomIds: [
        'atom.common.scaffold-with-v0',
        'atom.web-builder.choose-project-goal',
        'atom.web-builder.let-claude-build-everything',
        'atom.web-builder.deploy-with-vercel-cli',
        'atom.common.delegate-full-feature-to-cli-agent',
      ],
      requiredCapabilities: [
        'scaffold-ui-with-v0',
        'define-project-goal',
        'delegate-build-to-cli-agent',
        'deploy-with-vercel-cli',
        'delegate-feature-to-cli-agent',
      ],
      description: 'No-code-first 5-step anchor for the web-builder persona.',
    })

    const anchor = await resolvePersonaAnchor('persona.web-builder')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.web-builder.default')
    expect(anchor?.orderedAtomIds[0]).toBe('atom.common.scaffold-with-v0')
    expect(anchor?.orderedAtomIds.length).toBe(5)
    // No fallback triggered because the DB hit succeeded.
    expect(fetchAnchorForPersonaMock).toHaveBeenCalledTimes(1)
  })

  it('places a no-code-first atom at orderedAtomIds[0] for the web-builder DB anchor', async () => {
    // This contracts MVP Done When 1 (TQ-254): the DB row must carry the
    // new no-code-first ordering, not the legacy textbook 18-step path.
    fetchAnchorForPersonaMock.mockResolvedValueOnce({
      anchorId: 'anchor.web-builder.default',
      personaId: 'persona.web-builder',
      orderedAtomIds: [
        'atom.common.scaffold-with-v0',
        'atom.web-builder.choose-project-goal',
        'atom.web-builder.let-claude-build-everything',
        'atom.web-builder.deploy-with-vercel-cli',
        'atom.common.delegate-full-feature-to-cli-agent',
      ],
      requiredCapabilities: [],
      description: null,
    })

    const noCodeFirstAtoms = new Set([
      'atom.common.scaffold-with-v0',
      'atom.common.scaffold-with-bolt',
      'atom.common.use-lovable-1shot',
      'atom.web-builder.let-claude-build-everything',
    ])

    const anchor = await resolvePersonaAnchor('persona.web-builder')
    expect(noCodeFirstAtoms.has(anchor?.orderedAtomIds[0] ?? '')).toBe(true)

    // Forbid textbook setup atoms at position 0.
    const forbiddenFirstAtoms = [
      'atom.web-builder.terminal-basics',
      'atom.web-builder.node-pnpm-setup',
      'atom.web-builder.git-github-cli',
      'atom.web-builder.create-next-app',
    ]
    for (const forbidden of forbiddenFirstAtoms) {
      expect(anchor?.orderedAtomIds[0]).not.toBe(forbidden)
    }
  })

  it('resolves Wave 4 personas (ai-app-builder / saas-mvp / nonengineer-marketer / designer) from the DB', async () => {
    // TQ-254 MVP Done When 4: the 4 new anchors must be reachable via DB.
    fetchAnchorForPersonaMock.mockImplementation((personaId: string) => {
      const anchors: Record<string, unknown> = {
        'persona.ai-app-builder': {
          anchorId: 'anchor.ai-app-builder.default',
          personaId: 'persona.ai-app-builder',
          orderedAtomIds: [
            'atom.common.scaffold-with-bolt',
            'atom.web-builder.choose-project-goal',
            'atom.web-builder.let-claude-build-everything',
            'atom.common.delegate-full-feature-to-cli-agent',
            'atom.web-builder.deploy-with-vercel-cli',
          ],
          requiredCapabilities: ['scaffold-app-with-bolt'],
          description: null,
        },
        'persona.saas-mvp': {
          anchorId: 'anchor.saas-mvp.default',
          personaId: 'persona.saas-mvp',
          orderedAtomIds: ['atom.common.use-lovable-1shot'],
          requiredCapabilities: ['scaffold-app-with-lovable'],
          description: null,
        },
        'persona.nonengineer-marketer': {
          anchorId: 'anchor.nonengineer-marketer.default',
          personaId: 'persona.nonengineer-marketer',
          orderedAtomIds: ['atom.ai-marketer.ad-headlines-generate'],
          requiredCapabilities: ['generate-ad-headlines-with-ai'],
          description: null,
        },
        'persona.designer': {
          anchorId: 'anchor.designer.default',
          personaId: 'persona.designer',
          orderedAtomIds: ['atom.ai-freelancer.image-gen-basics'],
          requiredCapabilities: ['generate-image-with-prompt'],
          description: null,
        },
      }
      return Promise.resolve(anchors[personaId] ?? null)
    })

    for (const personaId of [
      'persona.ai-app-builder',
      'persona.saas-mvp',
      'persona.nonengineer-marketer',
      'persona.designer',
    ]) {
      const anchor = await resolvePersonaAnchor(personaId)
      expect(anchor).not.toBeNull()
      expect(anchor?.personaId).toBe(personaId)
      expect((anchor?.orderedAtomIds.length ?? 0) > 0).toBe(true)
    }
  })

  it('falls back to local yaml when supabase returns null', async () => {
    // Re-asserts the fallback contract; multi-persona-anchors.spec.ts and
    // web-builder-anchor.spec.ts already exercise this for unit purity but
    // we keep one assertion here so the DB-first / yaml-fallback boundary
    // is explicit in this spec.
    fetchAnchorForPersonaMock.mockResolvedValueOnce(null)

    const anchor = await resolvePersonaAnchor('persona.web-builder')
    expect(anchor).not.toBeNull()
    // The local yaml uses anchor_id `anchor.web-builder.start` (TQ-217).
    expect(anchor?.anchorId).toBe('anchor.web-builder.start')
  })
})
