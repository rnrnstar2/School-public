import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

import { Command } from 'commander'

import { runContextFetchPipeline } from '../../pipelines/context-fetch/index.js'
import type { ContextFetchAdapterName } from '../../pipelines/context-fetch/index.js'

export function registerResearchCommand(program: Command): void {
  program
    .command('research')
    .description('Fetch fresh external context (e.g. tweets) for an intake bundle')
    .argument('<intake-bundle>', 'Path to intake bundle YAML or JSON')
    .option('--adapter <name>', 'Context-fetch adapter (twitter)', 'twitter')
    .option('--output <path>', 'Optional path to write the FreshContextBundle JSON')
    .option('--dry-run', 'Validate without writing files')
    .action(
      async (
        intakeBundle: string,
        options: {
          adapter?: string
          output?: string
          dryRun?: boolean
        },
      ) => {
        const adapter = normalizeAdapterName(options.adapter)
        const result = await runContextFetchPipeline(intakeBundle, {
          adapter,
          dryRun: options.dryRun,
        })

        if (options.output && !options.dryRun) {
          const outPath = path.resolve(options.output)
          await mkdir(path.dirname(outPath), { recursive: true })
          await writeFile(outPath, JSON.stringify(result.output, null, 2), 'utf8')
          console.log(`FreshContextBundle saved to ${outPath} (${result.output.contexts.length} contexts).`)
        } else if (options.dryRun) {
          console.log(`context-fetch validated for run ${result.context.runId}.`)
        } else {
          console.log(
            `FreshContextBundle saved to ${result.outputPath} (${result.output.contexts.length} contexts).`,
          )
        }
      },
    )
}

function normalizeAdapterName(value: string | undefined): ContextFetchAdapterName {
  const adapter = value ?? 'twitter'
  if (adapter !== 'twitter') {
    throw new Error(`Unsupported context-fetch adapter: ${adapter}. Only "twitter" is supported in MVP.`)
  }
  return adapter
}
