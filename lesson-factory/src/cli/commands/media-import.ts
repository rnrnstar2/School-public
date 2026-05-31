import { Command } from 'commander'

import { importSubscriptionImagegenAssets } from '../../pipelines/media-subscription.js'

export function registerMediaImportCommand(program: Command): void {
  program
    .command('media-import')
    .description('Import Codex subscription imagegen files into a media Asset[] bundle')
    .argument('<queue>', 'Path to media imagegen queue JSON')
    .option('--allow-missing', 'Import generated files that exist and skip missing jobs')
    .option('--dry-run', 'Validate without writing files')
    .action(
      async (
        queuePath: string,
        options: {
          allowMissing?: boolean
          dryRun?: boolean
        },
      ) => {
        const result = await importSubscriptionImagegenAssets(queuePath, {
          allowMissing: options.allowMissing,
          dryRun: options.dryRun,
        })

        console.log(
          options.dryRun
            ? `Codex imagegen media import validated for run ${result.context.runId}.`
            : `Media assets saved to ${result.outputPath}.`,
        )
      },
    )
}
