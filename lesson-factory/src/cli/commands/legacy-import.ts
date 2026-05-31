import { Command } from 'commander'

import {
  getDefaultLegacyImportOutDir,
  getDefaultLegacyImportSourceDir,
  runLegacyImport,
} from '../../legacy/import.js'

export function registerLegacyImportCommand(program: Command): void {
  program
    .command('legacy-import')
    .description('Convert legacy web-builder lesson definitions into lesson atom YAML files')
    .option(
      '--source <path>',
      'Legacy curriculum source directory',
      getDefaultLegacyImportSourceDir(),
    )
    .option(
      '--out <path>',
      'Target directory for generated lesson atoms',
      getDefaultLegacyImportOutDir(),
    )
    .option('--dry-run', 'Validate and summarize without writing files')
    .option('--force', 'Overwrite existing YAML/body files instead of skipping them')
    .action(
      async (options: {
        source: string
        out: string
        dryRun?: boolean
        force?: boolean
      }) => {
        const result = await runLegacyImport({
          sourceDir: options.source,
          outDir: options.out,
          dryRun: options.dryRun,
          force: options.force,
        })

        console.log(formatLegacyImportSummary(result))
      },
    )
}

function formatLegacyImportSummary(result: Awaited<ReturnType<typeof runLegacyImport>>): string {
  const lines = [
    `track: ${result.trackId}`,
    `source: ${result.sourceDir}`,
    `out: ${result.outDir}`,
    `dry-run: ${result.dryRun ? 'yes' : 'no'}`,
    `force: ${result.force ? 'yes' : 'no'}`,
    `lessons: ${result.counts.totalLessons}`,
    `write-count: ${result.counts.writeCount}`,
    `skip-count: ${result.counts.skipCount}`,
    `goal-tags: ${result.goalTagCoverage.join(', ')}`,
  ]

  if (result.lessons.length > 0) {
    lines.push('atoms:')
    lines.push(
      ...result.lessons.map((lesson) => {
        const status = lesson.skipped ? 'skip' : result.dryRun ? 'plan' : 'write'
        return `  - ${status}\t${lesson.atomId}\t${lesson.milestoneId}`
      }),
    )
  }

  return lines.join('\n')
}
