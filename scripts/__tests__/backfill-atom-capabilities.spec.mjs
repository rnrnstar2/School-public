import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { runBackfill } from '../backfill-atom-capabilities.mjs'
import { runValidation } from '../ci/validate-atoms.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const SCHEMA_PATH = path.join(REPO_ROOT, 'lesson-factory', 'schemas', 'atom.schema.json')

function fixturePath(name) {
  return path.join(FIXTURES_DIR, name)
}

function writeYamlToTemp(name, content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backfill-atom-capabilities-'))
  const target = path.join(dir, name)
  writeFileSync(target, content, 'utf8')
  return target
}

function writeCapabilityMasterFixture() {
  return writeYamlToTemp(
    'capabilities.yaml',
    `version: 1
generated_at: '2026-04-18'
capabilities:
  - id: canonical-capability
    label: Canonical Capability
    description: Test fixture capability
    synonyms:
      - alias-capability
    deprecated_aliases:
      - deprecated-capability
`,
  )
}

function writeAtomFixtureToTempDir(name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'backfill-atoms-'))
  const atomsDir = path.join(dir, 'atoms')
  mkdirSync(atomsDir)

  const target = path.join(atomsDir, name)
  writeFileSync(target, readFileSync(fixturePath(name)))

  return {
    atomsDir,
    filePath: target,
    logPath: path.join(dir, 'backfill-log.md'),
  }
}

test('dedupes canonicalized capability arrays before validation', async () => {
  const capabilitiesPath = writeCapabilityMasterFixture()
  const { atomsDir, filePath, logPath } = writeAtomFixtureToTempDir(
    'atom.alias-canonical-duplicate.yaml',
  )

  const backfillSummary = await runBackfill({
    atomsDir,
    capabilitiesPath,
    dryRun: false,
    logPath,
  })

  assert.equal(backfillSummary.filesScanned, 1)
  assert.equal(backfillSummary.changedFiles, 1)
  assert.equal(backfillSummary.aliasReplacements, 1)
  assert.equal(backfillSummary.deprecatedReplacements, 0)
  assert.equal(backfillSummary.dedupeRemovals, 1)

  assert.deepEqual(
    backfillSummary.records[0].replacements.map((replacement) => ({
      fieldName: replacement.fieldName,
      index: replacement.index,
      reason: replacement.reason,
      from: replacement.from ?? null,
      to: replacement.to ?? null,
      value: replacement.value ?? null,
    })),
    [
      {
        fieldName: 'capability_outputs',
        index: 0,
        reason: 'alias',
        from: 'alias-capability',
        to: 'canonical-capability',
        value: null,
      },
      {
        fieldName: 'capability_outputs',
        index: 1,
        reason: 'dedupe',
        from: null,
        to: null,
        value: 'canonical-capability',
      },
    ],
  )

  const rewritten = readFileSync(filePath, 'utf8')
  assert.equal((rewritten.match(/canonical-capability/g) ?? []).length, 1)
  assert.doesNotMatch(rewritten, /alias-capability/)

  const validationSummary = await runValidation({
    atomFiles: [filePath],
    schemaPath: SCHEMA_PATH,
    capabilitiesPath,
  })

  assert.equal(validationSummary.warningCount, 0)
  assert.equal(validationSummary.schemaWarningCount, 0)
})
