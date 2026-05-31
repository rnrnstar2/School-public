import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CodexAdapterError,
  type CodexAdapter,
  type CodexExecutionInput,
} from '../src/codex-adapter.js'
import { createExecaRunner } from '../src/command-runner.js'
import {
  GhAdapterError,
  type CreatePullRequestInput,
  type GhAdapter,
} from '../src/gh-adapter.js'
import { RealGitClient } from '../src/git.js'
import { buildWorktreePath } from '../src/prompt.js'
import { runWorker } from '../src/worker.js'
import { MemoryRepository, makeAction, ACTION_ID } from './test-helpers.js'

type Fixture = {
  rootDir: string
  repoRoot: string
  remotePath: string
}

const fixtureRoots: string[] = []

async function createGitFixture(): Promise<Fixture> {
  const rootDir = await mkdtemp(join(tmpdir(), 'ai-pr-worker-'))
  const remotePath = join(rootDir, 'remote.git')
  const repoRoot = join(rootDir, 'repo')

  fixtureRoots.push(rootDir)

  await execa('git', ['init', '--bare', remotePath])
  await execa('git', ['init', '-b', 'main', repoRoot])
  await execa('git', ['config', 'user.email', 'worker@example.test'], {
    cwd: repoRoot,
  })
  await execa('git', ['config', 'user.name', 'AI PR Worker Test'], {
    cwd: repoRoot,
  })

  await writeFile(join(repoRoot, 'README.md'), '# Fixture Repository\n', 'utf8')
  await execa('git', ['add', 'README.md'], { cwd: repoRoot })
  await execa('git', ['commit', '-m', 'chore: seed fixture'], { cwd: repoRoot })
  await execa('git', ['remote', 'add', 'origin', remotePath], { cwd: repoRoot })
  await execa('git', ['push', '-u', 'origin', 'main'], { cwd: repoRoot })

  return { rootDir, repoRoot, remotePath }
}

async function hasRemoteBranch(remotePath: string, branchName: string): Promise<boolean> {
  const result = await execa('git', ['--git-dir', remotePath, 'branch', '--list', branchName])
  return result.stdout.includes(branchName)
}

async function hasLocalBranch(repoRoot: string, branchName: string): Promise<boolean> {
  const result = await execa('git', ['branch', '--list', branchName], { cwd: repoRoot })
  return result.stdout.includes(branchName)
}

class SuccessCodexAdapter implements CodexAdapter {
  readonly mode = 'fake' as const

  async exec(input: CodexExecutionInput) {
    await writeFile(
      join(input.worktreePath, 'README.md'),
      '# Fixture Repository\n\nUpdated by fake codex.\n',
      'utf8',
    )
    await writeFile(input.outputLastMessagePath, 'Updated README.md', 'utf8')

    return {
      stdout: 'thread_id: 019d9b79-4ccc-77e0-b41c-268d6c375467',
      stderr: '',
      outputLastMessagePath: input.outputLastMessagePath,
      sessionId: '019d9b79-4ccc-77e0-b41c-268d6c375467',
    }
  }
}

class FailingCodexAdapter implements CodexAdapter {
  readonly mode = 'fake' as const

  async exec(_input: CodexExecutionInput): Promise<never> {
    throw new CodexAdapterError('codex failed', {
      exitCode: 1,
      stdout: '',
      stderr: 'codex failed',
      sessionId: '019d9b79-4ccc-77e0-b41c-268d6c375467',
    })
  }
}

class SuccessGhAdapter implements GhAdapter {
  readonly mode = 'fake' as const

  async createPullRequest({ headBranch }: CreatePullRequestInput) {
    return {
      url: `https://example.invalid/pr/${encodeURIComponent(headBranch)}`,
      stdout: 'gh ok',
      stderr: '',
    }
  }
}

class FailingGhAdapter implements GhAdapter {
  readonly mode = 'fake' as const

  async createPullRequest(_input: CreatePullRequestInput): Promise<never> {
    throw new GhAdapterError('gh pr create failed', {
      exitCode: 1,
      stdout: '',
      stderr: 'gh pr create failed',
    })
  }
}

afterEach(async () => {
  while (fixtureRoots.length > 0) {
    const root = fixtureRoots.pop()
    if (root) {
      await rm(root, { recursive: true, force: true })
    }
  }
})

