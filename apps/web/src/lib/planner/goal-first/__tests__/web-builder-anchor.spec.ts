/**
 * TQ-217 / PJ-NONENG-WEBAPP-01 — web-builder anchor の教科書順序解体 regression test。
 *
 * 旧: anchor.web-builder.start の ordered_atom_ids[0] が
 *      atom.web-builder.terminal-basics で、画面に何か出るのは 7 step 目だった。
 * 新: 1 step 目で画面に何か出る no-code-first atom (v0 / Bolt / Lovable / let-claude)
 *     を先頭にする。CLI 系 (terminal-basics / node-pnpm-setup / git-github-cli /
 *     create-next-app / install-shadcn) は anchor.web-builder.cli へ退避済み。
 *
 * Owner Vision「非エンジニアが最短でゴール達成」(P-NONENG-WEBAPP) を契約化する。
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/atoms/atom-repository', () => ({
  // DB anchor を取らせない (local YAML を使わせる)
  fetchAnchorForPersona: vi.fn().mockResolvedValue(null),
}))

import { resolvePersonaAnchor } from '../persona-anchor'

const NO_CODE_FIRST_ATOM_IDS = new Set<string>([
  'atom.common.scaffold-with-v0',
  'atom.common.scaffold-with-bolt',
  'atom.common.use-lovable-1shot',
  'atom.web-builder.let-claude-build-everything',
])

const FORBIDDEN_FIRST_ATOM_IDS = [
  'atom.web-builder.terminal-basics',
  'atom.web-builder.node-pnpm-setup',
  'atom.web-builder.git-github-cli',
  'atom.web-builder.create-next-app',
  'atom.web-builder.install-shadcn',
]

describe('anchor.web-builder.start (post TQ-217)', () => {
  it('places a no-code "画面に何か出る" atom at ordered_atom_ids[0]', async () => {
    const anchor = await resolvePersonaAnchor('persona.web-builder')
    expect(anchor).not.toBeNull()
    expect(anchor?.anchorId).toBe('anchor.web-builder.start')

    const firstAtomId = anchor?.orderedAtomIds[0]
    expect(firstAtomId).toBeDefined()
    expect(NO_CODE_FIRST_ATOM_IDS.has(firstAtomId ?? '')).toBe(true)
  })

  it('does not contain CLI textbook atoms in the default web-builder anchor', async () => {
    const anchor = await resolvePersonaAnchor('persona.web-builder')
    expect(anchor).not.toBeNull()

    for (const forbidden of FORBIDDEN_FIRST_ATOM_IDS) {
      expect(anchor?.orderedAtomIds).not.toContain(forbidden)
    }
  })

  it('keeps a regression CLI anchor alive for P-ENG-PROTOTYPE callers', async () => {
    const cliAnchor = await resolvePersonaAnchor('persona.web-builder.cli')
    // The CLI anchor is a regression-only anchor; we only assert it loads when
    // someone intentionally requests it. If it returns null, the regression
    // path is gone and CLI textbook coverage has been lost.
    expect(cliAnchor).not.toBeNull()
    expect(cliAnchor?.anchorId).toBe('anchor.web-builder.cli')
    // Sanity: the CLI anchor still has the textbook 7-step shape so engineer
    // prototype tests can opt back into it via this anchor.
    expect(cliAnchor?.orderedAtomIds).toContain('atom.web-builder.terminal-basics')
    expect(cliAnchor?.orderedAtomIds).toContain('atom.web-builder.create-next-app')
  })
})
