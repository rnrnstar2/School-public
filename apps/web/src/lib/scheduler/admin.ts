import type { User } from '@supabase/supabase-js'
import {
  MockPrWorker,
  RealPrWorker,
  type JsonValue,
  type PrWorker,
  type SchedulerJobName,
} from '@school/flywheel-scheduler'

import { isAdminUser } from '@/app/api/admin/atom-versions/_server'
import { createServiceClient } from '@/lib/supabase/service'

import type {
  ReviewSchedulerDecisionInput,
  ReviewSchedulerDecisionResult,
  SchedulerAuditLogItem,
  SchedulerConsoleSnapshot,
  SchedulerDecisionRecord,
  SchedulerRunHistoryItem,
} from './types'

type UntypedServiceClient = ReturnType<typeof createServiceClient> & {
  from: (table: string) => UntypedQueryBuilder
  schema: (schema: 'decision_ledger') => {
    from: (table: 'lesson_dev_proposals') => UntypedQueryBuilder
  }
}

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  order: (...args: unknown[]) => UntypedQueryBuilder
  eq: (...args: unknown[]) => UntypedQueryBuilder
  is: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
  single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>
  update: (
    values: Record<string, unknown>,
  ) => {
    eq: (...args: unknown[]) => UntypedQueryBuilder
  }
  insert: (values: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  then: PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>['then']
}

export class SchedulerDecisionConflictError extends Error {
  readonly proposalId: string

  constructor(proposalId: string, message = 'Decision is no longer pending owner review.') {
    super(message)
    this.name = 'SchedulerDecisionConflictError'
    this.proposalId = proposalId
  }
}

export interface SchedulerAdminRepository {
  listPendingApprovals(limit?: number): Promise<SchedulerDecisionRecord[]>
  listSchedulerRuns(limit?: number): Promise<SchedulerRunHistoryItem[]>
  listAuditLog(limit?: number): Promise<SchedulerAuditLogItem[]>
  getDecision(proposalId: string): Promise<SchedulerDecisionRecord | null>
  beginDecisionReview(input: {
    proposalId: string
    reviewerLabel: string
    reviewedAt: string
    reason: string | null
  }): Promise<SchedulerDecisionRecord>
  finalizeDecisionReview(input: {
    proposalId: string
    ownerApproval: 'approved' | 'rejected'
    status: 'approved' | 'rejected'
    reviewerLabel: string
    reviewedAt: string
    reason: string | null
  }): Promise<SchedulerDecisionRecord>
  rollbackDecisionReview(input: {
    proposalId: string
    reviewerLabel: string
    reviewedAt: string
  }): Promise<void>
  appendAuditLog(input: {
    runId?: string | null
    actorType: 'scheduler' | 'service_role' | 'owner' | 'system'
    actorId?: string | null
    eventType: string
    resourceType: string
    resourceId?: string | null
    message?: string | null
    metadata?: JsonValue
    createdAt?: string
  }): Promise<void>
}

function ensureServiceClient(): UntypedServiceClient {
  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }
  return client as UntypedServiceClient
}

function asJsonRecord(value: unknown): Record<string, JsonValue | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, JsonValue | undefined>)
    : {}
}

function normalizeDecisionRecord(row: Record<string, unknown>): SchedulerDecisionRecord {
  const metadata = asJsonRecord(row.metadata)

  return {
    id: String(row.id ?? ''),
    capabilitySlug: String(row.capability_slug ?? ''),
    outcomeSlug: String(row.outcome_slug ?? ''),
    priority: String(row.priority ?? 'mid') as SchedulerDecisionRecord['priority'],
    status: String(row.status ?? 'proposed') as SchedulerDecisionRecord['status'],
    ownerApproval: String(
      row.owner_approval ?? 'pending_owner_review',
    ) as SchedulerDecisionRecord['ownerApproval'],
    weakestAxis: String(row.weakest_axis ?? 'capability') as SchedulerDecisionRecord['weakestAxis'],
    actionClass: String(metadata.action_class ?? 'lesson_rewrite') as SchedulerDecisionRecord['actionClass'],
    candidateLessonSlug:
      typeof row.candidate_lesson_slug === 'string' ? row.candidate_lesson_slug : null,
    rationale: typeof row.rationale === 'string' ? row.rationale : null,
    proposedBy: String(row.proposed_by ?? 'scheduler'),
    proposedAt: String(row.proposed_at ?? ''),
    ownerReviewedBy:
      typeof row.owner_reviewed_by === 'string' ? row.owner_reviewed_by : null,
    ownerReviewedAt:
      typeof row.owner_reviewed_at === 'string' ? row.owner_reviewed_at : null,
    ownerReviewReason:
      typeof row.owner_review_reason === 'string' ? row.owner_review_reason : null,
    schedulerRunId:
      typeof metadata.scheduler_run_id === 'string' ? metadata.scheduler_run_id : null,
    schedulerJobName:
      typeof metadata.scheduler_job_name === 'string'
        ? (metadata.scheduler_job_name as SchedulerJobName)
        : null,
    metadata,
  }
}

