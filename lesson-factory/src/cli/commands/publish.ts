import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { Command } from 'commander'

import { runPublishPipeline } from '../../pipelines/publish.js'

export function registerPublishCommand(program: Command): void {
  program
    .command('publish')
    .description('Publish a lesson atom YAML after explicit owner confirmation')
    .argument('<draft>', 'Path to lesson draft JSON')
    .argument('<eval-bundle>', 'Path to eval bundle JSON')
    .option('--dry-run', 'Validate without writing files')
    .action(
      async (
        draftPath: string,
        evalBundlePath: string,
        options: {
          dryRun?: boolean
        },
      ) => {
        const rl = readline.createInterface({ input, output })
        try {
          const answer = await rl.question('Owner confirm publish? [y/N]: ')
          const confirmed = answer.trim().toLowerCase() === 'y'
          if (!confirmed) {
            throw new Error('Publish aborted by owner.')
          }

          const result = await runPublishPipeline(draftPath, evalBundlePath, {
            dryRun: options.dryRun,
            confirmed,
          })
          console.log(
            options.dryRun
              ? `Publish validated for run ${result.context.runId}.`
              : `Publish bundle saved to ${result.outputPath}.`,
          )
        } finally {
          rl.close()
        }
      },
    )
}
