import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  AiPrWorkerRunInsert,
  AiPrWorkerRunRow,
  AiPrWorkerRunUpdate,
  Json,
  ProposedActionRow,
  WorkerBacklink,
} from './schema.js'

export interface AiPrWorkerRepository {
  loadAction(actionId: string): Promise<ProposedActionRow>
  claimRun(input: AiPrWorkerRunInsert): Promise<AiPrWorkerRunRow>
  createRun(input: AiPrWorkerRunInsert): Promise<AiPrWorkerRunRow>
  updateRun(runId: string, patch: AiPrWorkerRunUpdate): Promise<AiPrWorkerRunRow>
  updateActionBacklink(actionId: string, backlink: WorkerBacklink): Promise<void>
}

function isJsonObject(value: Json | undefined): value is Record<string, Json | undefined> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return 'Unknown repository error'
}

function assertData<T>(
  data: T | null,
  error: unknown,
  context: string,
): T {
  if (error) {
    throw new Error(`${context}: ${messageFrom(error)}`)
  }
  if (!data) {
    throw new Error(`${context}: no row returned`)
  }
  return data
}

export function mergeActionMetadata(
  existing: Json,
  backlink: WorkerBacklink,
): Json {
  const base = isJsonObject(existing) ? existing : {}
  const aiPrWorker = isJsonObject(base.ai_pr_worker)
    ? base.ai_pr_worker
    : {}

  return {
    ...base,
    ai_pr_worker: {
      ...aiPrWorker,
      last_run_id: backlink.runId,
      branch_name: backlink.branchName,
      pr_url: backlink.prUrl,
      updated_at: backlink.updatedAt,
    },
  }
}

export class SupabaseAiPrWorkerRepository implements AiPrWorkerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadAction(actionId: string): Promise<ProposedActionRow> {
    const { data, error } = await this.client
      .schema('decision_ledger')
      .from('proposed_actions')
      .select(
        'id, goal_id, node_id, title, description, action_type, priority, status, owner_approval, rationale, estimated_effort_hours, metadata, proposed_by, proposed_at, updated_at',
      )
      .eq('id', actionId)
      .maybeSingle()

    const action = assertData<ProposedActionRow>(
      data as ProposedActionRow | null,
      error,
      `loadAction(${actionId})`,
    )

    return action
  }

  async claimRun(input: AiPrWorkerRunInsert): Promise<AiPrWorkerRunRow> {
    const { data, error } = await this.client
      .schema('decision_ledger')
      .rpc('claim_ai_pr_worker_run', {
        p_action_id: input.actionId,
        p_requested_status: input.status,
        p_branch_name: input.branchName,
        p_pr_url: input.prUrl,
        p_finished_at: input.finishedAt,
        p_error_log: input.errorLog,
        p_codex_session_id: input.codexSessionId,
        p_worker_subject: input.workerSubject ?? null,
        p_metadata: input.metadata ?? {},
      })

    const row = Array.isArray(data) ? data[0] : data
    return assertData<AiPrWorkerRunRow>(
      row as AiPrWorkerRunRow | null,
      error,
      'claimRun',
    )
  }

  async createRun(input: AiPrWorkerRunInsert): Promise<AiPrWorkerRunRow> {
    const { data, error } = await this.client
      .schema('decision_ledger')
      .from('ai_pr_worker_runs')
      .insert({
        action_id: input.actionId,
        status: input.status,
        branch_name: input.branchName,
        pr_url: input.prUrl,
        started_at: input.startedAt,
        finished_at: input.finishedAt,
        error_log: input.errorLog,
        codex_session_id: input.codexSessionId,
        worker_subject: input.workerSubject,
        metadata: input.metadata ?? {},
      })
      .select(
        'run_id, action_id, status, branch_name, pr_url, started_at, finished_at, error_log, codex_session_id, worker_subject, metadata',
      )
      .single()

    return assertData<AiPrWorkerRunRow>(
      data as AiPrWorkerRunRow | null,
      error,
      'createRun',
    )
  }

  async updateRun(
    runId: string,
    patch: AiPrWorkerRunUpdate,
  ): Promise<AiPrWorkerRunRow> {
    const { data, error } = await this.client
      .schema('decision_ledger')
      .from('ai_pr_worker_runs')
      .update({
        status: patch.status,
        branch_name: patch.branchName,
        pr_url: patch.prUrl,
        finished_at: patch.finishedAt,
        error_log: patch.errorLog,
        codex_session_id: patch.codexSessionId,
        metadata: patch.metadata,
      })
      .eq('run_id', runId)
      .select(
        'run_id, action_id, status, branch_name, pr_url, started_at, finished_at, error_log, codex_session_id, worker_subject, metadata',
      )
      .single()

    return assertData<AiPrWorkerRunRow>(
      data as AiPrWorkerRunRow | null,
      error,
      `updateRun(${runId})`,
    )
  }

  async updateActionBacklink(actionId: string, backlink: WorkerBacklink): Promise<void> {
    const { data, error } = await this.client
      .schema('decision_ledger')
      .rpc('update_action_backlink', {
        p_action_id: actionId,
        p_backlink: {
          last_run_id: backlink.runId,
          branch_name: backlink.branchName,
          pr_url: backlink.prUrl,
          updated_at: backlink.updatedAt,
        },
      })

    const row = Array.isArray(data) ? data[0] : data
    assertData(
      row as { id: string } | null,
      error,
      `updateActionBacklink(${actionId})`,
    )
  }
}

export function createSupabaseAiPrWorkerRepository(options: {
  url: string
  serviceRoleKey: string
}): AiPrWorkerRepository {
  const client = createClient(options.url, options.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return new SupabaseAiPrWorkerRepository(client)
}
