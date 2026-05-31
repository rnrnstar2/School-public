import type { User } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import {
  reviewSchedulerDecision,
  SchedulerDecisionConflictError,
  type SchedulerAdminRepository,
} from '@/lib/scheduler/admin'
import type {
  ReviewSchedulerDecisionInput,
  SchedulerAuditLogItem,
  SchedulerDecisionRecord,
  SchedulerRunHistoryItem,
} from '@/lib/scheduler/types'

class MemorySchedulerAdminRepository implements SchedulerAdminRepository {
  decision: SchedulerDecisionRecord
  auditEntries: SchedulerAuditLogItem[] = []

  constructor(decision?: Partial<SchedulerDecisionRecord>) {
    this.decision = {
      id: 'proposal-1',
      capabilitySlug: 'build',
      outcomeSlug: 'create_asset',
      priority: 'mid',
      status: 'proposed',
      ownerApproval: 'pending_owner_review',
      weakestAxis: 'capability',
      actionClass: 'lesson_rewrite',
      candidateLessonSlug: null,
      rationale: 'Needs review before handoff.',
      proposedBy: 'scheduler',
      proposedAt: FIXED_NOW,
      ownerReviewedBy: null,
      ownerReviewedAt: null,
      ownerReviewReason: null,
      schedulerRunId: 'run-1',
      schedulerJobName: 'proposer_run',
      metadata: {
        action_class: 'lesson_rewrite',
        scheduler_run_id: 'run-1',
        scheduler_job_name: 'proposer_run',
      },
      ...decision,
    }
  }

  async listPendingApprovals(_limit?: number): Promise<SchedulerDecisionRecord[]> {
    return this.decision.ownerApproval === 'pending_owner_review'
      ? [structuredClone(this.decision)]
      : []
  }

  async listSchedulerRuns(_limit?: number): Promise<SchedulerRunHistoryItem[]> {
    return []
  }

  async listAuditLog(_limit?: number): Promise<SchedulerAuditLogItem[]> {
    return this.auditEntries.map((entry) => ({ ...entry }))
  }

  async getDecision(proposalId: string): Promise<SchedulerDecisionRecord | null> {
    return this.decision.id === proposalId ? structuredClone(this.decision) : null
  }

  async beginDecisionReview(input: {
    proposalId: string
    reviewerLabel: string
    reviewedAt: string
    reason: string | null
  }): Promise<SchedulerDecisionRecord> {
    if (this.decision.id !== input.proposalId) {
      throw new Error('decision not found')
    }

    if (
      this.decision.ownerApproval !== 'pending_owner_review' ||
      this.decision.ownerReviewedBy !== null ||
      this.decision.ownerReviewedAt !== null
    ) {
      throw new SchedulerDecisionConflictError(input.proposalId)
    }

    this.decision.ownerReviewedBy = input.reviewerLabel
    this.decision.ownerReviewedAt = input.reviewedAt
    this.decision.ownerReviewReason = input.reason

    return structuredClone(this.decision)
  }

  async finalizeDecisionReview(input: {
    proposalId: string
    ownerApproval: 'approved' | 'rejected'
    status: 'approved' | 'rejected'
    reviewerLabel: string
    reviewedAt: string
    reason: string | null
  }): Promise<SchedulerDecisionRecord> {
    if (this.decision.id !== input.proposalId) {
      throw new Error('decision not found')
    }

    if (
      this.decision.ownerApproval !== 'pending_owner_review' ||
      this.decision.ownerReviewedBy !== input.reviewerLabel ||
      this.decision.ownerReviewedAt !== input.reviewedAt
    ) {
      throw new SchedulerDecisionConflictError(input.proposalId)
    }

    this.decision.ownerApproval = input.ownerApproval
    this.decision.status = input.status
    this.decision.ownerReviewReason = input.reason

    return structuredClone(this.decision)
  }

