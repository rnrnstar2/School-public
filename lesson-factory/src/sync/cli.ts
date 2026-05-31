import { formatPlanForConsole, runLessonSync } from './run.js'

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  const result = await runLessonSync({ dryRun })

  console.log(formatPlanForConsole(result.plan))
  console.log(`log: ${result.logPath}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
