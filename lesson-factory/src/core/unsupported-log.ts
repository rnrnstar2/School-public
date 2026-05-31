import { appendFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { getUnsupportedGoalsDir } from './paths.js'
import type { IntakeBundle, RunContext } from './types.js'

export async function appendUnsupportedGoal(
  bundle: IntakeBundle,
  context: RunContext,
  dryRun = false,
): Promise<string | undefined> {
  const outputPath = path.join(getUnsupportedGoalsDir(), 'unsupported-goals.jsonl')
  if (dryRun) {
    return undefined
  }

  await mkdir(getUnsupportedGoalsDir(), { recursive: true })
  const record = JSON.stringify({
    run_id: context.runId,
    timestamp: context.timestamp,
    classification: bundle.classification,
    classification_reason: bundle.classification_reason,
    goal: bundle.goal.summary,
    related_atom_ids: bundle.related_atom_ids,
  })
  await appendFile(outputPath, `${record}\n`, 'utf8')
  return outputPath
}
