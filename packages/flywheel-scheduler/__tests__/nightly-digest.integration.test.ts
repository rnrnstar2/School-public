import { describe, expect, it } from 'vitest'

import {
  MockPrWorker,
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
      createdAt: entry.createdAt ?? NOW.toISOString(),
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
    return this.record?.runDate === runDate ? structuredClone(this.record) : null
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

const NOW = new Date('2026-04-17T17:00:00.000Z')

const WORKFLOW: NightlyWorkflowDefinition = {
  timezone: 'Asia/Tokyo',
  defaultTimeoutMs: 10_000,
  defaultRetry: { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 2 },
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

describe('nightly digest integration smoke', () => {
  it('writes scheduler runs, append-only audit log entries, digest counts, and pending approvals with fake adapters', async () => {
    const store = new MemorySchedulerStore()
    const repository = new MemoryNightlyDigestRepository(store)
    const prWorker = new MockPrWorker()

    const result = await executeSchedulerJob(
      createNightlyDigestJob({
        store,
        repository,
        workflow: WORKFLOW,
        now: () => new Date(NOW),
        prWorker,
        stageJobs: {
          matcher_sweep: makeStageJob('matcher_sweep', async () => ({
            summary: { matcher_candidates: 4 },
          })),
          gap_scan: makeStageJob('gap_scan', async () => ({
            summary: { new_gap_count: 2 },
          })),
          proposer_run: makeStageJob('proposer_run', async () => ({
            decisions: [
              {
                capabilitySlug: 'build',
                outcomeSlug: 'create_asset',
                priority: 'mid',
                weakestAxis: 'capability',
                actionClass: 'micro_patch_existing_lesson',
                rationale: 'Safe auto patch',
                metadata: {
                  goal_id: '22222222-2222-4222-8222-222222222222',
                  priority: 'mid',
                },
              },
              {
                capabilitySlug: 'ship',
                outcomeSlug: 'publish',
                priority: 'high',
                weakestAxis: 'blocker',
                actionClass: 'lesson_rewrite',
                rationale: 'Requires owner review',
                metadata: {
                  goal_id: '22222222-2222-4222-8222-222222222222',
                  priority: 'high',
                },
              },
            ],
          })),
          judge_run: makeStageJob('judge_run', async () => ({
            summary: {
              judge_score_histogram: {
                '0-4': 0,
                '5-7': 1,
                '8-10': 1,
              },
            },
          })),
        },
      }),
      store,
      {
        now: () => new Date(NOW),
        triggeredBy: 'integration-test',
        prWorker,
      },
    )

    expect(result.exitCode).toBe(0)
    expect(store.runs.map((run) => run.jobName)).toEqual([
      'nightly_digest',
      'matcher_sweep',
      'gap_scan',
      'proposer_run',
      'judge_run',
    ])
    expect(store.runs.every((run) => run.status === 'success')).toBe(true)
    expect(store.auditLog.map((entry) => entry.eventType)).toEqual(
      expect.arrayContaining([
        'scheduler.run.started',
        'scheduler.run.completed',
        'scheduler.decision.persisted',
        'scheduler.ai_pr_worker.triggered',
        'scheduler.workflow.stage.started',
        'scheduler.workflow.stage.completed',
      ]),
    )
    expect(prWorker.calls).toHaveLength(1)
    expect(repository.record).toMatchObject({
      runDate: '2026-04-18',
      status: 'completed',
      newGapCount: 2,
      newProposalCount: 2,
      pendingOwnerReviewCount: 1,
      judgeScoreHistogram: {
        '0-4': 0,
        '5-7': 1,
        '8-10': 1,
      },
    })
    expect(repository.record?.summary).toContain('1 pending owner reviews')
  })
})
