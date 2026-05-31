import { describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'

import { computePortDrift, portConsistencyRule } from '../rules/port-consistency'
import {
  playwright3200,
  playwright3000,
  playwrightMissing,
} from './fixtures/playwright-3200'

const FIXTURE_DIR = path.join(__dirname, 'fixtures')

async function loadFixture(name: string) {
  return fs.readFile(path.join(FIXTURE_DIR, name), 'utf8')
}

describe('port-consistency rule — core comparator', () => {
  it('emits a finding when README port (3000) disagrees with playwright default (3200)', async () => {
    const readmeContents = await loadFixture('drift-readme.md')
    const findings = computePortDrift({
      readmePath: 'README.md',
      readmeContents,
      playwrightPath: 'apps/web/playwright.config.ts',
      playwrightContents: playwright3200,
      e2eReadmePath: 'apps/web/e2e/README.md',
      e2eReadmeContents: null,
    })

    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0].data).toMatchObject({
      expected: '3200',
      actual: '3000',
    })
  })

  it('emits zero findings when README + e2e README both agree with the source of truth', async () => {
    const readmeContents = await loadFixture('pass-readme.md')
    const findings = computePortDrift({
      readmePath: 'README.md',
      readmeContents,
      playwrightPath: 'apps/web/playwright.config.ts',
      playwrightContents: playwright3200,
      e2eReadmePath: 'apps/web/e2e/README.md',
      e2eReadmeContents: '# e2e\n\nPlaywright defaults to port 3200.',
    })

    expect(findings).toEqual([])
  })

  it('emits a finding when the E2E README disagrees with playwright default', () => {
    const findings = computePortDrift({
      readmePath: 'README.md',
      readmeContents: 'root readme',
      playwrightPath: 'apps/web/playwright.config.ts',
      playwrightContents: playwright3200,
      e2eReadmePath: 'apps/web/e2e/README.md',
      e2eReadmeContents: 'Helpers assume --port 3000 for the web server.',
    })

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/E2E README documents port 3000/)
  })

  it('warns loudly when the playwright config default cannot be parsed', () => {
    const findings = computePortDrift({
      readmePath: 'README.md',
      readmeContents: 'web dev server: port 3200',
      playwrightPath: 'apps/web/playwright.config.ts',
      playwrightContents: playwrightMissing,
      e2eReadmePath: 'apps/web/e2e/README.md',
      e2eReadmeContents: null,
    })

    expect(findings).toHaveLength(1)
    expect(findings[0].message).toMatch(/could not locate PLAYWRIGHT_WEB_PORT/)
  })

  it('does not flag Supabase / admin ports that appear alongside the web port', () => {
    const readme = `
# Readme
- web: port 3200
- admin: port 3001
- supabase: localhost:54341
`
    const findings = computePortDrift({
      readmePath: 'README.md',
      readmeContents: readme,
      playwrightPath: 'apps/web/playwright.config.ts',
      playwrightContents: playwright3200,
      e2eReadmePath: 'apps/web/e2e/README.md',
      e2eReadmeContents: null,
    })
    expect(findings).toEqual([])
  })

  it('does still flag when playwright default is 3000 and README says 3200', () => {
    const findings = computePortDrift({
      readmePath: 'README.md',
      readmeContents: 'web dev server: port 3200',
      playwrightPath: 'apps/web/playwright.config.ts',
      playwrightContents: playwright3000,
      e2eReadmePath: 'apps/web/e2e/README.md',
      e2eReadmeContents: null,
    })
    expect(findings).toHaveLength(1)
    expect(findings[0].data).toMatchObject({ expected: '3000', actual: '3200' })
  })
})

describe('port-consistency rule — end-to-end against repo root', () => {
  it('produces at least one finding against the current tree (README drifted from playwright)', async () => {
    const rootDir = path.resolve(__dirname, '..', '..', '..')
    const findings = await portConsistencyRule.run({ rootDir })
    // Spec AC TQ-134-04 requires at least one finding in the current tree.
    expect(findings.length).toBeGreaterThan(0)
  })
})