describe('runWorker integration with fake adapters and real git', () => {
  it('covers the fake-adapter happy path end-to-end without requiring GH_TOKEN', async () => {
    const fixture = await createGitFixture()
    const repository = new MemoryRepository([
      makeAction({ owner_approval: 'pending' }),
      makeAction({ owner_approval: 'approved' }),
    ])
    const git = new RealGitClient(createExecaRunner())

    const result = await runWorker(
      {
        actionId: ACTION_ID,
        dryRun: false,
      },
      {
        repoRoot: fixture.repoRoot,
        repository,
        git,
        codex: new SuccessCodexAdapter(),
        gh: new SuccessGhAdapter(),
        now: () => new Date('2026-04-17T12:34:56.000Z'),
        sleep: async () => {},
        approvalPollIntervalMs: 1,
        approvalTimeoutMs: null,
      },
    )

    const worktreePath = buildWorktreePath(fixture.repoRoot, ACTION_ID, result.runId)

    await expect(access(worktreePath)).rejects.toThrow()
    expect(result.status).toBe('succeeded')
    expect(result.prUrl).toBeTruthy()
    expect(repository.runs[0]?.status).toBe('succeeded')
    expect(repository.backlinks[0]?.prUrl).toBe(result.prUrl)
    expect(await hasRemoteBranch(fixture.remotePath, result.branchName!)).toBe(true)
    expect(await hasLocalBranch(fixture.repoRoot, result.branchName!)).toBe(false)
  })

  it('rejects unapproved actions with exit code 2', async () => {
    const fixture = await createGitFixture()
    const repository = new MemoryRepository([
      makeAction({ status: 'proposed' }),
    ])

    await expect(
      runWorker(
        {
          actionId: ACTION_ID,
          dryRun: false,
          ghToken: 'gh-token',
        },
        {
          repoRoot: fixture.repoRoot,
          repository,
          git: new RealGitClient(createExecaRunner()),
          codex: new SuccessCodexAdapter(),
          gh: new SuccessGhAdapter(),
          now: () => new Date('2026-04-17T12:34:56.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      exitCode: 2,
      details: {
        status: 'rejected',
      },
    })

    expect(repository.runs[0]?.status).toBe('rejected')
  })

  it('rolls back the worktree and local branch when codex fails before push', async () => {
    const fixture = await createGitFixture()
    const repository = new MemoryRepository([makeAction()])
    const git = new RealGitClient(createExecaRunner())

    await expect(
      runWorker(
        {
          actionId: ACTION_ID,
          dryRun: false,
          ghToken: 'gh-token',
        },
        {
          repoRoot: fixture.repoRoot,
          repository,
          git,
          codex: new FailingCodexAdapter(),
          gh: new SuccessGhAdapter(),
          now: () => new Date('2026-04-17T12:34:56.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      exitCode: 1,
      details: {
        status: 'failed',
      },
    })

    const branchName = repository.runs[0]?.branch_name
    const worktreePath = buildWorktreePath(fixture.repoRoot, ACTION_ID, 'run-1')

    await expect(access(worktreePath)).rejects.toThrow()
    expect(repository.runs[0]?.error_log).toContain('codex failed')
    expect(branchName).toBeTruthy()
    expect(await hasLocalBranch(fixture.repoRoot, branchName!)).toBe(false)
    expect(await hasRemoteBranch(fixture.remotePath, branchName!)).toBe(false)
  })

  it('marks the run failed and keeps the pushed remote branch when gh fails', async () => {
    const fixture = await createGitFixture()
    const repository = new MemoryRepository([makeAction()])
    const git = new RealGitClient(createExecaRunner())

    await expect(
      runWorker(
        {
          actionId: ACTION_ID,
          dryRun: false,
          ghToken: 'gh-token',
        },
        {
          repoRoot: fixture.repoRoot,
          repository,
          git,
          codex: new SuccessCodexAdapter(),
          gh: new FailingGhAdapter(),
          now: () => new Date('2026-04-17T12:34:56.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      exitCode: 1,
      details: {
        status: 'failed',
      },
    })

    const branchName = repository.runs[0]?.branch_name
    const worktreePath = buildWorktreePath(fixture.repoRoot, ACTION_ID, 'run-1')

    await expect(access(worktreePath)).rejects.toThrow()
    expect(repository.runs[0]?.error_log).toContain('gh pr create failed')
    expect(branchName).toBeTruthy()
    expect(await hasRemoteBranch(fixture.remotePath, branchName!)).toBe(true)
    expect(await hasLocalBranch(fixture.repoRoot, branchName!)).toBe(false)
  })
})
