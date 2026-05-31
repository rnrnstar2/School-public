import { Command } from 'commander'

import { createSubscriptionImagegenQueue } from '../../pipelines/media-subscription.js'

export function registerMediaQueueCommand(program: Command): void {
  program
    .command('media-queue')
    .description('Create a Codex subscription imagegen queue from a lesson draft JSON file')
    .argument('<draft>', 'Path to lesson draft JSON')
    .option('--dry-run', 'Validate without writing files')
    .action(async (draftPath: string, options: { dryRun?: boolean }) => {
      const result = await createSubscriptionImagegenQueue(draftPath, {
        dryRun: options.dryRun,
      })

      console.log(
        options.dryRun
          ? `Codex imagegen queue validated for run ${result.context.runId}.`
          : [
              `Codex imagegen queue saved to ${result.outputPath}.`,
              `Prompt guide saved to ${result.guidePath}.`,
              `Jobs: ${result.output.jobs.length}`,
            ].join('\n'),
      )
    })
}
