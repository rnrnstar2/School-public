import type {
  NightlyDigestRecord,
  OwnerApprovalState,
  ProposalActionClass,
  ProposalPriority,
  SchedulerJobName,
  WeakestAxis,
  JsonValue,
} from '@school/flywheel-scheduler'

export interface SchedulerDecisionRecord {
  id: string
  capabilitySlug: string
  outcomeSlug: string
  priority: ProposalPriority
  status:
    | 'proposed'
    | 'approved'
    | 'reserved'
    | 'rejected'
    | 'blocked'
    | 'in_factory'
    | 'addressed'
    | 'cancelled'
  ownerApproval: OwnerApprovalState
  weakestAxis: WeakestAxis
  actionClass: ProposalActionClass
  candidateLessonSlug: string | null
  rationale: string | null
  proposedBy: string
  proposedAt: string
  ownerReviewedBy: string | null
  ownerReviewedAt: string | null
  ownerReviewReason: string | null
  schedulerRunId: string | null
  schedulerJobName: SchedulerJobName | null
  metadata: Record<string, JsonValue | undefined>
}

export interface SchedulerRunHistoryItem {
  runId: string
  jobName: SchedulerJobName
  status:
    | 'running'
    | 'success'
    | 'failed'
    | 'skipped_duplicate'
    | 'skipped_upstream_failed'
  scheduledAt: string
  startedAt: string
  finishedAt: string | null
  triggeredBy: string
  cronExpression: string | null
  outcomeSummary: JsonValue
  errorMessage: string | null
}

export interface SchedulerAuditLogItem {
  auditId: string
  runId: string | null
  actorType: 'scheduler' | 'service_role' | 'owner' | 'system'
  actorId: string | null
  eventType: string
  resourceType: string
  resourceId: string | null
  message: string | null
  metadata: JsonValue
  createdAt: string
}

export interface SchedulerConsoleSnapshot {
  pendingApprovals: SchedulerDecisionRecord[]
  schedulerRuns: SchedulerRunHistoryItem[]
  auditLog: SchedulerAuditLogItem[]
}

export interface NightlyDigestListItem extends NightlyDigestRecord {
  pendingApprovalsHref: string
}

export interface NightlyDigestSnapshot {
  digests: NightlyDigestListItem[]
}

export interface ReviewSchedulerDecisionInput {
  proposalId: string
  decision: 'approved' | 'rejected'
  reason?: string
}

export interface ReviewSchedulerDecisionResult {
  ok: boolean
  message: string
  statusCode?: number
  prWorkerJobId?: string | null
}

export type ReviewSchedulerDecisionHandler = (
  input: ReviewSchedulerDecisionInput,
) => Promise<ReviewSchedulerDecisionResult>
