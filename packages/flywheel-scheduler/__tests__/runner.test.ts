import { describe, expect, it } from 'vitest'

import {
  MockPrWorker,
  createGapScanJob,
  createJudgeRunJob,
  createMatcherSweepJob,
  createProposerRunJob,
  executeSchedulerJob,
  type AuditLogInsert,
  type DuplicateRunInput,
  type FinishRunInput,
  type PersistDecisionInput,
  type PersistedDecision,
  type SchedulerDecisionCandidate,
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
      return {
        ok: false,
        activeRunId,
      }
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

    return {
      ok: true,
      run,
    }
  }

  async finishRun(input: FinishRunInput) {
    const run = this.runs.find((candidate) => candidate.runId === input.runId)
    if (!run) {
      throw new Error(`run ${input.runId} not found`)
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
    this.auditLog.push(entry)
  }

  async upsertDecision(input: PersistDecisionInput) {
    const id = `proposal-${++this.decisionSequence}`
    const existingIndex = this.decisions.findIndex(
      (decision) =>
        decision.capabilitySlug === input.capabilitySlug &&
        decision.outcomeSlug === input.outcomeSlug,
    )

    const persisted: PersistedDecision = {
      id: existingIndex >= 0 ? this.decisions[existingIndex]!.id : id,
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

    if (existingIndex >= 0) {
      this.decisions[existingIndex] = persisted
    } else {
      this.decisions.push(persisted)
    }

    return persisted
  }
}

const FIXED_NOW = () => new Date('2026-04-17T17:00:00.000Z')

function makeDecision(
  actionClass: SchedulerDecisionCandidate['actionClass'] = 'lesson_rewrite',
): SchedulerDecisionCandidate {
  return {
    capabilitySlug: 'build',
    outcomeSlug: 'create_asset',
    priority: 'mid',
    weakestAxis: 'capability',
    actionClass,
    rationale: 'Test decision',
    metadata: {
      source: 'vitest',
    },
  }
}

const jobFactories = [
  ['matcher_sweep', createMatcherSweepJob],
  ['gap_scan', createGapScanJob],
  ['proposer_run', createProposerRunJob],
  ['judge_run', createJudgeRunJob],
] as const

describe('scheduler job runner', () => {
  it.each(jobFactories)(
    '%s persists mocked decisions and appends audit events',
    async (_label, factory) => {
      const store = new MemorySchedulerStore()
      const job = factory({
        async collect() {
          return {
            summary: {
              candidates: 1,
            },
            decisions: [makeDecision()],
          }
        },
      })

      const result = await executeSchedulerJob(job, store, {
        now: FIXED_NOW,
        triggeredBy: 'vitest',
      })

      expect(result.exitCode).toBe(0)
      expect(result.run.status).toBe('success')
      expect(store.decisions).toHaveLength(1)
      expect(store.decisions[0]?.ownerApproval).toBe('pending_owner_review')
      expect(store.auditLog.map((entry) => entry.eventType)).toEqual(
        expect.arrayContaining([
          'scheduler.run.started',
          'scheduler.decision.persisted',
          'scheduler.run.completed',
        ]),
      )
    },
  )

  it('returns exit code 3 and skipped_duplicate when a job is already running', async () => {
    const store = new MemorySchedulerStore()
    await store.startRun({
      jobName: 'proposer_run',
      scheduledAt: FIXED_NOW().toISOString(),
      startedAt: FIXED_NOW().toISOString(),
      triggeredBy: 'preflight',
      cronExpression: '0 2 * * *',
    })

    const result = await executeSchedulerJob(
      createProposerRunJob({
        async collect() {
          return {
            decisions: [makeDecision()],
          }
        },
      }),
      store,
      {
        now: FIXED_NOW,
      },
    )

    expect(result.exitCode).toBe(3)
    expect(result.run.status).toBe('skipped_duplicate')
    expect(store.auditLog.at(-1)?.eventType).toBe(
      'scheduler.run.skipped_duplicate',
    )
  })

  it('triggers the PR worker for auto-approved micro patches', async () => {
    const store = new MemorySchedulerStore()
    const prWorker = new MockPrWorker()

    const result = await executeSchedulerJob(
      createProposerRunJob({
        async collect() {
          return {
            decisions: [makeDecision('micro_patch_existing_lesson')],
          }
        },
      }),
      store,
      {
        now: FIXED_NOW,
        prWorker,
      },
    )

    expect(result.exitCode).toBe(0)
    expect(prWorker.calls).toHaveLength(1)
    expect(store.decisions[0]?.ownerApproval).toBe('auto')
    expect(store.auditLog.map((entry) => entry.eventType)).toContain(
      'scheduler.ai_pr_worker.triggered',
    )
  })
})
