#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runZaiSnapshot } from '../src/lib/operations/zai-snapshot.ts'

export const DEFAULT_ZAI_SNAPSHOT_OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../.agent-work/2026-04-25_tq-200_hearing-403-rca/zai-snapshot.json',
)

export function readZaiSnapshotCliOptions(env = process.env) {
  return {
    baseUrl: env.ZAI_SNAPSHOT_BASE_URL ?? env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    outputPath: env.ZAI_SNAPSHOT_OUTPUT ?? DEFAULT_ZAI_SNAPSHOT_OUTPUT,
  }
}

export async function writeZaiSnapshotReport(entries, outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  const payload = `${JSON.stringify(entries, null, 2)}\n`
  await writeFile(outputPath, payload, 'utf8')
  return payload
}

export async function main() {
  const { baseUrl, outputPath } = readZaiSnapshotCliOptions()
  const entries = await runZaiSnapshot({ baseUrl })
  const payload = await writeZaiSnapshotReport(entries, outputPath)

  process.stdout.write(payload)
  process.stderr.write(`zai snapshot written: ${outputPath}\n`)
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`zai snapshot failed: ${message}\n`)
    process.exitCode = 1
  })
}
