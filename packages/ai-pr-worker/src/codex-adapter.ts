import type { CommandRunner } from './command-runner.js'

export interface CodexExecutionInput {
  worktreePath: string
  prompt: string
  outputLastMessagePath: string
  ghToken: string
}

export interface CodexExecutionResult {
  stdout: string
  stderr: string
  outputLastMessagePath: string
  sessionId: string | null
}

export interface CodexAdapter {
  readonly mode: 'fake' | 'real'
  exec(input: CodexExecutionInput): Promise<CodexExecutionResult>
}

export class CodexAdapterError extends Error {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
  readonly sessionId: string | null

  constructor(
    message: string,
    details: {
      exitCode: number
      stdout: string
      stderr: string
      sessionId: string | null
    },
  ) {
    super(message)
    this.name = 'CodexAdapterError'
    this.exitCode = details.exitCode
    this.stdout = details.stdout
    this.stderr = details.stderr
    this.sessionId = details.sessionId
  }
}

export function extractCodexSessionId(text: string): string | null {
  const sessionPattern =
    /\b(?:session[_ ]id|thread[_ ]id)\b\s*[:=]\s*([0-9a-f-]{36})/i
  const explicit = text.match(sessionPattern)
  return explicit?.[1] ?? null
}

export class RealCodexAdapter implements CodexAdapter {
  readonly mode = 'real' as const

  constructor(private readonly runner: CommandRunner) {}

  async exec(input: CodexExecutionInput): Promise<CodexExecutionResult> {
    const result = await this.runner.run({
      command: 'codex',
      args: [
        'exec',
        '-C',
        input.worktreePath,
        '--dangerously-bypass-approvals-and-sandbox',
        '--output-last-message',
        input.outputLastMessagePath,
        input.prompt,
      ],
      env: {
        GH_TOKEN: input.ghToken,
      },
    })

    const sessionId = extractCodexSessionId(
      `${result.stdout}\n${result.stderr}`.trim(),
    )

    if (result.exitCode !== 0) {
      throw new CodexAdapterError('codex exec failed', {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        sessionId,
      })
    }

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      outputLastMessagePath: input.outputLastMessagePath,
      sessionId,
    }
  }
}
