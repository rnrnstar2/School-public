import { describe, expect, it, vi } from 'vitest'

import { CodexAdapterError, type CodexAdapter } from '../src/codex-adapter.js'
import type { GhAdapter } from '../src/gh-adapter.js'
import type { GitClient } from '../src/git.js'
import { WorkerExitError } from '../src/errors.js'
import { currentHourWindow, runWorker, waitForOwnerApproval } from '../src/worker.js'
import { MemoryRepository, makeAction, ACTION_ID } from './test-helpers.js'

function makeNoopGit(): GitClient {
  return {
    createWorktree: vi.fn(async () => {}),
    ensureChanges: vi.fn(async () => {}),
    commitAll: vi.fn(async () => {}),
    pushBranch: vi.fn(async () => {}),
    removeWorktree: vi.fn(async () => {}),
    deleteLocalBranch: vi.fn(async () => {}),
    resolveRepoRoot: vi.fn(async () => '/tmp/repo'),
  }
}

function makeNoopCodex(): CodexAdapter {
  return {
    mode: 'fake',
    exec: vi.fn(async () => ({
      stdout: '',
      stderr: '',
      outputLastMessagePath: '/tmp/out.md',
      sessionId: 'session',
    })),
  }
}

function makeNoopGh(): GhAdapter {
  return {
    mode: 'fake',
    createPullRequest: vi.fn(async () => ({
      url: 'https://example.invalid/pr/demo',
      stdout: '',
      stderr: '',
    })),
  }
}

describe('worker orchestration helpers', () => {
  it('computes the current hour rate-limit window', () => {
    expect(currentHourWindow(new Date('2026-04-17T12:34:56.000Z'))).toEqual({
      startIso: '2026-04-17T12:00:00.000Z',
      endIso: '2026-04-17T13:00:00.000Z',
    })
  })

  it('polls until owner approval flips to approved', async () => {
    const repository = new MemoryRepository([
      makeAction({ owner_approval: 'pending' }),
      makeAction({ owner_approval: 'approved' }),
    ])

    const action = await waitForOwnerApproval(ACTION_ID, repository, {
      now: () => new Date('2026-04-17T12:00:00.000Z'),
      sleep: async () => {},
      pollIntervalMs: 1,
      timeoutMs: null,
    })

    expect(action.owner_approval).toBe('approved')
  })
})

