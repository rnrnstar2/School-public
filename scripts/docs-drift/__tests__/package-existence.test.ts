import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'

import {
  computePackageDrift,
  packageExistenceRule,
} from '../rules/package-existence'

const FIXTURE_DIR = path.join(__dirname, 'fixtures')

async function loadFixture(name: string) {
  return fs.readFile(path.join(FIXTURE_DIR, name), 'utf8')
}

describe('package-existence rule — core comparator', () => {
  it('emits a finding when README lists a package that does not exist on disk', async () => {
    const readme = await loadFixture('drift-readme.md')
    const findings = computePackageDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      workspaceContents: 'packages:\n  - "packages/*"\n',
      actualPackages: ['ui'],
    })

    // `packages/ghost` in the tree view should fire; `packages/ui` should not.
    const ghostFinding = findings.find(
      (f) => (f.data as { package?: string } | undefined)?.package === 'ghost',
    )
    expect(ghostFinding).toBeDefined()
    const uiFinding = findings.find(
      (f) => (f.data as { package?: string } | undefined)?.package === 'ui',
    )
    expect(uiFinding).toBeUndefined()
  })

  it('emits zero findings for the pass fixture', async () => {
    const readme = await loadFixture('pass-readme.md')
    const findings = computePackageDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      workspaceContents: 'packages:\n  - "packages/*"\n',
      actualPackages: ['ui'],
    })
    expect(findings).toEqual([])
  })

  it('ignores aspirational mentions ("今後")', () => {
    const readme = `
# repo
\`\`\`
├── packages/
│   ├── future-pkg/  # 共有設定（今後）
\`\`\`
`
    const findings = computePackageDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      workspaceContents: 'packages:\n  - "packages/*"\n',
      actualPackages: [],
    })
    expect(findings).toEqual([])
  })

  it('flags packages that exist on disk but are not covered by pnpm-workspace.yaml', () => {
    const readme = 'See packages/hidden for details.'
    const findings = computePackageDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      workspaceContents: 'packages:\n  - "apps/*"\n',
      actualPackages: ['hidden'],
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/not covered by pnpm-workspace.yaml/)
  })

  it('accepts explicit workspace entries without wildcard', () => {
    const readme = 'See packages/hidden for details.'
    const findings = computePackageDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      workspaceContents: 'packages:\n  - "packages/hidden"\n',
      actualPackages: ['hidden'],
    })
    expect(findings).toEqual([])
  })

  it('does not double-report when README uses both `packages/foo` and a tree view', () => {
    const readme = `
# mix
packages/ui is the shared library.

\`\`\`
├── packages/
│   ├── ui/
\`\`\`
`
    const findings = computePackageDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      workspaceContents: 'packages:\n  - "packages/*"\n',
      actualPackages: ['ui'],
    })
    expect(findings).toEqual([])
  })
})

describe('package-existence rule — end-to-end against repo root', () => {
  it('runs against the real repo without throwing and returns an array', async () => {
    const rootDir = path.resolve(__dirname, '..', '..', '..')
    const findings = await packageExistenceRule.run({ rootDir })
    expect(Array.isArray(findings)).toBe(true)
  })
})
