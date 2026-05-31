import { describe, expect, it, vi } from 'vitest'

import {
  createNightlyDigestJob,
  executeSchedulerJob,
  type AuditLogInsert,
  type DuplicateRunInput,
  type FinishRunInput,
  type JobEffect,
  type NightlyDigestRecord,
  type NightlyDigestRepository,
  type NightlyWorkflowDefinition,
  type PersistDecisionInput,
  type PersistedDecision,
  type SchedulerJobHandler,
  type SchedulerRunRecord,
  type SchedulerStore,
  type StartRunInput,
  type StartRunResult,
} from '../src/index.js'

class MemorySchedulerStore implements SchedulerStore {
  readonly runs: SchedulerRunRecord[] = []
  readonly auditLog: AuditLogInsert[] = []
  readonly decisions: PersistedDecision[] = []

  private runSequence = 0
  private decisionSequence = 0
  private activeRunByJob = new Map<SchedulerRunRecord['jobName'], string>()

  async startRun(input: StartRunInput): Promise<StartRunResult> {
    const activeRunId = this.activeRunByJob.get(input.jobName) ?? null
    if (activeRunId) {
      return { ok: false, activeRunId }
    }

    const run: SchedulerRunRecord = {
      runId: `run-${++this.runSequence}`,
      jobName: input.jobName,
      scheduledAt: input.scheduledAt,
      startedAt: input.startedAt,
      finishedAt: null,
      status: 'running',
      triggeredBy: input.triggeredBy,
      cronExpression: input.cronExpression ?? null,
      outcomeSummary: {},
      errorMessage: null,
    }

    this.runs.push(run)
    this.activeRunByJob.set(input.jobName, run.runId)
    return { ok: true, run }
  }

  async finishRun(input: FinishRunInput) {
    const run = this.runs.find((candidate) => candidate.runId === input.runId)
    if (!run) {
      throw new Error(`Unknown run ${input.runId}`)
    }

    run.status = input.status
    run.finishedAt = input.finishedAt
    run.outcomeSummary = input.outcomeSummary
    run.errorMessage = input.errorMessage ?? null
    this.activeRunByJob.delete(run.jobName)
  }

  async recordDuplicateRun(input: DuplicateRunInput) {
    const run: SchedulerRunRecord = {
      runId: `run-${++this.runSequence}`,
      jobName: input.jobName,
      scheduledAt: input.scheduledAt,
      startedAt: input.startedAt,
      finishedAt: input.startedAt,
      status: 'skipped_duplicate',
      triggeredBy: input.triggeredBy,
      cronExpression: input.cronExpression ?? null,
      outcomeSummary: {
        duplicate_of_run_id: input.activeRunId ?? null,
      },
      errorMessage: null,
    }
    this.runs.push(run)
    return run
  }

  async recordSkippedUpstreamRun(input: {
    jobName: SchedulerRunRecord['jobName']
    scheduledAt: string
    startedAt: string
    triggeredBy: string
    cronExpression?: string | null
    upstreamJobName: SchedulerRunRecord['jobName']
    upstreamRunId?: string | null
  }) {
    const run: SchedulerRunRecord = {
      runId: `run-${++this.runSequence}`,
      jobName: input.jobName,
      scheduledAt: input.scheduledAt,
      startedAt: input.startedAt,
      finishedAt: input.startedAt,
      status: 'skipped_upstream_failed',
      triggeredBy: input.triggeredBy,
      cronExpression: input.cronExpression ?? null,
      outcomeSummary: {
        skipped_due_to_job_name: input.upstreamJobName,
        skipped_due_to_run_id: input.upstreamRunId ?? null,
      },
      errorMessage: null,
    }
    this.runs.push(run)
    return run
  }

  async appendAuditLog(entry: AuditLogInsert) {
    this.auditLog.push({
      ...entry,
      createdAt: entry.createdAt ?? FIXED_NOW.toISOString(),
    })
  }

  async upsertDecision(input: PersistDecisionInput) {
    const persisted: PersistedDecision = {
      id: `proposal-${++this.decisionSequence}`,
      capabilitySlug: input.capabilitySlug,
      outcomeSlug: input.outcomeSlug,
      priority: input.priority,
      weakestAxis: input.weakestAxis,
      actionClass: input.actionClass,
      ownerApproval: input.ownerApproval,
      status: input.status,
      metadata: {
        ...(input.metadata ?? {}),
        action_class: input.actionClass,
        scheduler_job_name: input.schedulerJobName,
        scheduler_run_id: input.schedulerRunId,
      },
    }
    this.decisions.push(persisted)
    return persisted
  }
}

