/**
 * W46 — Persona anchor 6/9 → 9/9 の regression test。
 *
 * Audit G 1 / Audit C 軸 1 (CR-4 Vision 完全逆転) の解消を契約化する。
 *
 * 元状態:
 *   `persona.ai-freelancer` / `persona.ai-content-creator` /
 *   `persona.ai-automation` の anchor yaml が `lesson-factory/lessons/anchors/`
 *   に存在せず、これら persona の user が hearing で「動画コンテンツ毎週投稿」
 *   「副業で稼ぐ」「Excel 自動化」goal を出すと、`atom.web-builder.let-claude-build-everything`
 *   等のエンジニア向け atom が plan に並ぶ Vision 完全逆転状態だった。
 *
 * 本 W46 で 3 anchor を追加し、`resolvePersonaAnchor()` が 3 persona すべてで
 * non-null を返し、ordered_atom_ids[0] に「成果物が出る」性質の atom が来ること、
 * かつコード・CLI・git 系 atom が混入しないことを契約化する。
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/atoms/atom-repository', () => ({
  // DB anchor を取らせない (local YAML を使わせる)
  fetchAnchorForPersona: vi.fn().mockResolvedValue(null),
}))

import { resolvePersonaAnchor } from '../persona-anchor'

/**
 * 「1 step 目で成果物が出る」性質を持つ atom id 集合。W46 で 3 persona 追加に
 * あわせて拡張。
 */
const PRODUCES_OUTPUT_FIRST_STEP = new Set<string>([
  // 既存 (TQ-224)
  'atom.common.scaffold-with-bolt',
  'atom.common.scaffold-with-v0',
  'atom.common.use-lovable-1shot',
  'atom.web-builder.let-claude-build-everything',
  'atom.ai-marketer.ad-headlines-generate',
  'atom.ai-freelancer.image-gen-basics',
  // W46 追加: 3 persona の最初の step に置く atom
  'atom.video-creator.generate-video-ideas',
  'atom.office-automator.spreadsheet-formula-ai',
  'atom.ai-freelancer.mock-project-writing',
])

/**
 * 「Vision 完全逆転」を引き起こす engineer-only atom 集合。
 * 3 anchor のいずれにも混入してはならない。
 */
const FORBIDDEN_ENGINEER_ATOMS = [
  'atom.web-builder.let-claude-build-everything',
  'atom.web-builder.terminal-basics',
  'atom.web-builder.node-pnpm-setup',
  'atom.web-builder.git-github-cli',
  'atom.web-builder.create-next-app',
  'atom.web-builder.install-shadcn',
  'atom.web-builder.create-homepage',
  'atom.web-builder.deploy-with-vercel-cli',
  'atom.common.delegate-full-feature-to-cli-agent',
  'atom.common.scaffold-with-bolt',
  'atom.common.scaffold-with-v0',
  'atom.common.use-lovable-1shot',
]

describe('anchor.ai-content-creator.start (W46)', () => {
  it('resolves persona.ai-content-creator to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-content-creator')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.ai-content-creator.start')
    expect(anchor?.personaId).toBe('persona.ai-content-creator')
  })

  it('places a "AI 出力サンプルが完成する" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-content-creator')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('does not contain CLI / git / code-review engineer atoms (Vision 逆転防止)', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-content-creator')
    for (const forbidden of FORBIDDEN_ENGINEER_ATOMS) {
      expect(anchor?.orderedAtomIds).not.toContain(forbidden)
    }
  })

  it('has 5 ordered_atom_ids (no-code-first 5-step)', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-content-creator')
    expect(anchor?.orderedAtomIds.length).toBe(5)
  })
})

describe('anchor.ai-automation.start (W46)', () => {
  it('resolves persona.ai-automation to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-automation')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.ai-automation.start')
    expect(anchor?.personaId).toBe('persona.ai-automation')
  })

  it('places a "動く自動化が画面に出る" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-automation')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('does not contain CLI / git / scaffold engineer atoms (Vision 逆転防止)', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-automation')
    for (const forbidden of FORBIDDEN_ENGINEER_ATOMS) {
      expect(anchor?.orderedAtomIds).not.toContain(forbidden)
    }
  })

  it('contains automation roadmap as a closing step', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-automation')
    expect(anchor?.orderedAtomIds).toContain('atom.office-automator.create-automation-roadmap')
  })
})

describe('anchor.ai-freelancer.start (W46)', () => {
  it('resolves persona.ai-freelancer to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-freelancer')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.ai-freelancer.start')
    expect(anchor?.personaId).toBe('persona.ai-freelancer')
  })

  it('places a "AI が副業サンプル成果物を返す" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-freelancer')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('does not contain CLI / git / scaffold engineer atoms (Vision 逆転防止)', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-freelancer')
    for (const forbidden of FORBIDDEN_ENGINEER_ATOMS) {
      expect(anchor?.orderedAtomIds).not.toContain(forbidden)
    }
  })

  it('includes first-job-strategy so 1 件目の獲得が plan に含まれる', async () => {
    const anchor = await resolvePersonaAnchor('persona.ai-freelancer')
    expect(anchor?.orderedAtomIds).toContain('atom.ai-freelancer.first-job-strategy')
  })
})

describe('W46 Anchor expansion contract: 6/9 → 9/9', () => {
  it('all 3 new persona ids resolve (non-null)', async () => {
    const personaIds = [
      'persona.ai-freelancer',
      'persona.ai-content-creator',
      'persona.ai-automation',
    ]

    const anchors = await Promise.all(personaIds.map((p) => resolvePersonaAnchor(p)))
    for (const anchor of anchors) {
      expect(anchor).not.toBeNull()
      expect((anchor?.orderedAtomIds.length ?? 0) > 0).toBe(true)
    }
  })

  it('every new anchor has at least one required_capability declared', async () => {
    const personaIds = [
      'persona.ai-freelancer',
      'persona.ai-content-creator',
      'persona.ai-automation',
    ]
    for (const personaId of personaIds) {
      const anchor = await resolvePersonaAnchor(personaId)
      expect(anchor?.requiredCapabilities.length ?? 0).toBeGreaterThan(0)
    }
  })
})
