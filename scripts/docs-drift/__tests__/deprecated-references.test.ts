import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'

import {
  collectDeletedClaims,
  computeDeprecatedFindings,
  deprecatedReferencesRule,
} from '../rules/deprecated-references'

const FIXTURE_DIR = path.join(__dirname, 'fixtures')

async function loadFixture(name: string) {
  return fs.readFile(path.join(FIXTURE_DIR, name), 'utf8')
}

describe('deprecated-references — claim collection', () => {
  it('extracts backtick-quoted symbols from Japanese "削除済み" sentences', async () => {
    const readme = await loadFixture('drift-readme.md')
    const claims = collectDeletedClaims(readme, 'README.md')
    const symbols = claims.map((c) => c.symbol).sort()
    expect(symbols).toEqual(['__fixture_ghost_symbol__', 'phantom-registry'])
  })

  it('captures all backticked symbols on a line that declares multiple deletions', () => {
    const readme = [
      '# multi-symbol deletion line',
      '旧 `alpha-module` と `beta-module`、`gamma-module` は Phase 7 で完全削除済みです。',
    ].join('\n')
    const symbols = collectDeletedClaims(readme, 'README.md')
      .map((c) => c.symbol)
      .sort()
    expect(symbols).toEqual(['alpha-module', 'beta-module', 'gamma-module'])
  })
})

describe('deprecated-references — comparator', () => {
  it('emits zero findings when the deprecated file truly does not exist', async () => {
    const readme = await loadFixture('drift-readme.md')
    const findings = await computeDeprecatedFindings({
      readmePath: 'README.md',
      readmeContents: readme,
      rootDir: '/does/not/matter',
      // Everything reports missing.
      exists: async () => false,
    })
    expect(findings).toEqual([])
  })

  it('emits a finding when the deprecated file still lives somewhere we probe', async () => {
    const readme = await loadFixture('drift-readme.md')
    const findings = await computeDeprecatedFindings({
      readmePath: 'README.md',
      readmeContents: readme,
      rootDir: '/does/not/matter',
      exists: async (probe) => probe.endsWith('phantom-registry.ts'),
      candidatePaths: (symbol) => [
        `apps/web/src/lib/${symbol}.ts`,
        `apps/web/src/${symbol}.ts`,
      ],
    })
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].message).toMatch(/phantom-registry/)
  })

  it('allows pass fixtures to produce no findings for truly deleted symbols', async () => {
    const readme = await loadFixture('pass-readme.md')
    const findings = await computeDeprecatedFindings({
      readmePath: 'README.md',
      readmeContents: readme,
      rootDir: '/does/not/matter',
      exists: async () => false,
    })
    expect(findings).toEqual([])
  })

  it('supports english "deleted" phrasing', async () => {
    const readme =
      '`old-thing` was deleted in v2. `new-thing` was removed in v3.'
    const claims = collectDeletedClaims(readme, 'README.md')
    const symbols = claims.map((c) => c.symbol).sort()
    expect(symbols).toEqual(['new-thing', 'old-thing'])
  })
})

describe('deprecated-references rule — end-to-end against repo root', () => {
  it('runs against the real repo without throwing and returns an array', async () => {
    const rootDir = path.resolve(__dirname, '..', '..', '..')
    const findings = await deprecatedReferencesRule.run({ rootDir })
    expect(Array.isArray(findings)).toBe(true)
  })
})
