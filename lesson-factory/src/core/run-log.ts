import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import {
  createStageArtifactPath,
  createTimestampForFile,
  getRunsLogDir,
} from './paths.js'
import type { RunContext, StageName } from './types.js'
import { stringifyYaml } from './yaml-io.js'

export function createRunContext(stage: StageName, runId?: string): RunContext {
  return {
    runId: runId ?? randomUUID(),
    timestamp: createTimestampForFile(),
    stage,
  }
}

export async function writeStageOutput(
  context: RunContext,
  format: 'json' | 'yaml',
  value: unknown,
  dryRun = false,
): Promise<string | undefined> {
  const outputPath = createStageArtifactPath(context.timestamp, context.stage, format)
  if (dryRun) {
    return undefined
  }

  await mkdir(getRunsLogDir(), { recursive: true })
  const payload = format === 'json' ? JSON.stringify(value, null, 2) : stringifyYaml(value)
  await writeFile(outputPath, payload, 'utf8')
  return outputPath
}

export async function writeStageMeta(
  context: RunContext,
  metadata: Record<string, unknown>,
  dryRun = false,
): Promise<string | undefined> {
  const outputPath = createStageArtifactPath(context.timestamp, context.stage, 'json', '.meta')
  if (dryRun) {
    return undefined
  }

  await mkdir(getRunsLogDir(), { recursive: true })
  const payload = {
    run_id: context.runId,
    stage: context.stage,
    timestamp: context.timestamp,
    ...metadata,
  }
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  return outputPath
}

export async function writeStageError(
  context: RunContext,
  error: unknown,
  dryRun = false,
  stderr?: string,
): Promise<string | undefined> {
  const outputPath = createStageArtifactPath(context.timestamp, context.stage, 'json', '-error')
  if (dryRun) {
    return undefined
  }

  const payload = {
    run_id: context.runId,
    stage: context.stage,
    timestamp: context.timestamp,
    stderr: stderr ?? '',
    error: serializeError(error),
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8')
  return outputPath
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const extras: Record<string, unknown> = {}
    for (const key of Object.getOwnPropertyNames(error)) {
      if (key === 'name' || key === 'message' || key === 'stack') continue
      extras[key] = (error as unknown as Record<string, unknown>)[key]
    }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? '',
      ...extras,
    }
  }

  return {
    name: 'UnknownError',
    message: String(error),
  }
}
