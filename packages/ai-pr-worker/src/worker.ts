import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { CodexAdapterError, type CodexAdapter } from './codex-adapter.js'
import type { GhAdapter } from './gh-adapter.js'
import type { GitClient } from './git.js'
import { WorkerExitError, toErrorMessage } from './errors.js'
import {
  buildBranchName,
  buildCodexPrompt,
  buildCommitMessage,
  buildPullRequestBody,
  buildPullRequestTitle,
  buildWorktreePath,
} from './prompt.js'
import type { AiPrWorkerRepository } from './repository.js'
import type {
  ProposedActionRow,
  WorkerResult,
} from './schema.js'

export interface RunWorkerInput {
  actionId: string
  dryRun: boolean
  ghToken?: string
}

export interface WorkerDeps {
  repoRoot: string
  repository: AiPrWorkerRepository
  git: GitClient
  codex: CodexAdapter
  gh: GhAdapter
  now?: () => Date
  sleep?: (ms: number) => Promise<void>
  approvalPollIntervalMs?: number
  approvalTimeoutMs?: number | null
}

export function currentHourWindow(now: Date): { startIso: string; endIso: string } {
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  const end = new Date(start)
  end.setHours(end.getHours() + 1)
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  }
}

async function safeReadText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function waitForOwnerApproval(
  actionId: string,
  repository: AiPrWorkerRepository,
  options: {
    now: () => Date
    sleep: (ms: number) => Promise<void>
    pollIntervalMs: number
    timeoutMs: number | null
  },
): Promise<ProposedActionRow> {
  const startedAt = options.now().getTime()

  while (true) {
    const action = await repository.loadAction(actionId)
    if (action.status !== 'approved') {
      throw new WorkerExitError(
        `Action ${actionId} is not approved (status=${action.status})`,
        2,
      )
    }

    if (action.owner_approval === 'approved') {
      return action
    }

    if (action.owner_approval === 'rejected') {
      throw new WorkerExitError(
        `Action ${actionId} owner approval was rejected`,
        2,
      )
    }

    if (
      options.timeoutMs !== null &&
      options.now().getTime() - startedAt >= options.timeoutMs
    ) {
      throw new WorkerExitError(
        `Timed out waiting for owner approval on action ${actionId}`,
        1,
      )
    }

    await options.sleep(options.pollIntervalMs)
  }
}