class MemoryNightlyDigestRepository implements NightlyDigestRepository {
  record: NightlyDigestRecord | null = null

  constructor(private readonly store: MemorySchedulerStore) {}

  async getDigestByRunDate(runDate: string) {
    if (this.record?.runDate === runDate) {
      return structuredClone(this.record)
    }
    return null
  }

  async upsertDigest(input: {
    runDate: string
    status: NightlyDigestRecord['status']
    startedAt: string
    finishedAt: string | null
    newGapCount: number
    newProposalCount: number
    judgeScoreHistogram: Record<string, number>
    pendingOwnerReviewCount: number
    failedStages: NightlyDigestRecord['failedStages']
    summary: string | null
  }) {
    this.record = {
      digestId: this.record?.digestId ?? 'digest-1',
      runDate: input.runDate,
      status: input.status,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      newGapCount: input.newGapCount,
      newProposalCount: input.newProposalCount,
      judgeScoreHistogram: input.judgeScoreHistogram,
      pendingOwnerReviewCount: input.pendingOwnerReviewCount,
      failedStages: input.failedStages,
      summary: input.summary,
    }
    return structuredClone(this.record)
  }

  async countPendingOwnerReview() {
    return this.store.decisions.filter(
      (decision) => decision.ownerApproval === 'pending_owner_review',
    ).length
  }
}

const FIXED_NOW = new Date('2026-04-17T17:00:00.000Z')

const TEST_WORKFLOW: NightlyWorkflowDefinition = {
  timezone: 'Asia/Tokyo',
  defaultTimeoutMs: 10_000,
  defaultRetry: {
    maxAttempts: 2,
    initialDelayMs: 10,
    backoffMultiplier: 2,
  },
  stages: [
    {
      jobName: 'matcher_sweep',
      timeoutMs: 10_000,
      retry: { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 2 },
      skipOnUpstreamFailure: false,
    },
    {
      jobName: 'gap_scan',
      timeoutMs: 10_000,
      retry: { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 2 },
      skipOnUpstreamFailure: true,
    },
    {
      jobName: 'proposer_run',
      timeoutMs: 10_000,
      retry: { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 2 },
      skipOnUpstreamFailure: true,
    },
    {
      jobName: 'judge_run',
      timeoutMs: 10_000,
      retry: { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 2 },
      skipOnUpstreamFailure: true,
    },
    {
      jobName: 'nightly_digest',
      timeoutMs: 10_000,
      retry: { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 2 },
      skipOnUpstreamFailure: false,
    },
  ],
}

function makeStageJob(
  jobName: SchedulerRunRecord['jobName'],
  run: () => Promise<JobEffect>,
): SchedulerJobHandler {
  return {
    jobName,
    run: async () => run(),
  }
}

function makePendingDecision() {
  return {
    capabilitySlug: 'build',
    outcomeSlug: 'create_asset',
    priority: 'mid' as const,
    weakestAxis: 'capability' as const,
    actionClass: 'lesson_rewrite' as const,
    rationale: 'Requires owner review',
    metadata: {
      goal_id: '22222222-2222-4222-8222-222222222222',
      priority: 'mid',
    },
  }
}

