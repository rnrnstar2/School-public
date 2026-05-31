#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..', '..')
const TEST_DIR = resolve(ROOT, 'scripts/swarm/__tests__')

export function discoverSwarmNodeTestFiles(dir = TEST_DIR) {
  const discovered = []

  const walk = (currentDir) => {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue

      const fullPath = resolve(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'fixtures') continue
        walk(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.spec.mjs')) {
        discovered.push(fullPath)
      }
    }
  }

  walk(dir)
  return discovered.sort()
}

export function buildNodeTestArgs(extraArgs = []) {
  const files = discoverSwarmNodeTestFiles()
  if (files.length === 0) {
    throw new Error(`no node:test files found under ${TEST_DIR}`)
  }
  return ['--test', ...extraArgs, ...files]
}

export function runSwarmNodeTests(extraArgs = []) {
  const result = spawnSync(process.execPath, buildNodeTestArgs(extraArgs), {
    cwd: ROOT,
    stdio: 'inherit',
  })

  if (typeof result.status === 'number') {
    return result.status
  }

  if (result.error) {
    throw result.error
  }

  return 1
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    process.exit(runSwarmNodeTests(process.argv.slice(2)))
  } catch (error) {
    console.error(`!! run-node-tests failed: ${error.message}`)
    process.exit(1)
  }
}
