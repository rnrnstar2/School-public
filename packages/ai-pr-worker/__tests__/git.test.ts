import { describe, expect, it } from 'vitest'

import type { CommandRunner, RunCommandInput } from '../src/command-runner.js'
import { GitCommandError, RealGitClient } from '../src/git.js'

function makeRunner(statusOutput = ' M README.md'): {
  calls: RunCommandInput[]
  runner: CommandRunner
} {
  const calls: RunCommandInput[] = []
  return {
    calls,
    runner: {
      async run(input) {
        calls.push(input)
        if (input.args[0] === 'status') {
          return {
            exitCode: 0,
            stdout: statusOutput,
            stderr: '',
          }
        }
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        }
      },
    },
  }
}

describe('RealGitClient', () => {
  it('fetches origin/main before creating the worktree branch from origin/main', async () => {
    const { calls, runner } = makeRunner()
    const git = new RealGitClient(runner)

    await git.createWorktree({
      repoRoot: '/tmp/repo',
      branchName: 'ai-pr-worker/demo',
      worktreePath: '/tmp/worktree',
    })

    expect(calls[0]).toEqual({
      command: 'git',
      args: ['fetch', 'origin', 'main'],
      cwd: '/tmp/repo',
    })
    expect(calls[1]).toEqual({
      command: 'git',
      args: [
        'worktree',
        'add',
        '-B',
        'ai-pr-worker/demo',
        '/tmp/worktree',
        'origin/main',
      ],
      cwd: '/tmp/repo',
    })
  })

  it('commits all staged changes in two commands', async () => {
    const { calls, runner } = makeRunner()
    const git = new RealGitClient(runner)

    await git.commitAll('/tmp/worktree', 'feat(ai-pr-worker): demo')

    expect(calls[0]).toEqual({
      command: 'git',
      args: ['add', '-A'],
      cwd: '/tmp/worktree',
    })
    expect(calls[1]).toEqual({
      command: 'git',
      args: ['commit', '-m', 'feat(ai-pr-worker): demo'],
      cwd: '/tmp/worktree',
    })
  })

  it('rejects clean worktrees so empty PRs are not created', async () => {
    const git = new RealGitClient(makeRunner('').runner)

    await expect(git.ensureChanges('/tmp/worktree')).rejects.toBeInstanceOf(
      GitCommandError,
    )
  })
})
