import type { WorkerCliOptions } from './schema.js'
import { WorkerExitError } from './errors.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class CliUsageError extends Error {
  readonly exitCode = 1

  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export type CliRunner = (options: WorkerCliOptions) => Promise<number | void>

function parseAdapter(argv: string[], index: number): {
  value: WorkerCliOptions['adapter']
  nextIndex: number
} {
  const current = argv[index]
  if (current?.startsWith('--adapter=')) {
    const value = current.slice('--adapter='.length)
    if (value === 'fake' || value === 'real') {
      return { value, nextIndex: index }
    }
    throw new CliUsageError(`Unsupported adapter: ${value}`)
  }

  const value = argv[index + 1]
  if (value === 'fake' || value === 'real') {
    return { value, nextIndex: index + 1 }
  }
  throw new CliUsageError('Missing value for --adapter')
}

function parseActionId(argv: string[], index: number): {
  value: string
  nextIndex: number
} {
  const current = argv[index]
  if (current?.startsWith('--action-id=')) {
    const value = current.slice('--action-id='.length)
    if (!UUID_RE.test(value)) {
      throw new CliUsageError(`Invalid UUID for --action-id: ${value}`)
    }
    return { value, nextIndex: index }
  }

  const value = argv[index + 1]
  if (!value) {
    throw new CliUsageError('Missing value for --action-id')
  }
  if (!UUID_RE.test(value)) {
    throw new CliUsageError(`Invalid UUID for --action-id: ${value}`)
  }
  return { value, nextIndex: index + 1 }
}

export function parseCliArgs(argv: string[]): WorkerCliOptions {
  const [command, ...rest] = argv
  if (command !== 'run') {
    throw new CliUsageError('Usage: ai-pr-worker run --action-id <uuid> [--dry-run] [--adapter=fake|real]')
  }

  let actionId = ''
  let dryRun = false
  let adapter: WorkerCliOptions['adapter'] = 'real'

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token) continue

    if (token === '--dry-run') {
      dryRun = true
      continue
    }

    if (token === '--action-id' || token.startsWith('--action-id=')) {
      const parsed = parseActionId(rest, index)
      actionId = parsed.value
      index = parsed.nextIndex
      continue
    }

    if (token === '--adapter' || token.startsWith('--adapter=')) {
      const parsed = parseAdapter(rest, index)
      adapter = parsed.value
      index = parsed.nextIndex
      continue
    }

    throw new CliUsageError(`Unknown argument: ${token}`)
  }

  if (!actionId) {
    throw new CliUsageError('Missing required --action-id <uuid>')
  }

  return {
    command: 'run',
    actionId,
    dryRun,
    adapter,
  }
}

export async function runCli(
  argv: string[],
  runner: CliRunner,
): Promise<number> {
  const options = parseCliArgs(argv)
  const exitCode = await runner(options)
  return exitCode ?? 0
}

export function resolveGhTokenForCli(
  options: WorkerCliOptions,
  env: NodeJS.ProcessEnv,
): string | undefined {
  if (options.adapter !== 'real') {
    return env.GH_TOKEN
  }

  if (options.dryRun) {
    return env.GH_TOKEN
  }

  if (!env.GH_TOKEN) {
    throw new WorkerExitError('GH_TOKEN is required', 1)
  }

  return env.GH_TOKEN
}