function ensureUpdatedDecision(
  data: Record<string, unknown> | null,
  proposalId: string,
  error: { message: string } | null,
) {
  if (error) {
    throw new Error(error.message)
  }

  if (!data) {
    throw new SchedulerDecisionConflictError(proposalId)
  }

  return normalizeDecisionRecord(data)
}

function normalizeSchedulerRun(row: Record<string, unknown>): SchedulerRunHistoryItem {
  return {
    runId: String(row.run_id ?? ''),
    jobName: String(row.job_name ?? '') as SchedulerRunHistoryItem['jobName'],
    status: String(row.status ?? 'failed') as SchedulerRunHistoryItem['status'],
    scheduledAt: String(row.scheduled_at ?? ''),
    startedAt: String(row.started_at ?? ''),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    triggeredBy: String(row.triggered_by ?? 'scheduler'),
    cronExpression: typeof row.cron_expression === 'string' ? row.cron_expression : null,
    outcomeSummary: (row.outcome_summary ?? {}) as JsonValue,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
  }
}

function normalizeAuditLog(row: Record<string, unknown>): SchedulerAuditLogItem {
  return {
    auditId: String(row.audit_id ?? ''),
    runId: typeof row.run_id === 'string' ? row.run_id : null,
    actorType: String(row.actor_type ?? 'system') as SchedulerAuditLogItem['actorType'],
    actorId: typeof row.actor_id === 'string' ? row.actor_id : null,
    eventType: String(row.event_type ?? ''),
    resourceType: String(row.resource_type ?? ''),
    resourceId: typeof row.resource_id === 'string' ? row.resource_id : null,
    message: typeof row.message === 'string' ? row.message : null,
    metadata: (row.metadata ?? {}) as JsonValue,
    createdAt: String(row.created_at ?? ''),
  }
}

