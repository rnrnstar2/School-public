export const schedulerJobNames = [
  'matcher_sweep',
  'gap_scan',
  'proposer_run',
  'judge_run',
  'nightly_digest',
] as const

export type SchedulerJobName = (typeof schedulerJobNames)[number]

export const ownerApprovalStates = [
  'auto',
  'pending_owner_review',
  'approved',
  'rejected',
  'blocked',
] as const

export type OwnerApprovalState = (typeof ownerApprovalStates)[number]

export const proposalActionClasses = [
  'micro_patch_existing_lesson',
  'copy_refresh_existing_lesson',
  'new_lesson_scaffold',
  'lesson_rewrite',
  'curriculum_resequence',
  'cross_track_refactor',
  'direct_publish',
  'destructive_migration',
] as const

export type ProposalActionClass = (typeof proposalActionClasses)[number]

export type ProposalPriority = 'high' | 'mid' | 'low'

export type WeakestAxis = 'capability' | 'prerequisite' | 'blocker' | 'evidence'

export type SchedulerRunStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped_duplicate'
  | 'skipped_upstream_failed'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue | undefined }
  | JsonValue[]

export interface SchedulerRunRecord {
  runId: string
  jobName: SchedulerJobName
  scheduledAt: string
  startedAt: string
  finishedAt: string | null
  status: SchedulerRunStatus
  triggeredBy: string
  cronExpression: string | null
  outcomeSummary: JsonValue
  errorMessage: string | null
}

export interface AuditLogInsert {
  runId?: string | null
  actorType: 'scheduler' | 'service_role' | 'owner' | 'system'
  actorId?: string | null
  eventType: string
  resourceType: string
  resourceId?: string | null
  message?: string | null
  metadata?: JsonValue
  createdAt?: string
}

export interface SchedulerDecisionCandidate {
  capabilitySlug: string
  outcomeSlug: string
  priority: ProposalPriority
  weakestAxis: WeakestAxis
  actionClass: ProposalActionClass
  rationale?: string | null
  gapIds?: string[]
  evidence?: JsonValue
  candidateLessonSlug?: string | null
  proposedBy?: string
  proposedAt?: string
  metadata?: Record<string, JsonValue | undefined>
}

export interface PersistDecisionInput extends SchedulerDecisionCandidate {
  ownerApproval: OwnerApprovalState
  status: 'proposed' | 'approved' | 'rejected' | 'blocked'
  schedulerRunId: string
  schedulerJobName: SchedulerJobName
}

export interface PersistedDecision {
  id: string
  capabilitySlug: string
  outcomeSlug: string
  priority: ProposalPriority
  weakestAxis: WeakestAxis
  actionClass: ProposalActionClass
  ownerApproval: OwnerApprovalState
  status: 'proposed' | 'approved' | 'rejected' | 'blocked'
  metadata: Record<string, JsonValue | undefined>
}

export interface StartRunInput {
  jobName: SchedulerJobName
  scheduledAt: string
  startedAt: string
  triggeredBy: string
  cronExpression?: string | null
}

export type StartRunResult =
  | { ok: true; run: SchedulerRunRecord }
  | { ok: false; activeRunId: string | null }

export interface FinishRunInput {
  runId: string
  status: Extract<SchedulerRunStatus, 'success' | 'failed'>
  finishedAt: string
  outcomeSummary: JsonValue
  errorMessage?: string | null
}

export interface DuplicateRunInput {
  jobName: SchedulerJobName
  scheduledAt: string
  startedAt: string
  triggeredBy: string
  cronExpression?: string | null
  activeRunId?: string | null
}

export interface SkippedUpstreamRunInput {
  jobName: SchedulerJobName
  scheduledAt: string
  startedAt: string
  triggeredBy: string
  cronExpression?: string | null
  upstreamJobName: SchedulerJobName
  upstreamRunId?: string | null
}

export interface SchedulerStore {
  startRun(input: StartRunInput): Promise<StartRunResult>
  finishRun(input: FinishRunInput): Promise<void>
  recordDuplicateRun(input: DuplicateRunInput): Promise<SchedulerRunRecord>
  recordSkippedUpstreamRun(
    input: SkippedUpstreamRunInput,
  ): Promise<SchedulerRunRecord>
  appendAuditLog(entry: AuditLogInsert): Promise<void>
  upsertDecision(input: PersistDecisionInput): Promise<PersistedDecision>
}

export interface JobExecutionContext {
  runId: string
  jobName: SchedulerJobName
  scheduledAt: string
  triggeredBy: string
  cronExpression: string | null
  now: () => Date
  signal?: AbortSignal
}

export interface JobEffect {
  decisions?: SchedulerDecisionCandidate[]
  summary?: JsonValue
  auditEntries?: AuditLogInsert[]
}

export interface SchedulerJobHandler {
  readonly jobName: SchedulerJobName
  run(context: JobExecutionContext): Promise<JobEffect>
}

export interface JobExecutionResult {
  exitCode: 0 | 1 | 3
  run: SchedulerRunRecord
  decisions: PersistedDecision[]
  errorMessage: string | null
}
