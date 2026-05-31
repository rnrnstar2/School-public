import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

import { Command } from 'commander'

import type { IntakeBundle, IntakeClassification } from '../../core/types.js'
import { runIntakePipeline } from '../../pipelines/intake.js'

const classificationOptions: Array<{ label: IntakeClassification; description: string }> = [
  { label: 'new_atom', description: 'Create a new atom' },
  { label: 'improve_existing', description: 'Update an existing atom' },
  { label: 'anchor_only', description: 'Re-sequence anchors only' },
  { label: 'unsupported', description: 'Outside lesson-factory scope' },
]

export function registerNewCommand(program: Command): void {
  program
    .command('new')
    .description('Create an intake bundle scaffold via interactive prompts')
    .option('--dry-run', 'Validate only without writing files')
    .action(async (options: { dryRun?: boolean }) => {
      const rl = readline.createInterface({ input, output })
      try {
        const goalSummary = await rl.question('Goal summary: ')
        const constraints = splitCsv(await rl.question('Constraints (comma-separated): '))
        const hints = splitCsv(await rl.question('Hints (comma-separated): '))
        const personaTags = splitCsv(await rl.question('Target persona tags (comma-separated): '))
        const capability = await rl.question('Primary capability: ')
        const freshnessSources = splitCsv(
          await rl.question('Freshness sources (comma-separated, optional): '),
        )

        console.log('Classification:')
        classificationOptions.forEach((option, index) => {
          console.log(`${index + 1}. ${option.label} - ${option.description}`)
        })
        const selectedIndex = Number(await rl.question('Choose classification number: '))
        const selectedClassification = classificationOptions[selectedIndex - 1]
        if (!selectedClassification) {
          throw new Error('Invalid classification selection.')
        }

        const classificationReason = await rl.question('Classification reason: ')
        const relatedAtomIds = splitCsv(
          await rl.question('Related atom ids (comma-separated, optional): '),
        )

        const intakeBundle: IntakeBundle = {
          goal: {
            summary: goalSummary,
            constraints,
            hints,
          },
          target_personas: personaTags.map((tag) => ({
            tag,
            reason: `${tag} is directly affected by the requested learning goal.`,
          })),
          candidate_capabilities: capability
            ? [
                {
                  capability,
                  rationale: `Primary capability extracted from goal summary: ${goalSummary}`,
                },
              ]
            : [],
          freshness_signals: freshnessSources.map((source) => ({
            source,
            reason: `Requested by owner during intake: ${source}`,
          })),
          classification: selectedClassification.label,
          classification_reason: classificationReason,
          related_atom_ids: relatedAtomIds,
        }

        const result = await runIntakePipeline(intakeBundle, {
          dryRun: options.dryRun,
        })
        console.log(
          options.dryRun
            ? `Validated intake bundle for run ${result.context.runId}.`
            : `Saved intake bundle to ${result.outputPath}.`,
        )
      } finally {
        rl.close()
      }
    })
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
