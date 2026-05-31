import { Command } from 'commander'

import { runMediaPipeline } from '../../pipelines/media.js'

export function registerMediaCommand(program: Command): void {
  program
    .command('media')
    .description('Generate automated media assets from a lesson draft JSON file')
    .argument('<draft>', 'Path to lesson draft JSON')
    .option('--dry-run', 'Validate without writing files')
    .action(async (draftPath: string, options: { dryRun?: boolean }) => {
      const result = await runMediaPipeline(draftPath, {
        dryRun: options.dryRun,
      })
      console.log(
        options.dryRun
          ? `Media stage validated for run ${result.context.runId}.`
          : `Media assets saved to ${result.outputPath}.`,
      )
    })
}
