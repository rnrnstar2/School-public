import { readFile } from 'node:fs/promises'

import { Command } from 'commander'

import { runDraftPipeline } from '../../pipelines/draft.js'
import type { FreshContextBundle } from '../../core/types.js'

export function registerDraftCommand(program: Command): void {
  program
    .command('draft')
    .description('Generate a lesson draft from an intake bundle')
    .argument('<intake-bundle>', 'Path to intake bundle YAML')
    .option('--dry-run', 'Validate without writing files')
    .option('--adapter <name>', 'Override draft adapter (claude-code|gemini|mock)')
    .option('--context <path>', 'Optional FreshContextBundle JSON from lesson:research')
    .action(
      async (
        intakeBundle: string,
        options: {
          dryRun?: boolean
          adapter?: string
          context?: string
        },
      ) => {
        const fresh_context_bundle = options.context
          ? await loadFreshContextBundle(options.context)
          : undefined

        const result = await runDraftPipeline(intakeBundle, {
          dryRun: options.dryRun,
          adapterName: options.adapter,
          fresh_context_bundle,
        })
        console.log(
          options.dryRun
            ? `Draft validated for run ${result.context.runId}.`
            : `Draft saved to ${result.outputPath}.`,
        )
      },
    )
}

async function loadFreshContextBundle(filePath: string): Promise<FreshContextBundle> {
  const raw = await readFile(filePath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `--context file ${filePath} is not valid JSON: ${(err as Error).message}`,
    )
  }
  assertFreshContextBundle(parsed, filePath)
  return parsed
}

/**
 * Hand-rolled guard for `FreshContextBundle` (see `src/core/types.ts`).
 *
 * A malformed hand-edited JSON blob that only satisfies the loose
 * `Array.isArray(parsed.contexts)` check used to slip through and
 * corrupt draft generation downstream — this validates every field
 * the draft pipeline actually reads, and fails with a path-qualified
 * message pointing at the offending field.
 */
export function assertFreshContextBundle(
  value: unknown,
  filePath: string,
): asserts value is FreshContextBundle {
  const ctx = `--context file ${filePath}`
  if (!value || typeof value !== 'object') {
    throw new Error(`${ctx} is not a JSON object.`)
  }
  const bundle = value as Record<string, unknown>

  if (typeof bundle.run_id !== 'string' || bundle.run_id.length === 0) {
    throw new Error(`${ctx}: .run_id must be a non-empty string.`)
  }
  if (typeof bundle.fetched_at !== 'string' || bundle.fetched_at.length === 0) {
    throw new Error(`${ctx}: .fetched_at must be a non-empty ISO-8601 string.`)
  }
  if (!Array.isArray(bundle.signals)) {
    throw new Error(`${ctx}: .signals must be an array of FreshnessSignal.`)
  }
  bundle.signals.forEach((signal, i) => {
    if (!signal || typeof signal !== 'object') {
      throw new Error(`${ctx}: .signals[${i}] must be an object.`)
    }
    const s = signal as Record<string, unknown>
    if (typeof s.source !== 'string' || typeof s.reason !== 'string') {
      throw new Error(`${ctx}: .signals[${i}] must have string .source and .reason.`)
    }
  })

  if (!Array.isArray(bundle.contexts)) {
    throw new Error(`${ctx}: .contexts must be an array of FreshContext.`)
  }
  bundle.contexts.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`${ctx}: .contexts[${i}] must be an object.`)
    }
    const c = entry as Record<string, unknown>
    for (const key of ['id', 'source', 'url', 'author', 'text', 'fetched_at', 'language'] as const) {
      if (typeof c[key] !== 'string') {
        throw new Error(`${ctx}: .contexts[${i}].${key} must be a string.`)
      }
    }
    if (!c.engagement || typeof c.engagement !== 'object') {
      throw new Error(`${ctx}: .contexts[${i}].engagement must be an object.`)
    }
    if (!c.matched_signal || typeof c.matched_signal !== 'object') {
      throw new Error(`${ctx}: .contexts[${i}].matched_signal must be an object.`)
    }
    const ms = c.matched_signal as Record<string, unknown>
    if (typeof ms.source !== 'string' || typeof ms.reason !== 'string') {
      throw new Error(
        `${ctx}: .contexts[${i}].matched_signal must have string .source and .reason.`,
      )
    }
  })
}