describe('runWorker', () => {
  it('stops early in dry-run mode without touching git/codex/gh', async () => {
    const repository = new MemoryRepository([makeAction()])
    const git = makeNoopGit()
    const codex = makeNoopCodex()
    const gh = makeNoopGh()

    const result = await runWorker(
      {
        actionId: ACTION_ID,
        dryRun: true,
      },
      {
        repoRoot: '/tmp/repo',
        repository,
        git,
        codex,
        gh,
        now: () => new Date('2026-04-17T12:34:56.000Z'),
      },
    )

    expect(result.status).toBe('dry_run')
    expect(result.cleanupWarnings).toEqual([])
    expect(repository.runs[0]?.status).toBe('dry_run')
    expect(git.createWorktree).not.toHaveBeenCalled()
    expect(codex.exec).not.toHaveBeenCalled()
    expect(gh.createPullRequest).not.toHaveBeenCalled()
  })

  it('atomically rate-limits concurrent entrants so both workers cannot pass under the same hourly cap', async () => {
    const repository = new MemoryRepository([makeAction()], 2)
    let releaseFirstWorktree!: () => void
    const firstWorktreeBlocked = new Promise<void>((resolve) => {
      releaseFirstWorktree = resolve
    })

    const git = makeNoopGit()
    let createWorktreeCalls = 0
    git.createWorktree = vi.fn(async () => {
      createWorktreeCalls += 1
      if (createWorktreeCalls === 1) {
        await firstWorktreeBlocked
      }
    })

    const firstRunPromise = runWorker(
      {
        actionId: ACTION_ID,
        dryRun: false,
      },
      {
        repoRoot: '/tmp/repo',
        repository,
        git,
        codex: makeNoopCodex(),
        gh: makeNoopGh(),
        now: () => new Date('2026-04-17T12:34:56.000Z'),
      },
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    const secondRunResult = await runWorker(
      {
        actionId: ACTION_ID,
        dryRun: false,
      },
      {
        repoRoot: '/tmp/repo',
        repository,
        git: makeNoopGit(),
        codex: makeNoopCodex(),
        gh: makeNoopGh(),
        now: () => new Date('2026-04-17T12:34:56.000Z'),
      },
    ).catch((error) => error)

    releaseFirstWorktree()

    const firstRunResult = await firstRunPromise

    expect(firstRunResult.status).toBe('succeeded')
    expect(firstRunResult.cleanupWarnings).toEqual([])
    expect(secondRunResult).toMatchObject({
      exitCode: 3,
      details: {
        status: 'rate_limited',
      },
    })
    expect(repository.runs.map((run) => run.status)).toEqual([
      'succeeded',
      'rate_limited',
    ])
  })

  it('finalizes the run as rejected when owner approval flips to rejected while waiting', async () => {
    const repository = new MemoryRepository([
      makeAction({ owner_approval: 'pending' }),
      makeAction({ owner_approval: 'rejected' }),
    ])

    await expect(
      runWorker(
        {
          actionId: ACTION_ID,
          dryRun: true,
        },
        {
          repoRoot: '/tmp/repo',
          repository,
          git: makeNoopGit(),
          codex: makeNoopCodex(),
          gh: makeNoopGh(),
          now: () => new Date('2026-04-17T12:34:56.000Z'),
          sleep: async () => {},
          approvalPollIntervalMs: 1,
          approvalTimeoutMs: null,
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

  it('persists the codex session id when codex execution fails after parsing a session id', async () => {
    const repository = new MemoryRepository([makeAction()])
    const codex: CodexAdapter = {
      mode: 'real',
      exec: vi.fn(async () => {
        throw new CodexAdapterError('codex failed', {
          exitCode: 1,
          stdout: '',
          stderr: 'codex failed',
          sessionId: '019d9b79-4ccc-77e0-b41c-268d6c375467',
        })
      }),
    }

    await expect(
      runWorker(
        {
          actionId: ACTION_ID,
          dryRun: false,
          ghToken: 'gh-token',
        },
        {
          repoRoot: '/tmp/repo',
          repository,
          git: makeNoopGit(),
          codex,
          gh: makeNoopGh(),
          now: () => new Date('2026-04-17T12:34:56.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      exitCode: 1,
      details: {
        status: 'failed',
      },
    })

    expect(repository.runs[0]?.codex_session_id).toBe(
      '019d9b79-4ccc-77e0-b41c-268d6c375467',
    )
  })

  it('keeps a successful worker result when cleanup fails and surfaces cleanup warnings', async () => {
    const repository = new MemoryRepository([makeAction()])
    const git = makeNoopGit()
    git.removeWorktree = vi.fn(async () => {
      throw new Error('remove worktree failed')
    })

    const result = await runWorker(
      {
        actionId: ACTION_ID,
        dryRun: false,
      },
      {
        repoRoot: '/tmp/repo',
        repository,
        git,
        codex: makeNoopCodex(),
        gh: makeNoopGh(),
        now: () => new Date('2026-04-17T12:34:56.000Z'),
      },
    )

    expect(result.status).toBe('succeeded')
    expect(result.cleanupWarnings).toEqual(['remove worktree failed'])
    expect(repository.runs[0]?.status).toBe('succeeded')
    expect(repository.runs[0]?.metadata).toEqual({
      cleanup_warnings: ['remove worktree failed'],
    })
  })

  it('keeps the run succeeded when backlink update fails after PR creation', async () => {
    const repository = new MemoryRepository([makeAction()])
    repository.updateActionBacklink = vi.fn(async () => {
      throw new Error('updateActionBacklink failed')
    })

    const result = await runWorker(
      {
        actionId: ACTION_ID,
        dryRun: false,
      },
      {
        repoRoot: '/tmp/repo',
        repository,
        git: makeNoopGit(),
        codex: makeNoopCodex(),
        gh: makeNoopGh(),
        now: () => new Date('2026-04-17T12:34:56.000Z'),
      },
    )

    expect(result.status).toBe('succeeded')
    expect(result.prUrl).toBe('https://example.invalid/pr/demo')
    expect(result.cleanupWarnings).toEqual([
      'BACKLINK_WARNING: updateActionBacklink failed',
    ])
    expect(repository.runs[0]?.status).toBe('succeeded')
    expect(repository.runs[0]?.pr_url).toBe('https://example.invalid/pr/demo')
    expect(repository.runs[0]?.metadata).toEqual({
      cleanup_warnings: ['BACKLINK_WARNING: updateActionBacklink failed'],
    })
  })

  it('keeps the original failure when cleanup also fails and records both reasons', async () => {
    const repository = new MemoryRepository([makeAction()])
    const git = makeNoopGit()
    git.removeWorktree = vi.fn(async () => {
      throw new Error('remove worktree failed')
    })

    const codex: CodexAdapter = {
      mode: 'real',
      exec: vi.fn(async () => {
        throw new CodexAdapterError('codex failed', {
          exitCode: 1,
          stdout: '',
          stderr: 'codex failed',
          sessionId: '019d9b79-4ccc-77e0-b41c-268d6c375467',
        })
      }),
    }

    await expect(
      runWorker(
        {
          actionId: ACTION_ID,
          dryRun: false,
          ghToken: 'gh-token',
        },
        {
          repoRoot: '/tmp/repo',
          repository,
          git,
          codex,
          gh: makeNoopGh(),
          now: () => new Date('2026-04-17T12:34:56.000Z'),
        },
      ),
    ).rejects.toMatchObject({
      message: 'codex failed',
      exitCode: 1,
      details: {
        status: 'failed',
      },
    })

    expect(repository.runs[0]?.status).toBe('failed')
    expect(repository.runs[0]?.error_log).toContain('codex failed')
    expect(repository.runs[0]?.error_log).toContain(
      'CLEANUP_WARNING: remove worktree failed',
    )
  })
})
