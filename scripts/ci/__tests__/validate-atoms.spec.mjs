import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

import { runValidation } from '../validate-atoms.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const SCHEMA_PATH = path.join(REPO_ROOT, 'lesson-factory', 'schemas', 'atom.schema.json')
const CAPABILITIES_PATH = path.join(REPO_ROOT, 'docs', 'capabilities.yaml')

function fixturePath(name) {
  return path.join(FIXTURES_DIR, name)
}

function writeFixtureToTemp(name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'validate-atoms-'))
  const target = path.join(dir, name)
  writeFileSync(target, readFileSync(fixturePath(name)))
  return target
}

function writeYamlToTemp(name, content) {
  const dir = mkdtempSync(path.join(tmpdir(), 'validate-atoms-'))
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

test('accepts a valid atom fixture without warnings', async () => {
  const atomFile = writeFixtureToTemp('atom.valid.yaml')

  const summary = await runValidation({
    atomFiles: [atomFile],
    schemaPath: SCHEMA_PATH,
    capabilitiesPath: CAPABILITIES_PATH,
  })

  assert.equal(summary.filesScanned, 1)
  assert.equal(summary.warningCount, 0)
  assert.equal(summary.filesWithWarnings, 0)
})

test('warns when an atom fails schema validation', async () => {
  const atomFile = writeFixtureToTemp('atom.invalid.yaml')

  const summary = await runValidation({
    atomFiles: [atomFile],
    schemaPath: SCHEMA_PATH,
    capabilitiesPath: CAPABILITIES_PATH,
  })

  assert.equal(summary.filesScanned, 1)
  assert.equal(summary.warningCount, 1)
  assert.equal(summary.schemaWarningCount, 1)
  assert.equal(summary.warnings[0].kind, 'schema')
  assert.match(summary.warnings[0].message, /must be equal to one of the allowed values/)
})

test('warns when a capability id is not registered in the master list', async () => {
  const atomFile = writeFixtureToTemp('atom.unknown-capability.yaml')

  const summary = await runValidation({
    atomFiles: [atomFile],
    schemaPath: SCHEMA_PATH,
    capabilitiesPath: CAPABILITIES_PATH,
  })

  assert.equal(summary.filesScanned, 1)
  assert.equal(summary.warningCount, 1)
  assert.equal(summary.capabilityWarningCount, 1)
  assert.equal(summary.warnings[0].kind, 'capability')
  assert.match(summary.warnings[0].message, /unknown capability id/)
})

test('accepts capability aliases that normalize to a canonical id without warnings', async () => {
  const atomFile = writeFixtureToTemp('atom.alias-capability.yaml')
  const capabilitiesPath = writeCapabilityMasterFixture()

  const summary = await runValidation({
    atomFiles: [atomFile],
    schemaPath: SCHEMA_PATH,
    capabilitiesPath,
  })

  assert.equal(summary.filesScanned, 1)
  assert.equal(summary.warningCount, 0)
  assert.equal(summary.filesWithWarnings, 0)
})

test('warns when a deprecated capability alias is used', async () => {
  const atomFile = writeFixtureToTemp('atom.deprecated-alias-capability.yaml')
  const capabilitiesPath = writeCapabilityMasterFixture()

  const summary = await runValidation({
    atomFiles: [atomFile],
    schemaPath: SCHEMA_PATH,
    capabilitiesPath,
  })

  assert.equal(summary.filesScanned, 1)
  assert.equal(summary.warningCount, 1)
  assert.equal(summary.deprecatedAliasWarningCount, 1)
  assert.equal(summary.warnings[0].kind, 'deprecated_alias')
  assert.match(summary.warnings[0].message, /should be replaced with "canonical-capability"/)
})
