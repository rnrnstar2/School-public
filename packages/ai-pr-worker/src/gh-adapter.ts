import type { CommandRunner } from './command-runner.js'

const PR_URL_RE = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/i

export interface CreatePullRequestInput {
  worktreePath: string
  title: string
  body: string
  headBranch: string
}

export interface CreatePullRequestResult {
  url: string
  stdout: string
  stderr: string
}

export interface GhAdapter {
  readonly mode: 'fake' | 'real'
  createPullRequest(input: CreatePullRequestInput): Promise<CreatePullRequestResult>
}

export class GhAdapterError extends Error {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string

  constructor(
    message: string,
    details: { exitCode: number; stdout: string; stderr: string },
  ) {
    super(message)
    this.name = 'GhAdapterError'
    this.exitCode = details.exitCode
    this.stdout = details.stdout
    this.stderr = details.stderr
  }
}

export function extractPullRequestUrl(text: string): string | null {
  return text.match(PR_URL_RE)?.[0] ?? null
}

export class RealGhAdapter implements GhAdapter {
  readonly mode = 'real' as const

  constructor(private readonly runner: CommandRunner) {}

  async createPullRequest(
    input: CreatePullRequestInput,
  ): Promise<CreatePullRequestResult> {
    const result = await this.runner.run({
      command: 'gh',
      args: [
        'pr',
        'create',
        '--title',
        input.title,
        '--body',
        input.body,
        '--base',
        'main',
        '--head',
        input.headBranch,
      ],
      cwd: input.worktreePath,
    })

    if (result.exitCode !== 0) {
      throw new GhAdapterError('gh pr create failed', {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      })
    }

    const url = extractPullRequestUrl(`${result.stdout}\n${result.stderr}`)
    if (!url) {
      throw new GhAdapterError('gh pr create did not return a PR URL', {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      })
    }

    return {
      url,
      stdout: result.stdout,
      stderr: result.stderr,
    }
  }
}