export async function runWorker(
  input: RunWorkerInput,
  deps: WorkerDeps,
): Promise<WorkerResult> {
  const now = deps.now ?? (() => new Date())
  const sleep = deps.sleep ?? (async (ms: number) => {
    await new Promise((resolve) => setTimeout(resolve, ms))
  })
  const pollIntervalMs = deps.approvalPollIntervalMs ?? 5_000
  const approvalTimeoutMs = deps.approvalTimeoutMs ?? null
  const startedAt = now().toISOString()

  const action = await deps.repository.loadAction(input.actionId)
  if (action.status !== 'approved') {
    const run = await deps.repository.createRun({
      actionId: input.actionId,
      status: 'rejected',
      branchName: null,
      prUrl: null,
      startedAt,
      finishedAt: startedAt,
      errorLog: `Action ${input.actionId} is not approved (status=${action.status})`,
      codexSessionId: null,
    })
    throw new WorkerExitError(
      `Action ${input.actionId} is not approved (status=${action.status})`,
      2,
      { runId: run.run_id, status: 'rejected' },
    )
  }

  if (action.owner_approval === 'rejected') {
    const run = await deps.repository.createRun({
      actionId: input.actionId,
      status: 'rejected',
      branchName: null,
      prUrl: null,
      startedAt,
      finishedAt: startedAt,
      errorLog: `Action ${input.actionId} owner approval was rejected`,
      codexSessionId: null,
    })
    throw new WorkerExitError(
      `Action ${input.actionId} owner approval was rejected`,
      2,
      { runId: run.run_id, status: 'rejected' },
    )
  }

  const run = await deps.repository.claimRun({
    actionId: input.actionId,
    status:
      action.owner_approval === 'approved'
        ? 'running'
        : 'pending_owner_approval',
    branchName: null,
    prUrl: null,
    startedAt,
    finishedAt: null,
    errorLog: null,
    codexSessionId: null,
  })

  if (run.status === 'rate_limited') {
    throw new WorkerExitError(
      'AI PR worker rate limit exceeded for the current hour',
      3,
      { runId: run.run_id, status: 'rate_limited' },
    )
  }

  let latestAction = action
  if (latestAction.owner_approval === 'pending') {
    try {
      latestAction = await waitForOwnerApproval(input.actionId, deps.repository, {
        now,
        sleep,
        pollIntervalMs,
        timeoutMs: approvalTimeoutMs,
      })
      await deps.repository.updateRun(run.run_id, {
        status: 'running',
      })
    } catch (error) {
      const status =
        error instanceof WorkerExitError && error.exitCode === 2
          ? 'rejected'
          : 'failed'
      const finishedAt = now().toISOString()
      await deps.repository.updateRun(run.run_id, {
        status,
        finishedAt,
        errorLog: toErrorMessage(error),
      })

      if (error instanceof WorkerExitError) {
        throw new WorkerExitError(error.message, error.exitCode, {
          runId: run.run_id,
          status,
        })
      }

      throw new WorkerExitError(toErrorMessage(error), 1, {
        runId: run.run_id,
        status,
      })
    }
  }

  if (input.dryRun) {
    const finishedAt = now().toISOString()
    await deps.repository.updateRun(run.run_id, {
      status: 'dry_run',
      finishedAt,
    })
    return {
      runId: run.run_id,
      status: 'dry_run',
      branchName: null,
      prUrl: null,
      codexSessionId: null,
      cleanupWarnings: [],
    }
  }

  const requireGhToken =
    deps.codex.mode === 'real' || deps.gh.mode === 'real'

  if (requireGhToken && !input.ghToken) {
    const finishedAt = now().toISOString()
    await deps.repository.updateRun(run.run_id, {
      status: 'failed',
      finishedAt,
      errorLog: 'GH_TOKEN is required for real codex execution',
    })
    throw new WorkerExitError(
      'GH_TOKEN is required for real codex execution',
      1,
      { runId: run.run_id, status: 'failed' },
    )
  }

  const branchName = buildBranchName(input.actionId, run.run_id)
  const worktreePath = buildWorktreePath(deps.repoRoot, input.actionId, run.run_id)
  const outputDir = join(worktreePath, '.ai-pr-worker')
  const outputLastMessagePath = join(outputDir, `${run.run_id}-last-message.md`)

  let codexSessionId: string | null = null
  let prUrl: string | null = null
  let pushed = false
  let result: WorkerResult | null = null
  let failure: WorkerExitError | null = null
  let failureMessage: string | null = null
  const warnings: string[] = []

  try {
    await deps.git.createWorktree({
      repoRoot: deps.repoRoot,
      branchName,
      worktreePath,
    })
    await mkdir(outputDir, { recursive: true })

    const codexPrompt = buildCodexPrompt(latestAction)
    const codexResult = await deps.codex.exec({
      worktreePath,
      prompt: codexPrompt,
      outputLastMessagePath,
      ghToken: input.ghToken ?? '',
    })
    codexSessionId = codexResult.sessionId

    await deps.git.ensureChanges(worktreePath)
    await deps.git.commitAll(worktreePath, buildCommitMessage(latestAction))
    await deps.git.pushBranch(worktreePath, branchName)
    pushed = true

    const lastMessage = await safeReadText(outputLastMessagePath)
    const prResult = await deps.gh.createPullRequest({
      worktreePath,
      title: buildPullRequestTitle(latestAction),
      body: buildPullRequestBody(latestAction, lastMessage),
      headBranch: branchName,
    })

    prUrl = prResult.url

    const finishedAt = now().toISOString()
    await deps.repository.updateRun(run.run_id, {
      status: 'succeeded',
      branchName,
      prUrl,
      finishedAt,
      codexSessionId,
      errorLog: null,
    })
    result = {
      runId: run.run_id,
      status: 'succeeded',
      branchName,
      prUrl,
      codexSessionId,
      cleanupWarnings: [],
    }
  } catch (error) {
    if (error instanceof CodexAdapterError && error.sessionId) {
      codexSessionId = error.sessionId
    }
    const finishedAt = now().toISOString()
    const message = toErrorMessage(error)
    failureMessage = message

    await deps.repository.updateRun(run.run_id, {
      status: 'failed',
      branchName,
      prUrl,
      finishedAt,
      codexSessionId,
      errorLog: message,
    })

    failure = new WorkerExitError(message, 1, {
      runId: run.run_id,
      status: 'failed',
    })
  } finally {
    for (const step of [
      async () => deps.git.removeWorktree(deps.repoRoot, worktreePath),
      async () => deps.git.deleteLocalBranch(deps.repoRoot, branchName),
    ]) {
      try {
        await step()
      } catch (error) {
        warnings.push(toErrorMessage(error))
      }
    }

    if (!pushed) {
      prUrl = null
    }
  }

  if (result) {
    try {
      await deps.repository.updateActionBacklink(input.actionId, {
        runId: run.run_id,
        branchName,
        prUrl,
        updatedAt: now().toISOString(),
      })
    } catch (error) {
      warnings.push(`BACKLINK_WARNING: ${toErrorMessage(error)}`)
    }
  }

  if (warnings.length > 0) {
    if (result) {
      try {
        await deps.repository.updateRun(run.run_id, {
          metadata: {
            cleanup_warnings: warnings,
          },
        })
      } catch {
        // Warning persistence must never override the worker result.
      }
      result = {
        ...result,
        cleanupWarnings: [...warnings],
      }
    } else if (failure && failureMessage) {
      try {
        await deps.repository.updateRun(run.run_id, {
          errorLog: [
            failureMessage,
            ...warnings.map((warning) => `CLEANUP_WARNING: ${warning}`),
          ].join('\n'),
          metadata: {
            cleanup_warnings: warnings,
          },
          codexSessionId,
        })
      } catch {
        // Warning persistence must never override the worker failure.
      }
    }
  }

  if (failure) throw failure
  if (!result) {
    throw new WorkerExitError('Worker completed without a result', 1, {
      runId: run.run_id,
      status: 'failed',
    })
  }

  return result
}
