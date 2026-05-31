import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildNodeTestArgs, discoverSwarmNodeTestFiles } from '../run-node-tests.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..', '..')
const SELF = fileURLToPath(import.meta.url)
const MANIFEST = resolve(ROOT, 'docs/swarmops/journey-manifest.yaml')

test('discoverSwarmNodeTestFiles scopes to scripts/swarm/__tests__ node:test specs', () => {
  const files = discoverSwarmNodeTestFiles()

  assert.ok(files.length >= 2, `expected at least 2 swarm script tests, got ${files.length}`)
  assert.ok(files.some((file) => file.endsWith('generate-task-queue.spec.mjs')))
  assert.ok(files.some((file) => file.endsWith('run-node-tests.spec.mjs')))
  assert.ok(files.every((file) => file.startsWith(resolve(ROOT, 'scripts/swarm/__tests__'))))
  assert.ok(files.every((file) => file.endsWith('.spec.mjs')))
  assert.ok(files.every((file) => existsSync(file)))
  assert.ok(files.every((file) => !file.includes('/fixtures/')))
})

test('buildNodeTestArgs emits absolute node:test targets for the scoped runner', () => {
  const args = buildNodeTestArgs(['--test-reporter=tap'])

  assert.equal(args[0], '--test')
  assert.equal(args[1], '--test-reporter=tap')
  assert.ok(args.slice(2).every((file) => file.startsWith(ROOT)))
  assert.ok(args.slice(2).every((file) => file.endsWith('.spec.mjs')))
})

test('unit_nodes keeps TQ-122-01 out of Playwright drift detection while preserving its node:test path', () => {
  const manifest = readFileSync(MANIFEST, 'utf8')
  const nodesStart = manifest.indexOf('\nnodes:\n')
  const unitNodesStart = manifest.indexOf('\nunit_nodes:\n')
  const nodesBlock = manifest.slice(nodesStart, unitNodesStart)

  assert.match(manifest, /unit_nodes:/)
  assert.match(manifest, /- id: TQ-122-01/)
  assert.match(manifest, /spec_file: scripts\/swarm\/__tests__\/generate-task-queue\.spec\.mjs/)
  assert.ok(nodesStart >= 0, 'expected manifest nodes section')
  assert.ok(unitNodesStart > nodesStart, 'expected unit_nodes section after nodes')
  assert.doesNotMatch(nodesBlock, /spec_file: scripts\/swarm\/__tests__\/generate-task-queue\.spec\.mjs/)
})

test('scoped node --test command passes for discovered swarm script specs', () => {
  const files = discoverSwarmNodeTestFiles().filter((file) => file !== SELF)
  assert.ok(files.length >= 1, 'expected at least one other swarm script test file')

  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: ROOT,
    encoding: 'utf8',
  })

  const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  assert.equal(result.status, 0, combinedOutput)
})
