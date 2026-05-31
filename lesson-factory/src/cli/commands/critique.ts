import { Command } from 'commander'

import { runCritiquePipeline } from '../../pipelines/critique.js'

export function registerCritiqueCommand(program: Command): void {
  program
    .command('critique')
    .description('Run critique against a lesson draft JSON file')
    .argument('<draft>', 'Path to lesson draft JSON')
    .option('--dry-run', 'Validate without writing files')
    .option('--adapter <name>', 'Override critique adapter (claude-code|gemini|mock)')
    .action(
      async (
        draftPath: string,
        options: {
          dryRun?: boolean
          adapter?: string
        },
      ) => {
        const result = await runCritiquePipeline(draftPath, {
          dryRun: options.dryRun,
          adapterName: options.adapter,
        })
        console.log(
          options.dryRun
            ? `Critique validated for run ${result.context.runId}.`
            : `Critique saved to ${result.outputPath}.`,
        )
      },
    )
}