export function createSupabaseSchedulerAdminRepository(): SchedulerAdminRepository {
  const client = ensureServiceClient()

  return {
    async listPendingApprovals(limit = 25) {
      const { data, error } = await client
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .select(
          'id, capability_slug, outcome_slug, priority, status, weakest_axis, candidate_lesson_slug, rationale, proposed_by, proposed_at, owner_approval, owner_reviewed_by, owner_reviewed_at, owner_review_reason, metadata',
        )
        .eq('owner_approval', 'pending_owner_review')
        .order('proposed_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data)
        ? data.map((row) => normalizeDecisionRecord(row))
        : []
    },

    async listSchedulerRuns(limit = 20) {
      const { data, error } = await client
        .from('scheduler_runs')
        .select(
          'run_id, job_name, status, scheduled_at, started_at, finished_at, triggered_by, cron_expression, outcome_summary, error_message',
        )
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data)
        ? data.map((row) => normalizeSchedulerRun(row))
        : []
    },

    async listAuditLog(limit = 40) {
      const { data, error } = await client
        .from('audit_log')
        .select(
          'audit_id, run_id, actor_type, actor_id, event_type, resource_type, resource_id, message, metadata, created_at',
        )
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data)
        ? data.map((row) => normalizeAuditLog(row))
        : []
    },

    async getDecision(proposalId: string) {
      const { data, error } = await client
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .select(
          'id, capability_slug, outcome_slug, priority, status, weakest_axis, candidate_lesson_slug, rationale, proposed_by, proposed_at, owner_approval, owner_reviewed_by, owner_reviewed_at, owner_review_reason, metadata',
        )
        .eq('id', proposalId)
        .maybeSingle()

      if (error) {
        throw new Error(error.message)
      }

      return data ? normalizeDecisionRecord(data) : null
    },

    async beginDecisionReview(input) {
      const { data, error } = await client
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .update({
          owner_reviewed_by: input.reviewerLabel,
          owner_reviewed_at: input.reviewedAt,
          owner_review_reason: input.reason,
        })
        .eq('id', input.proposalId)
        .eq('owner_approval', 'pending_owner_review')
        .is('owner_reviewed_by', null)
        .is('owner_reviewed_at', null)
        .select()
        .maybeSingle()

      return ensureUpdatedDecision(data, input.proposalId, error)
    },

    async finalizeDecisionReview(input) {
      const { data, error } = await client
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .update({
          owner_approval: input.ownerApproval,
          owner_reviewed_by: input.reviewerLabel,
          owner_reviewed_at: input.reviewedAt,
          owner_review_reason: input.reason,
          status: input.status,
        })
        .eq('id', input.proposalId)
        .eq('owner_approval', 'pending_owner_review')
        .eq('owner_reviewed_by', input.reviewerLabel)
        .eq('owner_reviewed_at', input.reviewedAt)
        .select()
        .maybeSingle()

      return ensureUpdatedDecision(data, input.proposalId, error)
    },

    async rollbackDecisionReview(input) {
      const { error } = await client
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .update({
          owner_reviewed_by: null,
          owner_reviewed_at: null,
          owner_review_reason: null,
        })
        .eq('id', input.proposalId)
        .eq('owner_approval', 'pending_owner_review')
        .eq('owner_reviewed_by', input.reviewerLabel)
        .eq('owner_reviewed_at', input.reviewedAt)

      if (error) {
        throw new Error(error.message)
      }
    },

    async appendAuditLog(input) {
      const { error } = await client.from('audit_log').insert({
        run_id: input.runId ?? null,
        actor_type: input.actorType,
        actor_id: input.actorId ?? null,
        event_type: input.eventType,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        message: input.message ?? null,
        metadata: input.metadata ?? {},
        created_at: input.createdAt ?? new Date().toISOString(),
      })

      if (error) {
        throw new Error(error.message)
      }
    },
  }
}

export async function loadSchedulerConsole(
  repository: SchedulerAdminRepository,
): Promise<SchedulerConsoleSnapshot> {
  const [pendingApprovals, schedulerRuns, auditLog] = await Promise.all([
    repository.listPendingApprovals(),
    repository.listSchedulerRuns(),
    repository.listAuditLog(),
  ])

  return {
    pendingApprovals,
    schedulerRuns,
    auditLog,
  }
}

export function createDefaultSchedulerPrWorker(): PrWorker {
  if (process.env.ENABLE_REAL_AI_PR_WORKER === '1') {
    return new RealPrWorker()
  }

  return new MockPrWorker((request) => ({
    accepted: true,
    jobId: `mock-owner-${request.proposalId}`,
    note: 'MockPrWorker accepted proposal; wire RealPrWorker in G2A-012.',
  }))
}

