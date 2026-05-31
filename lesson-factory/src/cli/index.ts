import { Command } from 'commander'

import { registerCritiqueCommand } from './commands/critique.js'
import { registerDraftCommand } from './commands/draft.js'
import { registerEvalCommand } from './commands/eval.js'
import { registerLegacyImportCommand } from './commands/legacy-import.js'
import { registerListCommand } from './commands/list.js'
import { registerMediaCommand } from './commands/media.js'
import { registerMediaImportCommand } from './commands/media-import.js'
import { registerMediaQueueCommand } from './commands/media-queue.js'
import { registerNewCommand } from './commands/new.js'
import { registerPublishCommand } from './commands/publish.js'
import { registerResearchCommand } from './commands/research.js'
import { registerRunCommand } from './commands/run.js'

async function main(): Promise<void> {
  const program = new Command()
    .name('lesson-factory')
    .description('Owner-local lesson factory CLI')

  registerListCommand(program)
  registerLegacyImportCommand(program)
  registerNewCommand(program)
  registerResearchCommand(program)
  registerDraftCommand(program)
  registerCritiqueCommand(program)
  registerMediaCommand(program)
  registerMediaQueueCommand(program)
  registerMediaImportCommand(program)
  registerEvalCommand(program)
  registerPublishCommand(program)
  registerRunCommand(program)

  await program.parseAsync(process.argv)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
