import { appendUnsupportedGoal } from '../core/unsupported-log.js'
import { createRunContext, writeStageError, writeStageMeta, writeStageOutput } from '../core/run-log.js'
import type { IntakeBundle, PipelineExecutionOptions, PipelineResult } from '../core/types.js'
import { validateIntakeBundle } from './shared.js'

export async function runIntakePipeline(
  bundleInput: IntakeBundle,
  options: PipelineExecutionOptions = {},
): Promise<PipelineResult<IntakeBundle>> {
  const context = createRunContext('intake', options.runId)

  try {
    const bundle = await validateIntakeBundle(bundleInput)
    const outputPath = await writeStageOutput(context, 'yaml', bundle, options.dryRun)
    const unsupportedPath =
      bundle.classification === 'unsupported'
        ? await appendUnsupportedGoal(bundle, context, options.dryRun)
        : undefined
    const metaPath = await writeStageMeta(
      context,
      {
        classification: bundle.classification,
        output_path: outputPath ?? null,
        unsupported_log_path: unsupportedPath ?? null,
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
