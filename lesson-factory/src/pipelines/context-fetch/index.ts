import { TwitterAdapter } from '../../adapters/twitter/index.js'
import {
  createRunContext,
  writeStageError,
  writeStageMeta,
  writeStageOutput,
} from '../../core/run-log.js'
import type {
  FreshContext,
  FreshContextBundle,
  IntakeBundle,
  PipelineExecutionOptions,
  PipelineResult,
} from '../../core/types.js'
import { loadStructuredInput, validateIntakeBundle } from '../shared.js'

export type ContextFetchAdapterName = 'twitter'

export interface ContextFetchOptions extends PipelineExecutionOptions {
  adapter?: ContextFetchAdapterName
}

export async function runContextFetchPipeline(
  intakeInput: string | IntakeBundle,
  options: ContextFetchOptions = {},
): Promise<PipelineResult<FreshContextBundle>> {
  const context = createRunContext('context-fetch', options.runId)
  const adapterName: ContextFetchAdapterName = options.adapter ?? 'twitter'

  try {
    const intakeBundle = await validateIntakeBundle(await loadStructuredInput(intakeInput))
    const signals = intakeBundle.freshness_signals
    if (signals.length === 0) {
      throw new Error(
        'context-fetch: intake bundle has no freshness_signals. Add at least one signal before running lesson:research.',
      )
    }

    let contexts: FreshContext[]
    switch (adapterName) {
      case 'twitter': {
        const adapter = new TwitterAdapter()
        contexts = await adapter.fetchContext(signals, context.runId)
        break
      }
    }

    const bundle: FreshContextBundle = {
      run_id: context.runId,
      fetched_at: new Date().toISOString(),
      signals,
      contexts: dedupeById(contexts),
    }

    const outputPath = await writeStageOutput(context, 'json', bundle, options.dryRun)
    const metaPath = await writeStageMeta(
      context,
      {
        adapter: adapterName,
        signal_count: signals.length,
        context_count: bundle.contexts.length,
        output_path: outputPath ?? null,
      },
      options.dryRun,
    )

    return {
      output: bundle,
      outputPath,
      metaPath,
      context,
    }
  } catch (error) {
    await writeStageError(context, error, options.dryRun)
    throw error
  }
}

function dedupeById(contexts: FreshContext[]): FreshContext[] {
  const seen = new Set<string>()
  const result: FreshContext[] = []
  for (const context of contexts) {
    if (seen.has(context.id)) continue
    seen.add(context.id)
    result.push(context)
  }
  return result
}
