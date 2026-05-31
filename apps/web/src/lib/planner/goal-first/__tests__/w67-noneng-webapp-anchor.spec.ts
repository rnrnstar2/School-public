/**
 * W67 — `persona.noneng-webapp` anchor 化の regression test。
 *
 * Audit A4 b 軸 NO-GO + B4 #3 の解消を契約化する。
 *
 * 元状態:
 *   `persona.noneng-webapp` は `apps/web/src/lib/planner/graduation/calc.ts`
 *   の matrix では canonical key として既に使われていたが、
 *   `lesson-factory/lessons/anchors/` に対応 yaml が無く、
 *   `live-hearing-service.ts` の SUPPORTED_PERSONA_IDS にも載っていなかった。
 *   結果、live-hearing path で persona は黙って drop され、
 *   `fetchAnchorForPersona()` も null、yaml fallback も null で
 *   plan 側に発火しない synthetic persona 状態だった。9 persona 全開 GO の blocker。
 *
 * 本 W67 で:
 *   - `lesson-factory/lessons/anchors/noneng-webapp.yaml` を新規 land
 *   - `apps/web/supabase/migrations/20260509180000_noneng_webapp_anchor.sql` で
 *     DB 側 lesson_anchors に `anchor.noneng-webapp.default` を upsert
 *   - `SUPPORTED_PERSONA_IDS` (live-hearing / hearing-onboarding-utils) に追加
 *   - `LOCAL_ANCHOR_PATHS_BY_PERSONA` (persona-anchor.ts) に lookup 追加
 *
 * 本 spec は yaml fallback 経路を契約化する (DB anchor 経路は別 spec
 * `anchor-db-seed-9-of-9.spec.ts` のスタイルに整合させる前提だが、本 worker
 * は yaml + lookup を land する責務のみ担う)。
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/atoms/atom-repository', () => ({
  // DB anchor を取らせない (local YAML を使わせる)
  fetchAnchorForPersona: vi.fn().mockResolvedValue(null),
}))

import { resolvePersonaAnchor } from '../persona-anchor'

/**
 * 「Vision 完全逆転」を引き起こす engineer-only atom 集合。
 * 非エンジニア向け anchor の 1 step 目に来てはいけない atom。
 */
const FORBIDDEN_FIRST_STEP_ATOMS = [
  'atom.web-builder.terminal-basics',
  'atom.web-builder.node-pnpm-setup',
  'atom.web-builder.git-github-cli',
  'atom.web-builder.create-next-app',
  'atom.web-builder.install-shadcn',
  'atom.web-builder.create-homepage',
]

/**
 * 「1 step 目で画面に何か出る」性質を持つ atom id 集合。
 */
const PRODUCES_OUTPUT_FIRST_STEP = new Set<string>([
  'atom.common.scaffold-with-bolt',
  'atom.common.scaffold-with-v0',
  'atom.common.use-lovable-1shot',
  'atom.web-builder.let-claude-build-everything',
])

describe('anchor.noneng-webapp.start (W67)', () => {
  it('resolves persona.noneng-webapp to a non-null anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.noneng-webapp')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.noneng-webapp.start')
    expect(anchor?.personaId).toBe('persona.noneng-webapp')
  })

  it('has step_count >= 1 (non-empty ordered_atom_ids)', async () => {
    const anchor = await resolvePersonaAnchor('persona.noneng-webapp')
    expect(anchor?.orderedAtomIds.length ?? 0).toBeGreaterThanOrEqual(1)
  })

  it('places a no-code-first atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.noneng-webapp')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    expect(PRODUCES_OUTPUT_FIRST_STEP.has(firstAtomId)).toBe(true)
  })

  it('does not place CLI / git / textbook setup atoms at position 0 (Vision 逆転防止)', async () => {
    const anchor = await resolvePersonaAnchor('persona.noneng-webapp')
    const firstAtomId = anchor?.orderedAtomIds[0] ?? ''
    for (const forbidden of FORBIDDEN_FIRST_STEP_ATOMS) {
      expect(firstAtomId).not.toBe(forbidden)
    }
  })

  it('declares at least one required_capability', async () => {
    const anchor = await resolvePersonaAnchor('persona.noneng-webapp')
    expect(anchor?.requiredCapabilities.length ?? 0).toBeGreaterThan(0)
  })
})