  async rollbackDecisionReview(input: {
    proposalId: string
    reviewerLabel: string
    reviewedAt: string
  }): Promise<void> {
    if (
      this.decision.id === input.proposalId &&
      this.decision.ownerApproval === 'pending_owner_review' &&
      this.decision.ownerReviewedBy === input.reviewerLabel &&
      this.decision.ownerReviewedAt === input.reviewedAt
    ) {
      this.decision.ownerReviewedBy = null
      this.decision.ownerReviewedAt = null
      this.decision.ownerReviewReason = null
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
    metadata?: SchedulerDecisionRecord['metadata']
    createdAt?: string
  }): Promise<void> {
    this.auditEntries.push({
      auditId: `audit-${this.auditEntries.length + 1}`,
      runId: input.runId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
      createdAt: input.createdAt ?? FIXED_NOW,
    })
  }
}

const FIXED_NOW = '2026-04-17T17:00:00.000Z'

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
  created_at: FIXED_NOW,
  confirmed_at: FIXED_NOW,
  email_confirmed_at: FIXED_NOW,
  phone_confirmed_at: undefined,
  last_sign_in_at: FIXED_NOW,
  role: 'authenticated',
  updated_at: FIXED_NOW,
  identities: [],
  factors: [],
  is_anonymous: false,
}

function makeInput(decision: ReviewSchedulerDecisionInput['decision']): ReviewSchedulerDecisionInput {
  return {
    proposalId: 'proposal-1',
    decision,
    reason: decision === 'rejected' ? 'Not this cycle.' : undefined,
  }
}

describe('reviewSchedulerDecision', () => {
  it('returns a conflict when a second reviewer races a claimed pending decision', async () => {
    const repository = new MemorySchedulerAdminRepository()

    let notifyHandoffStarted: (() => void) | null = null
    const handoffStarted = new Promise<void>((resolve) => {
      notifyHandoffStarted = resolve
    })
    let releaseWorker: (() => void) | null = null
    const handoffGate = new Promise<void>((resolve) => {
      releaseWorker = () => resolve()
    })

    const firstApproval = reviewSchedulerDecision({
      repository,
      reviewer: ADMIN_USER,
      input: makeInput('approved'),
      prWorker: {
        async triggerApprovedProposal() {
          notifyHandoffStarted?.()
          await handoffGate
          return {
            accepted: true,
            jobId: 'job-1',
            note: 'queued',
          }
        },
      },
      now: () => new Date(FIXED_NOW),
    })

    await handoffStarted

    const secondReviewer = await reviewSchedulerDecision({
      repository,
      reviewer: ADMIN_USER,
      input: makeInput('rejected'),
      now: () => new Date(FIXED_NOW),
    })

    expect(secondReviewer).toMatchObject({
      ok: false,
      statusCode: 409,
    })

    const releaseWorkerFn =
      releaseWorker ??
      (() => {
        throw new Error('Expected releaseWorker to be initialized')
      })
    releaseWorkerFn()
    const firstResult = await firstApproval

    expect(firstResult).toMatchObject({
      ok: true,
      statusCode: 200,
      prWorkerJobId: 'job-1',
    })
    expect(repository.decision.ownerApproval).toBe('approved')
  })

  it('rolls the approval claim back when PR worker handoff fails', async () => {
    const repository = new MemorySchedulerAdminRepository()

    const result = await reviewSchedulerDecision({
      repository,
      reviewer: ADMIN_USER,
      input: makeInput('approved'),
      prWorker: {
        async triggerApprovedProposal() {
          throw new Error('queue outage')
        },
      },
      now: () => new Date(FIXED_NOW),
    })

    expect(result).toMatchObject({
      ok: false,
      statusCode: 502,
      message: 'queue outage',
    })
    expect(repository.decision.ownerApproval).toBe('pending_owner_review')
    expect(repository.decision.status).toBe('proposed')
    expect(repository.decision.ownerReviewedBy).toBeNull()
    expect(repository.decision.ownerReviewedAt).toBeNull()
    expect(
      repository.auditEntries.some(
        (entry) => entry.eventType === 'scheduler.decision.approved',
      ),
    ).toBe(false)
    expect(
      repository.auditEntries.some(
        (entry) => entry.eventType === 'scheduler.ai_pr_worker.handoff_failed',
      ),
    ).toBe(true)
  })
})
