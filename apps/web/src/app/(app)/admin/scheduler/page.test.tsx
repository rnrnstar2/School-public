import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from '@supabase/supabase-js'
import {
  MockPrWorker,
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
} from '@school/flywheel-scheduler'
import { describe, expect, it, vi } from 'vitest'

import { PendingApprovalsPanel } from '@/components/admin/scheduler/pending-approvals-panel'
import {
  loadSchedulerConsole,
  reviewSchedulerDecision,
  SchedulerDecisionConflictError,
  type SchedulerAdminRepository,
} from '@/lib/scheduler/admin'

const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: refreshMock,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/admin/scheduler',
}))

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
    this.auditLog.push({
      ...entry,
      createdAt: entry.createdAt ?? new Date().toISOString(),
    })
  }

  async upsertDecision(input: PersistDecisionInput) {
    const existingIndex = this.decisions.findIndex(
      (decision) =>
        decision.capabilitySlug === input.capabilitySlug &&
        decision.outcomeSlug === input.outcomeSlug,
    )

    const persisted: PersistedDecision = {
      id:
        existingIndex >= 0
          ? this.decisions[existingIndex]!.id
          : `proposal-${++this.decisionSequence}`,
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

class MemorySchedulerAdminRepository implements SchedulerAdminRepository {
  constructor(private readonly store: MemorySchedulerStore) {}

  async listPendingApprovals() {
    return this.store.decisions
      .filter((decision) => decision.ownerApproval === 'pending_owner_review')
      .map((decision) => ({
        id: decision.id,
        capabilitySlug: decision.capabilitySlug,
        outcomeSlug: decision.outcomeSlug,
        priority: decision.priority,
        status: decision.status,
        ownerApproval: decision.ownerApproval,
        weakestAxis: decision.weakestAxis,
        actionClass: decision.actionClass,
        candidateLessonSlug: null,
        rationale: 'Integration test decision',
        proposedBy: 'scheduler',
        proposedAt: FIXED_NOW().toISOString(),
        ownerReviewedBy: null,
        ownerReviewedAt: null,
        ownerReviewReason: null,
        schedulerRunId:
          typeof decision.metadata.scheduler_run_id === 'string'
            ? decision.metadata.scheduler_run_id
            : null,
        schedulerJobName:
          typeof decision.metadata.scheduler_job_name === 'string'
            ? (decision.metadata.scheduler_job_name as SchedulerRunRecord['jobName'])
            : null,
        metadata: decision.metadata,
      }))
  }

  async listSchedulerRuns() {
    return this.store.runs.map((run) => ({
      ...run,
    }))
  }

  async listAuditLog() {
    return this.store.auditLog.map((entry, index) => ({
      auditId: `audit-${index + 1}`,
      runId: entry.runId ?? null,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      eventType: entry.eventType,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      message: entry.message ?? null,
      metadata: entry.metadata ?? {},
      createdAt: entry.createdAt ?? FIXED_NOW().toISOString(),
    }))
  }

  async getDecision(proposalId: string) {
    const decision = this.store.decisions.find((candidate) => candidate.id === proposalId)
    if (!decision) {
      return null
    }

    return {
      id: decision.id,
      capabilitySlug: decision.capabilitySlug,
      outcomeSlug: decision.outcomeSlug,
      priority: decision.priority,
      status: decision.status,
      ownerApproval: decision.ownerApproval,
      weakestAxis: decision.weakestAxis,
      actionClass: decision.actionClass,
      candidateLessonSlug: null,
      rationale: 'Integration test decision',
      proposedBy: 'scheduler',
      proposedAt: FIXED_NOW().toISOString(),
      ownerReviewedBy: null,
      ownerReviewedAt: null,
      ownerReviewReason: null,
      schedulerRunId:
        typeof decision.metadata.scheduler_run_id === 'string'
          ? decision.metadata.scheduler_run_id
          : null,
      schedulerJobName:
        typeof decision.metadata.scheduler_job_name === 'string'
          ? (decision.metadata.scheduler_job_name as SchedulerRunRecord['jobName'])
          : null,
      metadata: decision.metadata,
    }
  }

  async beginDecisionReview(input: {
    proposalId: string
    reviewerLabel: string
    reviewedAt: string
    reason: string | null
  }) {
    const decision = this.store.decisions.find((candidate) => candidate.id === input.proposalId)
    if (!decision) {
      throw new Error('decision not found')
    }

    if (decision.ownerApproval !== 'pending_owner_review') {
      throw new SchedulerDecisionConflictError(input.proposalId)
    }

    if (decision.metadata.owner_reviewed_by || decision.metadata.owner_reviewed_at) {
      throw new SchedulerDecisionConflictError(input.proposalId)
    }

    decision.metadata.owner_reviewed_by = input.reviewerLabel
    decision.metadata.owner_reviewed_at = input.reviewedAt
    decision.metadata.owner_review_reason = input.reason

    return {
      id: decision.id,
      capabilitySlug: decision.capabilitySlug,
      outcomeSlug: decision.outcomeSlug,
      priority: decision.priority,
      status: decision.status,
      ownerApproval: decision.ownerApproval,
      weakestAxis: decision.weakestAxis,
      actionClass: decision.actionClass,
      candidateLessonSlug: null,
      rationale: 'Integration test decision',
      proposedBy: 'scheduler',
      proposedAt: FIXED_NOW().toISOString(),
      ownerReviewedBy: input.reviewerLabel,
      ownerReviewedAt: input.reviewedAt,
      ownerReviewReason: input.reason,
      schedulerRunId:
        typeof decision.metadata.scheduler_run_id === 'string'
          ? decision.metadata.scheduler_run_id
          : null,
      schedulerJobName:
        typeof decision.metadata.scheduler_job_name === 'string'
          ? (decision.metadata.scheduler_job_name as SchedulerRunRecord['jobName'])
          : null,
      metadata: decision.metadata,
    }
  }

  async finalizeDecisionReview(input: {
    proposalId: string
    ownerApproval: 'approved' | 'rejected'
    status: 'approved' | 'rejected'
    reviewerLabel: string
    reviewedAt: string
    reason: string | null
  }) {
    const decision = this.store.decisions.find((candidate) => candidate.id === input.proposalId)
    if (!decision) {
      throw new Error('decision not found')
    }

    if (decision.ownerApproval !== 'pending_owner_review') {
      throw new SchedulerDecisionConflictError(input.proposalId)
    }

    if (
      decision.metadata.owner_reviewed_by !== input.reviewerLabel ||
      decision.metadata.owner_reviewed_at !== input.reviewedAt
    ) {
      throw new SchedulerDecisionConflictError(input.proposalId)
    }

    decision.ownerApproval = input.ownerApproval
    decision.status = input.status
    decision.metadata.owner_reviewed_by = input.reviewerLabel
    decision.metadata.owner_reviewed_at = input.reviewedAt
    decision.metadata.owner_review_reason = input.reason

    return {
      id: decision.id,
      capabilitySlug: decision.capabilitySlug,
      outcomeSlug: decision.outcomeSlug,
      priority: decision.priority,
      status: decision.status,
      ownerApproval: decision.ownerApproval,
      weakestAxis: decision.weakestAxis,
      actionClass: decision.actionClass,
      candidateLessonSlug: null,
      rationale: 'Integration test decision',
      proposedBy: 'scheduler',
      proposedAt: FIXED_NOW().toISOString(),
      ownerReviewedBy: input.reviewerLabel,
      ownerReviewedAt: input.reviewedAt,
      ownerReviewReason: input.reason,
      schedulerRunId:
        typeof decision.metadata.scheduler_run_id === 'string'
          ? decision.metadata.scheduler_run_id
          : null,
      schedulerJobName:
        typeof decision.metadata.scheduler_job_name === 'string'
          ? (decision.metadata.scheduler_job_name as SchedulerRunRecord['jobName'])
          : null,
      metadata: decision.metadata,
    }
  }

  async rollbackDecisionReview(input: {
    proposalId: string
    reviewerLabel: string
    reviewedAt: string
  }) {
    const decision = this.store.decisions.find((candidate) => candidate.id === input.proposalId)
    if (!decision) {
      throw new Error('decision not found')
    }

    if (
      decision.ownerApproval === 'pending_owner_review' &&
      decision.metadata.owner_reviewed_by === input.reviewerLabel &&
      decision.metadata.owner_reviewed_at === input.reviewedAt
    ) {
      decision.metadata.owner_reviewed_by = undefined
      decision.metadata.owner_reviewed_at = undefined
      decision.metadata.owner_review_reason = undefined
    }
  }

  async appendAuditLog(input: {
    runId?: string | null
    actorType: 'scheduler' | 'service_role' | 'owner' | 'system'
    actorId?: string | null
    eventType: string
    resourceType: string
    resourceId?: string | null
    message?: string | null
    metadata?: PersistedDecision['metadata']
    createdAt?: string
  }) {
    this.store.auditLog.push({
      ...input,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? FIXED_NOW().toISOString(),
    })
  }
}

const FIXED_NOW = () => new Date('2026-04-17T17:00:00.000Z')

function makeDecision(): SchedulerDecisionCandidate {
  return {
    capabilitySlug: 'build',
    outcomeSlug: 'create_asset',
    priority: 'mid',
    weakestAxis: 'capability',
    actionClass: 'lesson_rewrite',
    rationale: 'Needs owner approval before PR generation.',
    metadata: {
      source: 'integration-test',
    },
  }
}

const ADMIN_USER: User = {
  id: 'owner-1',
  app_metadata: { role: 'admin' },
  user_metadata: { role: 'admin' },
  aud: 'authenticated',
  confirmation_sent_at: undefined,
  recovery_sent_at: undefined,
  email_change_sent_at: undefined,
  new_email: undefined,
  new_phone: undefined,
  invited_at: undefined,
  action_link: undefined,
  email: 'owner@example.com',
  phone: '',
  created_at: FIXED_NOW().toISOString(),
  confirmed_at: FIXED_NOW().toISOString(),
  email_confirmed_at: FIXED_NOW().toISOString(),
  phone_confirmed_at: undefined,
  last_sign_in_at: FIXED_NOW().toISOString(),
  role: 'authenticated',
  updated_at: FIXED_NOW().toISOString(),
  identities: [],
  factors: [],
  is_anonymous: false,
}

describe('admin scheduler page flow', () => {
  it('shows a pending item and approves it through the review action', async () => {
    refreshMock.mockReset()
    const store = new MemorySchedulerStore()
    const repository = new MemorySchedulerAdminRepository(store)
    const prWorker = new MockPrWorker()

    const jobResult = await executeSchedulerJob(
      createProposerRunJob({
        async collect() {
          return {
            summary: {
              proposal_candidates: 1,
            },
            decisions: [makeDecision()],
          }
        },
      }),
      store,
      {
        now: FIXED_NOW,
        triggeredBy: 'nightly',
      },
    )

    expect(jobResult.exitCode).toBe(0)

    let snapshot = await loadSchedulerConsole(repository)
    expect(snapshot.pendingApprovals).toHaveLength(1)
    expect(
      snapshot.auditLog.some(
        (entry) => entry.eventType === 'scheduler.decision.persisted',
      ),
    ).toBe(true)

    const user = userEvent.setup()
    render(
      <PendingApprovalsPanel
        items={snapshot.pendingApprovals}
        reviewAction={(input) =>
          reviewSchedulerDecision({
            repository,
            reviewer: ADMIN_USER,
            input,
            prWorker,
            now: FIXED_NOW,
          })
        }
      />,
    )

    expect(screen.getByText('build / create_asset')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })

    snapshot = await loadSchedulerConsole(repository)
    expect(snapshot.pendingApprovals).toHaveLength(0)
    expect(store.decisions[0]?.ownerApproval).toBe('approved')
    expect(
      snapshot.auditLog.some(
        (entry) => entry.eventType === 'scheduler.decision.approved',
      ),
    ).toBe(true)
    expect(
      snapshot.auditLog.some(
        (entry) =>
          entry.eventType === 'scheduler.ai_pr_worker.requested_by_owner',
      ),
    ).toBe(true)
    expect(prWorker.calls).toHaveLength(1)
  })
})
