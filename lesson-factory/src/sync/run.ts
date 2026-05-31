import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveLessonFactoryPath } from '../core/paths.js'

import { loadSyncSources } from './load.js'
import { buildSyncPlan } from './plan.js'
import { createSupabaseSyncRepository } from './repository.js'
import type { SyncPlan, SyncRepository, SyncResult } from './types.js'

function createLogFileName(timestamp: string): string {
  return `${timestamp.replaceAll(':', '-')}.json`
}

async function writeSyncLog(plan: SyncPlan): Promise<string> {
  const logDirectory = resolveLessonFactoryPath('logs', 'sync')
  await mkdir(logDirectory, { recursive: true })

  const logPath = path.join(logDirectory, createLogFileName(plan.generatedAt))
  await writeFile(logPath, JSON.stringify(plan, null, 2), 'utf8')
  return logPath
}

export async function runLessonSync({
  dryRun = false,
  repository = createSupabaseSyncRepository(),
  now = new Date(),
}: {
  dryRun?: boolean
  repository?: SyncRepository
  now?: Date
} = {}): Promise<SyncResult> {
  const generatedAt = now.toISOString()
  const [sources, snapshot] = await Promise.all([
    loadSyncSources(),
    repository.loadSnapshot(),
  ])

  const plan = buildSyncPlan({
    sources,
    snapshot,
    dryRun,
    generatedAt,
  })

  if (!dryRun && plan.counts.totalChanges > 0) {
    await repository.applyPlan(plan)
  }

  const logPath = await writeSyncLog(plan)
  return { plan, logPath }
}

export function formatPlanForConsole(plan: SyncPlan): string {
  const lines = [
    `dry-run: ${plan.dryRun ? 'yes' : 'no'}`,
    `generated-at: ${plan.generatedAt}`,
    `atom changes: ${plan.counts.atomChanges}`,
    `persona changes: ${plan.counts.personaChanges}`,
    `anchor changes: ${plan.counts.anchorChanges}`,
    `total changes: ${plan.counts.totalChanges}`,
  ]

  const entries = [
    ...plan.atoms.filter((item) => item.state !== 'noop').map((item) => `atom ${item.atomId}: ${item.state} (${item.reason})`),
    ...plan.personas.filter((item) => item.state !== 'noop').map((item) => `persona ${item.personaId}: ${item.state} (${item.reason})`),
    ...plan.anchors.filter((item) => item.state !== 'noop').map((item) => `anchor ${item.anchorId}: ${item.state} (${item.reason})`),
  ]

  if (entries.length > 0) {
    lines.push('changes:')
    lines.push(...entries.map((entry) => `  - ${entry}`))
  }

  if (plan.warnings.length > 0) {
    lines.push('warnings:')
    lines.push(...plan.warnings.map((warning) => `  - ${warning}`))
  }

  return lines.join('\n')
}
