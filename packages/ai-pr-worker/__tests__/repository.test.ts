import { describe, expect, it } from 'vitest'

import { SupabaseAiPrWorkerRepository, mergeActionMetadata } from '../src/repository.js'
import { ACTION_ID, MemoryRepository } from './test-helpers.js'

describe('mergeActionMetadata', () => {
  it('preserves existing metadata and updates the ai_pr_worker backlink block', () => {
    expect(
      mergeActionMetadata(
        {
          existing: true,
          ai_pr_worker: {
            previous: 'value',
          },
        },
        {
          runId: 'run-1',
          branchName: 'ai-pr-worker/demo',
          prUrl: 'https://github.com/example/repo/pull/1',
          updatedAt: '2026-04-17T12:34:56.000Z',
        },
      ),
    ).toEqual({
      existing: true,
      ai_pr_worker: {
        previous: 'value',
        last_run_id: 'run-1',
        branch_name: 'ai-pr-worker/demo',
        pr_url: 'https://github.com/example/repo/pull/1',
        updated_at: '2026-04-17T12:34:56.000Z',
      },
    })
  })
})

describe('claimRun', () => {
  it('does not pass caller-controlled hourly limit or caller timestamps into the RPC', async () => {
    let capturedFn = ''
    let capturedArgs: Record<string, unknown> | null = null

    const client = {
      schema() {
        return {
          async rpc(fn: string, args: Record<string, unknown>) {
            capturedFn = fn
            capturedArgs = args
            return {
              data: {
                run_id: 'run-1',
                action_id: ACTION_ID,
                status: 'running',
                branch_name: null,
                pr_url: null,
                started_at: '2026-04-17T12:00:00.000Z',
                finished_at: null,
                error_log: null,
                codex_session_id: null,
                worker_subject: 'worker-subject',
                metadata: {},
              },
              error: null,
            }
          },
        }
      },
    }

    const repository = new SupabaseAiPrWorkerRepository(client as never)
    await repository.claimRun({
      actionId: ACTION_ID,
      status: 'running',
      branchName: null,
      prUrl: null,
      startedAt: '2026-04-17T12:00:00.000Z',
      finishedAt: null,
      errorLog: null,
      codexSessionId: null,
    })

    expect(capturedFn).toBe('claim_ai_pr_worker_run')
    expect(capturedArgs).not.toHaveProperty('p_hourly_limit')
    expect(capturedArgs).not.toHaveProperty('p_started_at')
  })

  it('still rate-limits concurrent claims without the caller supplying a cap', async () => {
    const repository = new MemoryRepository([], 1)

    const results = await Promise.all([
      repository.claimRun({
        actionId: ACTION_ID,
        status: 'running',
        branchName: null,
        prUrl: null,
        startedAt: '2026-04-17T12:00:00.000Z',
        finishedAt: null,
        errorLog: null,
        codexSessionId: null,
      }),
      repository.claimRun({
        actionId: ACTION_ID,
        status: 'running',
        branchName: null,
        prUrl: null,
        startedAt: '2026-04-17T12:00:00.000Z',
        finishedAt: null,
        errorLog: null,
        codexSessionId: null,
      }),
      repository.claimRun({
        actionId: ACTION_ID,
        status: 'running',
        branchName: null,
        prUrl: null,
        startedAt: '2026-04-17T12:00:00.000Z',
        finishedAt: null,
        errorLog: null,
        codexSessionId: null,
      }),
    ])

    expect(results.map((run) => run.status)).toEqual([
      'running',
      'running',
      'rate_limited',
    ])
  })
})

describe('updateActionBacklink', () => {
  it('invokes the atomic update_action_backlink RPC without a read-modify-write sequence', async () => {
    let capturedFn = ''
    let capturedArgs: Record<string, unknown> | null = null

    const client = {
      schema() {
        return {
          async rpc(fn: string, args: Record<string, unknown>) {
            capturedFn = fn
            capturedArgs = args
            return {
              data: {
                id: ACTION_ID,
                metadata: {
                  existing: true,
                  ai_pr_worker: args.p_backlink,
                },
              },
              error: null,
            }
          },
        }
      },
    }

    const repository = new SupabaseAiPrWorkerRepository(client as never)
    await repository.updateActionBacklink(ACTION_ID, {
      runId: 'run-1',
      branchName: 'ai-pr-worker/demo',
      prUrl: 'https://example.invalid/pr/demo',
      updatedAt: '2026-04-17T12:34:56.000Z',
    })

    expect(capturedFn).toBe('update_action_backlink')
    expect(capturedArgs).toEqual({
      p_action_id: ACTION_ID,
      p_backlink: {
        last_run_id: 'run-1',
        branch_name: 'ai-pr-worker/demo',
        pr_url: 'https://example.invalid/pr/demo',
        updated_at: '2026-04-17T12:34:56.000Z',
      },
    })
  })

  it('preserves unrelated metadata when two backlink RPC updates race', async () => {
    const sharedRow: {
      id: string
      metadata: {
        existing: boolean
        ai_pr_worker: Record<string, unknown>
      }
    } = {
      id: ACTION_ID,
      metadata: {
        existing: true,
        ai_pr_worker: {
          other: 'keep',
        },
      },
    }

    const client = {
      schema() {
        return {
          async rpc(_fn: string, args: Record<string, unknown>) {
            await Promise.resolve()
            const backlink = args.p_backlink as Record<string, unknown>
            sharedRow.metadata = {
              ...sharedRow.metadata,
              ai_pr_worker: {
                ...sharedRow.metadata.ai_pr_worker,
                ...backlink,
              },
            }
            return {
              data: {
                id: sharedRow.id,
                metadata: sharedRow.metadata,
              },
              error: null,
            }
          },
        }
      },
    }

    const repository = new SupabaseAiPrWorkerRepository(client as never)

    await Promise.all([
      repository.updateActionBacklink(ACTION_ID, {
        runId: 'run-1',
        branchName: 'ai-pr-worker/one',
        prUrl: 'https://example.invalid/pr/one',
        updatedAt: '2026-04-17T12:34:56.000Z',
      }),
      repository.updateActionBacklink(ACTION_ID, {
        runId: 'run-2',
        branchName: 'ai-pr-worker/two',
        prUrl: 'https://example.invalid/pr/two',
        updatedAt: '2026-04-17T12:34:57.000Z',
      }),
    ])

    expect(sharedRow.metadata.existing).toBe(true)
    expect(sharedRow.metadata.ai_pr_worker.other).toBe('keep')
    expect(sharedRow.metadata.ai_pr_worker.last_run_id).toMatch(/^run-[12]$/)
    expect(sharedRow.metadata.ai_pr_worker.branch_name).toMatch(
      /^ai-pr-worker\/(one|two)$/,
    )
  })
})