describe('nightly digest workflow', () => {
  it('runs stages in order and skips downstream stages after an upstream failure', async () => {
    const store = new MemorySchedulerStore()
    const repository = new MemoryNightlyDigestRepository(store)
    const calls: string[] = []

    const result = await executeSchedulerJob(
      createNightlyDigestJob({
        store,
        repository,
        workflow: TEST_WORKFLOW,
        now: () => new Date(FIXED_NOW),
        stageJobs: {
          matcher_sweep: makeStageJob('matcher_sweep', async () => {
            calls.push('matcher_sweep')
            return {
              summary: { matcher_candidates: 1 },
            }
          }),
          gap_scan: makeStageJob('gap_scan', async () => {
            calls.push('gap_scan')
            throw new Error('gap failed')
          }),
          proposer_run: makeStageJob('proposer_run', async () => {
            calls.push('proposer_run')
            return { decisions: [makePendingDecision()] }
          }),
          judge_run: makeStageJob('judge_run', async () => {
            calls.push('judge_run')
            return {
              summary: { judge_score_histogram: { '8-10': 1 } },
            }
          }),
        },
      }),
      store,
      {
        now: () => new Date(FIXED_NOW),
        triggeredBy: 'vitest',
      },
    )

    expect(result.exitCode).toBe(0)
    expect(calls).toEqual(['matcher_sweep', 'gap_scan', 'gap_scan'])
    expect(store.runs.map((run) => [run.jobName, run.status])).toEqual([
      ['nightly_digest', 'success'],
      ['matcher_sweep', 'success'],
      ['gap_scan', 'failed'],
      ['gap_scan', 'failed'],
      ['proposer_run', 'skipped_upstream_failed'],
      ['judge_run', 'skipped_upstream_failed'],
    ])
    expect(repository.record?.failedStages).toEqual(['gap_scan'])
    expect(repository.record?.status).toBe('completed_with_failures')
    expect(store.auditLog.map((entry) => entry.eventType)).toContain(
      'scheduler.workflow.stage.skipped_upstream_failed',
    )
  })

  it('retries transient failures with exponential backoff and completes on a later attempt', async () => {
    const store = new MemorySchedulerStore()
    const repository = new MemoryNightlyDigestRepository(store)
    const sleepMock = vi.fn(async () => {})
    let gapAttempts = 0

    const result = await executeSchedulerJob(
      createNightlyDigestJob({
        store,
        repository,
        workflow: TEST_WORKFLOW,
        now: () => new Date(FIXED_NOW),
        sleep: sleepMock,
        stageJobs: {
          matcher_sweep: makeStageJob('matcher_sweep', async () => ({
            summary: { matcher_candidates: 1 },
          })),
          gap_scan: makeStageJob('gap_scan', async () => {
            gapAttempts += 1
            if (gapAttempts === 1) {
              throw new Error('first gap attempt failed')
            }
            return {
              summary: { new_gap_count: 3 },
            }
          }),
          proposer_run: makeStageJob('proposer_run', async () => ({
            decisions: [makePendingDecision()],
          })),
          judge_run: makeStageJob('judge_run', async () => ({
            summary: { judge_score_histogram: { '8-10': 2 } },
          })),
        },
      }),
      store,
      {
        now: () => new Date(FIXED_NOW),
        triggeredBy: 'vitest',
      },
    )

    expect(result.exitCode).toBe(0)
    expect(gapAttempts).toBe(2)
    expect(sleepMock).toHaveBeenCalledWith(10)
    expect(store.runs.filter((run) => run.jobName === 'gap_scan')).toHaveLength(2)
    expect(repository.record?.status).toBe('completed')
    expect(repository.record?.newGapCount).toBe(3)
    expect(repository.record?.newProposalCount).toBe(1)
  })

  it('aborts a timed-out stage before retrying and suppresses post-abort audit writes', async () => {
    const store = new MemorySchedulerStore()
    const repository = new MemoryNightlyDigestRepository(store)
    let gapAttempts = 0
    const gapAttemptStartedAt: number[] = []

    const timeoutWorkflow: NightlyWorkflowDefinition = {
      ...TEST_WORKFLOW,
      stages: TEST_WORKFLOW.stages.map((stage) =>
        stage.jobName === 'gap_scan'
          ? {
              ...stage,
              timeoutMs: 5,
            }
          : stage,
      ),
    }

    const result = await executeSchedulerJob(
      createNightlyDigestJob({
        store,
        repository,
        workflow: timeoutWorkflow,
        now: () => new Date(FIXED_NOW),
        sleep: async () => {},
        unwindGraceMs: 50,
        stageJobs: {
          matcher_sweep: makeStageJob('matcher_sweep', async () => ({
            summary: { matcher_candidates: 1 },
          })),
          gap_scan: {
            jobName: 'gap_scan',
            async run(context) {
              gapAttempts += 1
              gapAttemptStartedAt.push(Date.now())

              if (gapAttempts === 1) {
                return await new Promise<JobEffect>((_resolve, reject) => {
                  context.signal?.addEventListener(
                    'abort',
                    () => {
                      setTimeout(() => {
                        reject(context.signal?.reason ?? new Error('aborted'))
                      }, 20)
                    },
                    { once: true },
                  )
                })
              }

              return {
                summary: { new_gap_count: 2 },
              }
            },
          },
          proposer_run: makeStageJob('proposer_run', async () => ({
            decisions: [makePendingDecision()],
          })),
          judge_run: makeStageJob('judge_run', async () => ({
            summary: { judge_score_histogram: { '8-10': 1 } },
          })),
        },
      }),
      store,
      {
        now: () => new Date(FIXED_NOW),
        triggeredBy: 'vitest',
      },
    )

    const auditCountAfterRun = store.auditLog.length
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(result.exitCode).toBe(0)
    expect(gapAttempts).toBe(2)
    expect(gapAttemptStartedAt[1]! - gapAttemptStartedAt[0]!).toBeGreaterThanOrEqual(20)
    expect(store.runs.filter((run) => run.jobName === 'gap_scan')).toHaveLength(2)
    expect(
      store.auditLog.filter(
        (entry) => entry.eventType === 'scheduler.workflow.stage.aborted',
      ),
    ).toHaveLength(1)
    expect(
      store.auditLog.filter(
        (entry) => entry.eventType === 'scheduler.workflow.stage.retrying',
      ),
    ).toHaveLength(1)
    expect(
      store.auditLog.filter(
        (entry) =>
          entry.eventType === 'scheduler.workflow.stage.started' &&
          (entry.metadata as Record<string, unknown>)?.stage_job_name === 'gap_scan',
      ),
    ).toHaveLength(2)
    expect(store.auditLog).toHaveLength(auditCountAfterRun)
  })

  it('marks the digest failed when an unhandled error occurs after setting running status', async () => {
    const store = new MemorySchedulerStore()
    const repository = new MemoryNightlyDigestRepository(store)
    const failingRepository: NightlyDigestRepository = {
      getDigestByRunDate: (runDate) => repository.getDigestByRunDate(runDate),
      upsertDigest: (input) => repository.upsertDigest(input),
      async countPendingOwnerReview() {
        throw new Error('pending count lookup failed')
      },
    }

    const result = await executeSchedulerJob(
      createNightlyDigestJob({
        store,
        repository: failingRepository,
        workflow: TEST_WORKFLOW,
        now: () => new Date(FIXED_NOW),
        stageJobs: {
          matcher_sweep: makeStageJob('matcher_sweep', async () => ({
            summary: { matcher_candidates: 1 },
          })),
          gap_scan: makeStageJob('gap_scan', async () => ({
            summary: { new_gap_count: 1 },
          })),
          proposer_run: makeStageJob('proposer_run', async () => ({
            decisions: [makePendingDecision()],
          })),
          judge_run: makeStageJob('judge_run', async () => ({
            summary: { judge_score_histogram: { '8-10': 1 } },
          })),
        },
      }),
      store,
      {
        now: () => new Date(FIXED_NOW),
        triggeredBy: 'vitest',
      },
    )

    expect(result.exitCode).toBe(1)
    expect(repository.record?.status).toBe('failed')
    expect(repository.record?.summary).toContain('pending count lookup failed')
  })

  it('treats a second run on the same JST day as a no-op once a digest is completed', async () => {
    const store = new MemorySchedulerStore()
    const repository = new MemoryNightlyDigestRepository(store)

    const job = createNightlyDigestJob({
      store,
      repository,
      workflow: TEST_WORKFLOW,
      now: () => new Date(FIXED_NOW),
      stageJobs: {
        matcher_sweep: makeStageJob('matcher_sweep', async () => ({
          summary: { matcher_candidates: 1 },
        })),
        gap_scan: makeStageJob('gap_scan', async () => ({
          summary: { new_gap_count: 1 },
        })),
        proposer_run: makeStageJob('proposer_run', async () => ({
          decisions: [makePendingDecision()],
        })),
        judge_run: makeStageJob('judge_run', async () => ({
          summary: { judge_score_histogram: { '8-10': 1 } },
        })),
      },
    })

    const first = await executeSchedulerJob(job, store, {
      now: () => new Date(FIXED_NOW),
      triggeredBy: 'vitest',
    })
    const runCountAfterFirst = store.runs.length

    const second = await executeSchedulerJob(job, store, {
      now: () => new Date(FIXED_NOW),
      triggeredBy: 'vitest',
    })

    expect(first.exitCode).toBe(0)
    expect(second.exitCode).toBe(0)
    expect(store.runs.length).toBe(runCountAfterFirst + 1)
    expect(store.runs.at(-1)?.jobName).toBe('nightly_digest')
    expect(store.runs.at(-1)?.outcomeSummary).toMatchObject({
      skipped_existing_completed: true,
    })
    expect(repository.record?.status).toBe('completed')
  })
})
