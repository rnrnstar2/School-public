import { describe, expect, it } from 'vitest'

import type { CommandRunner, RunCommandInput } from '../src/command-runner.js'
import {
  GhAdapterError,
  RealGhAdapter,
  extractPullRequestUrl,
} from '../src/gh-adapter.js'

function makeRunner(result: {
  exitCode: number
  stdout: string
  stderr: string
}): {
  calls: RunCommandInput[]
  runner: CommandRunner
} {
  const calls: RunCommandInput[] = []
  return {
    calls,
    runner: {
      async run(input) {
        calls.push(input)
        return result
      },
    },
  }
}

describe('RealGhAdapter', () => {
  it('uses the required gh pr create argv shape', async () => {
    const { calls, runner } = makeRunner({
      exitCode: 0,
      stdout: 'https://github.com/example/repo/pull/42',
      stderr: '',
    })

    const adapter = new RealGhAdapter(runner)
    const result = await adapter.createPullRequest({
      worktreePath: '/tmp/worktree',
      title: 'Add worker package',
      body: 'Body text',
      headBranch: 'ai-pr-worker/demo',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      command: 'gh',
      args: [
        'pr',
        'create',
        '--title',
        'Add worker package',
        '--body',
        'Body text',
        '--base',
        'main',
        '--head',
        'ai-pr-worker/demo',
      ],
      cwd: '/tmp/worktree',
    })
    expect(result.url).toBe('https://github.com/example/repo/pull/42')
  })

  it('throws when gh fails or no PR URL is printed', async () => {
    const failing = new RealGhAdapter(
      makeRunner({
        exitCode: 1,
        stdout: '',
        stderr: 'boom',
      }).runner,
    )

    await expect(
      failing.createPullRequest({
        worktreePath: '/tmp/worktree',
        title: 'Add worker package',
        body: 'Body text',
        headBranch: 'ai-pr-worker/demo',
      }),
    ).rejects.toBeInstanceOf(GhAdapterError)
  })
})

describe('extractPullRequestUrl', () => {
  it('extracts the created pull request URL from stdout', () => {
    expect(
      extractPullRequestUrl('created https://github.com/example/repo/pull/99'),
    ).toBe('https://github.com/example/repo/pull/99')
  })
})