export async function reviewSchedulerDecision(params: {
  repository: SchedulerAdminRepository
  reviewer: User | null
  input: ReviewSchedulerDecisionInput
  prWorker?: PrWorker
  now?: () => Date
}): Promise<ReviewSchedulerDecisionResult> {
  const reviewer = params.reviewer
  if (!reviewer || !isAdminUser(reviewer)) {
    return {
      ok: false,
      message: 'Admin role is required.',
      statusCode: 403,
    }
  }

  if (params.input.decision === 'rejected' && !params.input.reason?.trim()) {
    return {
      ok: false,
      message: 'Rejection reason is required.',
      statusCode: 400,
    }
  }

  const existing = await params.repository.getDecision(params.input.proposalId)
  if (!existing) {
    return {
      ok: false,
      message: 'Decision was not found.',
      statusCode: 404,
    }
  }

  if (existing.ownerApproval !== 'pending_owner_review') {
    return {
      ok: false,
      message: 'Decision is no longer pending owner review.',
      statusCode: 409,
    }
  }

  const reviewedAt = (params.now ?? (() => new Date()))().toISOString()
  const reviewerLabel = reviewer.email ?? reviewer.id
  const reason = params.input.reason?.trim() || null
  const ownerApproval = params.input.decision

  try {
    const claimed = await params.repository.beginDecisionReview({
      proposalId: params.input.proposalId,
      reviewerLabel,
      reviewedAt,
      reason,
    })

    if (ownerApproval === 'approved') {
      const prWorker = params.prWorker ?? createDefaultSchedulerPrWorker()

      try {
        const workerResult = await prWorker.triggerApprovedProposal({
          proposalId: claimed.id,
          capabilitySlug: claimed.capabilitySlug,
          outcomeSlug: claimed.outcomeSlug,
          ownerApproval: 'approved',
          actionClass: claimed.actionClass,
          requestedBy: reviewerLabel,
          metadata: claimed.metadata,
        })

        const updated = await params.repository.finalizeDecisionReview({
          proposalId: params.input.proposalId,
          ownerApproval,
          status: ownerApproval,
          reviewerLabel,
          reviewedAt,
          reason,
        })

        await params.repository.appendAuditLog({
          runId: updated.schedulerRunId,
          actorType: 'owner',
          actorId: reviewer.id,
          eventType: `scheduler.decision.${ownerApproval}`,
          resourceType: 'lesson_dev_proposal',
          resourceId: updated.id,
          message: `Approved ${updated.capabilitySlug}/${updated.outcomeSlug}`,
          metadata: {
            reviewer: reviewerLabel,
            reason,
            action_class: updated.actionClass,
          },
          createdAt: reviewedAt,
        })

        await params.repository.appendAuditLog({
          runId: updated.schedulerRunId,
          actorType: 'owner',
          actorId: reviewer.id,
          eventType: 'scheduler.ai_pr_worker.requested_by_owner',
          resourceType: 'lesson_dev_proposal',
          resourceId: updated.id,
          message: workerResult.note,
          metadata: {
            accepted: workerResult.accepted,
            job_id: workerResult.jobId,
          },
          createdAt: reviewedAt,
        })

        return {
          ok: true,
          message: 'Approved and handed off to the AI PR worker.',
          statusCode: 200,
          prWorkerJobId: workerResult.jobId,
        }
      } catch (error) {
        await params.repository.rollbackDecisionReview({
          proposalId: params.input.proposalId,
          reviewerLabel,
          reviewedAt,
        })

        const errorMessage =
          error instanceof Error ? error.message : 'Failed to trigger the AI PR worker.'

        await params.repository.appendAuditLog({
          runId: claimed.schedulerRunId,
          actorType: 'owner',
          actorId: reviewer.id,
          eventType: 'scheduler.ai_pr_worker.handoff_failed',
          resourceType: 'lesson_dev_proposal',
          resourceId: claimed.id,
          message: errorMessage,
          metadata: {
            reviewer: reviewerLabel,
            action_class: claimed.actionClass,
          },
          createdAt: reviewedAt,
        })

        return {
          ok: false,
          message: errorMessage,
          statusCode: 502,
        }
      }
    }

    const updated = await params.repository.finalizeDecisionReview({
      proposalId: params.input.proposalId,
      ownerApproval,
      status: ownerApproval,
      reviewerLabel,
      reviewedAt,
      reason,
    })

    await params.repository.appendAuditLog({
      runId: updated.schedulerRunId,
      actorType: 'owner',
      actorId: reviewer.id,
      eventType: `scheduler.decision.${ownerApproval}`,
      resourceType: 'lesson_dev_proposal',
      resourceId: updated.id,
      message: `Rejected ${updated.capabilitySlug}/${updated.outcomeSlug}`,
      metadata: {
        reviewer: reviewerLabel,
        reason,
        action_class: updated.actionClass,
      },
      createdAt: reviewedAt,
    })

    return {
      ok: true,
      message: 'Rejected and recorded in the audit log.',
      statusCode: 200,
    }
  } catch (error) {
    if (error instanceof SchedulerDecisionConflictError) {
      return {
        ok: false,
        message: error.message,
        statusCode: 409,
      }
    }

    throw error
  }
}
