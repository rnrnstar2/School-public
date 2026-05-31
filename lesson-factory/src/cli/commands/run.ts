import { Command } from 'commander'

import { runCritiquePipeline } from '../../pipelines/critique.js'
import { runDraftPipeline } from '../../pipelines/draft.js'
import { runEvalPipeline } from '../../pipelines/eval.js'

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run draft -> critique -> eval from a single intake bundle')
    .argument('<intake-bundle>', 'Path to intake bundle YAML')
    .option('--dry-run', 'Validate without writing files')
    .option('--adapter <name>', 'Override text adapter (claude-code|gemini|mock)')
    .action(
      async (
        intakeBundlePath: string,
        options: {
          dryRun?: boolean
          adapter?: string
        },
      ) => {
        const draft = await runDraftPipeline(intakeBundlePath, {
          dryRun: options.dryRun,
          adapterName: options.adapter,
        })
        const critique = await runCritiquePipeline(draft.output, {
          dryRun: options.dryRun,
          adapterName: options.adapter,
          runId: draft.context.runId,
        })
        const evaluation = await runEvalPipeline(draft.output, critique.output, {
          dryRun: options.dryRun,
          runId: draft.context.runId,
        })

        console.log(
          [
            `draft: ${draft.outputPath ?? '(dry-run)'}`,
            `critique: ${critique.outputPath ?? '(dry-run)'}`,
            `eval: ${evaluation.outputPath ?? '(dry-run)'}`,
            `recommend_status: ${evaluation.output.recommend_status}`,
          ].join('\n'),
        )
      },
    )
}
