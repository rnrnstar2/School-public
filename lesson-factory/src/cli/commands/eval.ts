import { readFile } from 'node:fs/promises'

import { Command } from 'commander'

import { runEvalPipeline } from '../../pipelines/eval.js'
import { validateAssets } from '../../pipelines/shared.js'

export function registerEvalCommand(program: Command): void {
  program
    .command('eval')
    .description('Evaluate a lesson draft and critique bundle')
    .argument('<draft>', 'Path to lesson draft JSON')
    .argument('<critique>', 'Path to critique JSON')
    .option('--media <path>', 'Path to media JSON produced by lesson:media')
    .option('--dry-run', 'Validate without writing files')
    .action(
      async (
        draftPath: string,
        critiquePath: string,
        options: {
          media?: string
          dryRun?: boolean
        },
      ) => {
        const assets = options.media
          ? await validateAssets(await parseMediaAssetsFile(options.media))
          : undefined

        const result = await runEvalPipeline(draftPath, critiquePath, {
          assets,
          dryRun: options.dryRun,
        })
        console.log(
          options.dryRun
            ? `Eval validated for run ${result.context.runId}.`
            : `Eval bundle saved to ${result.outputPath}.`,
        )
      },
    )
}

async function parseMediaAssetsFile(mediaPath: string): Promise<unknown> {
  const raw = await readFile(mediaPath, 'utf8')

  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse media JSON at ${mediaPath}: ${message}`)
  }
}
