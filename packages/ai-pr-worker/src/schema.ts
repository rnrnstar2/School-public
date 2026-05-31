export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export const OWNER_APPROVAL_VALUES = [
  'pending',
  'approved',
  'rejected',
] as const

export type OwnerApproval = (typeof OWNER_APPROVAL_VALUES)[number]

export const ACTION_STATUS_VALUES = [
  'proposed',
  'approved',
  'rejected',
  'in_progress',
  'done',
  'cancelled',
] as const

export type ActionStatus = (typeof ACTION_STATUS_VALUES)[number]

export const WORKER_RUN_STATUS_VALUES = [
  'pending_owner_approval',
  'running',
  'succeeded',
  'failed',
  'rejected',
  'rate_limited',
  'dry_run',
] as const

export type WorkerRunStatus = (typeof WORKER_RUN_STATUS_VALUES)[number]

export type AdapterMode = 'fake' | 'real'

export interface ProposedActionRow {
  id: string
  goal_id: string
  node_id: string | null
  title: string
  description: string | null
  action_type: 'task' | 'pr' | 'migration' | 'analysis' | 'communication' | 'other'
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status: ActionStatus
  owner_approval: OwnerApproval
  rationale: string | null
  estimated_effort_hours: number | null
  metadata: Json
  proposed_by: string
  proposed_at: string
  updated_at: string
}

export interface AiPrWorkerRunRow {
  run_id: string
  action_id: string
  status: WorkerRunStatus
  branch_name: string | null
  pr_url: string | null
  started_at: string
  finished_at: string | null
  error_log: string | null
  codex_session_id: string | null
  worker_subject: string
  metadata: Json
}

export interface WorkerBacklink {
  runId: string
  branchName: string | null
  prUrl: string | null
  updatedAt: string
}

export interface AiPrWorkerRunInsert {
  actionId: string
  status: WorkerRunStatus
  branchName: string | null
  prUrl: string | null
  startedAt: string
  finishedAt: string | null
  errorLog: string | null
  codexSessionId: string | null
  workerSubject?: string
  metadata?: Json
}

export interface AiPrWorkerRunUpdate {
  status?: WorkerRunStatus
  branchName?: string | null
  prUrl?: string | null
  finishedAt?: string | null
  errorLog?: string | null
  codexSessionId?: string | null
  metadata?: Json
}

export interface WorkerCliOptions {
  command: 'run'
  actionId: string
  dryRun: boolean
  adapter: AdapterMode
}

export interface WorkerResult {
  runId: string
  status: WorkerRunStatus
  branchName: string | null
  prUrl: string | null
  codexSessionId: string | null
  cleanupWarnings: string[]
}
