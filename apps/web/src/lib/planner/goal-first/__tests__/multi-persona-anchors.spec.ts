/**
 * TQ-224 — Anchor を 11 persona 全部に拡張する第 1 弾 regression test。
 *
 * Investigator 9 検出: Anchor / Persona yaml は web-builder 1 件のみで、
 * `fetchAnchorForPersona()` が web-builder 以外の 11 persona で必ず null を
 * 返していた。本 TQ で最低 4 anchor (ai-app-builder / saas-mvp /
 * nonengineer-marketer / designer) を追加し、`resolvePersonaAnchor()` が
 * これらを解決できることを契約化する。
 *
 * Owner Vision「1 step 目に画面に何か出る / 動く何かが出る」を満たすため、
 * 各 anchor の ordered_atom_ids[0] が「成果物が出る性質」を持つ atom である
 * ことも検証する。
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/atoms/atom-repository', () => ({
  // DB anchor を取らせない (local YAML を使わせる)
  fetchAnchorForPersona: vi.fn().mockResolvedValue(null),
}))

import { resolvePersonaAnchor } from '../persona-anchor'

/**
 * 「1 step 目で成果物が出る」性質を持つ atom id 集合。
 * - scaffold-with-bolt / scaffold-with-v0 / use-lovable-1shot: 動くアプリが出る
 * - ad-headlines-generate: AI 出力サンプル (広告見出し 20-50 本) が出る
 * - image-gen-basics: 画像 1 枚が出る
 * - let-claude-build-everything: AI 主導で 1 画面ができる
 */
const PRODUCES_OUTPUT_FIRST_STEP = new Set<string>([
  'atom.common.scaffold-with-bolt',
  'atom.common.scaffold-with-v0',
  'atom.common.use-lovable-1shot',
  'atom.web-builder.let-claude-build-everything',
  'atom.ai-marketer.ad-headlines-generate',
  'atom.ai-freelancer.image-gen-basics',
])

describe('anchor.ai-app-builder.start (TQ-224)', () => {
  it('resolves persona.ai-app-builder to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-app-builder')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.ai-app-builder.start')
    expect(anchor?.personaId).toBe('persona.ai-app-builder')
  })

  it('places a "動く何かが出る" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-app-builder')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('has a non-empty ordered_atom_ids list', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-app-builder')
    expect(anchor?.orderedAtomIds.length ?? 0).toBeGreaterThan(0)
  })
})

describe('anchor.saas-mvp.start (TQ-224)', () => {
  it('resolves persona.saas-mvp to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.saas-mvp')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.saas-mvp.start')
    expect(anchor?.personaId).toBe('persona.saas-mvp')
  })

  it('places a "動く何かが出る" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.saas-mvp')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('includes a deploy step (Vercel CLI) so the SaaS MVP can be shared', async () => {
    const anchor = await resolvePersonaAnchor('persona.saas-mvp')
    expect(anchor?.orderedAtomIds).toContain('atom.web-builder.deploy-with-vercel-cli')
  })
})

describe('anchor.nonengineer-marketer.start (TQ-224)', () => {
  it('resolves persona.nonengineer-marketer to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.nonengineer-marketer')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.nonengineer-marketer.start')
    expect(anchor?.personaId).toBe('persona.nonengineer-marketer')
  })

  it('places an "AI 出力サンプルが完成する" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.nonengineer-marketer')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('does not require CLI / git / coding atoms', async () => {
    const anchor = await resolvePersonaAnchor('persona.nonengineer-marketer')
    const cliAtoms = [
      'atom.web-builder.terminal-basics',
      'atom.web-builder.node-pnpm-setup',
      'atom.web-builder.git-github-cli',
      'atom.web-builder.create-next-app',
      'atom.web-builder.let-claude-build-everything',
    ]
    for (const cliAtom of cliAtoms) {
      expect(anchor?.orderedAtomIds).not.toContain(cliAtom)
    }
  })
})

describe('anchor.designer.start (TQ-224)', () => {
  it('resolves persona.designer to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.designer')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.designer.start')
    expect(anchor?.personaId).toBe('persona.designer')
  })

  it('places a "画像が出る" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.designer')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('includes commercial-use rules so designs can be delivered to clients', async () => {
    const anchor = await resolvePersonaAnchor('persona.designer')
    expect(anchor?.orderedAtomIds).toContain('atom.ai-freelancer.image-copyright-commercial')
  })
})

describe('Wave 4 Anchor expansion contract (TQ-224)', () => {
  it('all 4 new persona ids resolve (non-null)', async () => {
    const personaIds = [
      'persona.ai-app-builder',
      'persona.saas-mvp',
      'persona.nonengineer-marketer',
      'persona.designer',
    ]

    const anchors = await Promise.all(personaIds.map((p) => resolvePersonaAnchor(p)))
    for (const anchor of anchors) {
      expect(anchor).not.toBeNull()
      expect((anchor?.orderedAtomIds.length ?? 0) > 0).toBe(true)
    }
  })

  it('every new anchor has at least one required_capability declared', async () => {
    const personaIds = [
      'persona.ai-app-builder',
      'persona.saas-mvp',
      'persona.nonengineer-marketer',
      'persona.designer',
    ]
    for (const personaId of personaIds) {
      const anchor = await resolvePersonaAnchor(personaId)
      expect(anchor?.requiredCapabilities.length ?? 0).toBeGreaterThan(0)
    }
  })
})
