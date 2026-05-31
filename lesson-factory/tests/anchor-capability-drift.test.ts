/**
 * W15 B2 (Codex Option A): anchor `required_capabilities` ↔ yaml
 * `capability_outputs` 不変条件のテスト。
 *
 * 目的:
 *  1. 全 anchor yaml の整合性が一度成立した後、誰かが anchor.required_capabilities を
 *     yaml と非整合な値に書き換えたら CI で fail させる (drift 再発防止)。
 *  2. lint script (validate-anchor-references.mjs) が drift 入りの fixture で
 *     確実に fail することを test する。
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// @ts-expect-error mjs without types
import { runAudit } from '../../scripts/audit-anchor-capability-drift.mjs'
// @ts-expect-error mjs without types
import { validateAnchors, loadAtomMap } from '../scripts/validate-anchor-references.mjs'

function writeFixtureRepo(): { atomsDir: string; anchorsDir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'anchor-drift-fixture-'))
  const atomsDir = path.join(dir, 'atoms')
  const anchorsDir = path.join(dir, 'anchors')
  mkdirSync(atomsDir)
  mkdirSync(anchorsDir)
  return { atomsDir, anchorsDir }
}

function writeAtom(atomsDir: string, id: string, capabilityOutputs: string[]): void {
  writeFileSync(
    path.join(atomsDir, `${id}.yaml`),
    [
      `id: ${id}`,
      `title: fixture`,
      `summary: fixture`,
      `persona_tags: [web-builder]`,
      `goal_tags: [validation]`,
      `capability_inputs: []`,
      `capability_outputs:`,
      ...capabilityOutputs.map((c) => `  - ${c}`),
      `hard_prerequisites: []`,
      `soft_prerequisites: []`,
      `deliverable: { type: markdown_doc, validation: basic_manual_check_v1 }`,
      `evidence: [screenshot]`,
      `media_slots: []`,
      `freshness_sources: []`,
      `status: draft`,
    ].join('\n'),
  )
}

function writeAnchor(
  anchorsDir: string,
  id: string,
  orderedAtomIds: string[],
  requiredCapabilities: string[],
): void {
  writeFileSync(
    path.join(anchorsDir, `${id}.yaml`),
    [
      `id: ${id}`,
      `persona_id: persona.fixture`,
      `ordered_atom_ids:`,
      ...orderedAtomIds.map((a) => `  - ${a}`),
      `required_capabilities:`,
      ...requiredCapabilities.map((c) => `  - ${c}`),
      `description: fixture`,
    ].join('\n'),
  )
}

describe('audit-anchor-capability-drift (real repo)', () => {
  it('reports zero drift across all anchor yaml after W15 B2 fix', async () => {
    const result = await runAudit()
    if (result.summary.drifts !== 0) {
      // include the drift list in the failure message for easier triage
      // eslint-disable-next-line no-console
      console.error(JSON.stringify(result.drifts, null, 2))
    }
    expect(result.summary.drifts).toBe(0)
    expect(result.summary.anchors).toBeGreaterThanOrEqual(11)
  })
})

describe('audit-anchor-capability-drift (fixture)', () => {
  it('detects cap-not-in-yaml drift', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAtom(atomsDir, 'atom.fixture.alpha', ['real-cap-from-yaml'])
    writeAnchor(anchorsDir, 'anchor.fixture.start', ['atom.fixture.alpha'], ['drifted-cap'])

    const result = await runAudit({ atomsDir, anchorsDir })
    expect(result.summary.drifts).toBe(1)
    expect(result.drifts[0].kind).toBe('cap-not-in-yaml')
    expect(result.drifts[0].expected_in_anchor).toBe('drifted-cap')
    expect(result.drifts[0].actual_capability_outputs).toEqual(['real-cap-from-yaml'])
  })

  it('detects length-mismatch drift', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAtom(atomsDir, 'atom.fixture.alpha', ['cap-a'])
    writeAtom(atomsDir, 'atom.fixture.beta', ['cap-b'])
    // 2 atoms but 1 capability (length mismatch)
    writeAnchor(
      anchorsDir,
      'anchor.fixture.start',
      ['atom.fixture.alpha', 'atom.fixture.beta'],
      ['cap-a'],
    )

    const result = await runAudit({ atomsDir, anchorsDir })
    expect(result.drifts.some((d: { kind: string }) => d.kind === 'length-mismatch')).toBe(true)
  })

  it('detects atom-missing drift when anchor references unknown atom', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAnchor(anchorsDir, 'anchor.fixture.start', ['atom.fixture.missing'], ['cap-a'])

    const result = await runAudit({ atomsDir, anchorsDir })
    expect(result.drifts.some((d: { kind: string }) => d.kind === 'atom-missing')).toBe(true)
  })

  it('returns zero drift when anchor matches yaml', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAtom(atomsDir, 'atom.fixture.alpha', ['cap-a', 'cap-b'])
    writeAnchor(anchorsDir, 'anchor.fixture.start', ['atom.fixture.alpha'], ['cap-a'])

    const result = await runAudit({ atomsDir, anchorsDir })
    expect(result.summary.drifts).toBe(0)
  })
})

describe('validateAnchors lint (fixture)', () => {
  it('emits error when required_capabilities references a value not in atom capability_outputs', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAtom(atomsDir, 'atom.fixture.alpha', ['real-cap'])
    writeAnchor(anchorsDir, 'anchor.fixture.start', ['atom.fixture.alpha'], ['drifted-cap'])

    const atomsMap = await loadAtomMap(atomsDir)
    const errors = await validateAnchors({ anchorsDirectory: anchorsDir, atomsMap })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.some((line: string) => line.includes('drifted-cap'))).toBe(true)
  })

  it('emits no error when anchor capabilities align with yaml capability_outputs', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAtom(atomsDir, 'atom.fixture.alpha', ['real-cap'])
    writeAnchor(anchorsDir, 'anchor.fixture.start', ['atom.fixture.alpha'], ['real-cap'])

    const atomsMap = await loadAtomMap(atomsDir)
    const errors = await validateAnchors({ anchorsDirectory: anchorsDir, atomsMap })
    expect(errors).toEqual([])
  })

  it('emits length-mismatch error', async () => {
    const { atomsDir, anchorsDir } = writeFixtureRepo()
    writeAtom(atomsDir, 'atom.fixture.alpha', ['cap-a'])
    writeAtom(atomsDir, 'atom.fixture.beta', ['cap-b'])
    writeAnchor(
      anchorsDir,
      'anchor.fixture.start',
      ['atom.fixture.alpha', 'atom.fixture.beta'],
      ['cap-a'],
    )

    const atomsMap = await loadAtomMap(atomsDir)
    const errors = await validateAnchors({ anchorsDirectory: anchorsDir, atomsMap })
    expect(errors.some((line: string) => line.includes('length'))).toBe(true)
  })
})
