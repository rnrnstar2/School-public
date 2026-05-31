import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type {
  AuditLogInsert,
  DuplicateRunInput,
  FinishRunInput,
  JsonValue,
  PersistDecisionInput,
  PersistedDecision,
  SchedulerRunRecord,
  SchedulerStore,
  SkippedUpstreamRunInput,
  StartRunInput,
  StartRunResult,
} from '../types'

type UntypedRow = Record<string, unknown>

type UntypedResult = Promise<{
  data: UntypedRow | null
  error: { code?: string; message: string } | null
}>

type UntypedListResult = Promise<{
  data: UntypedRow[] | null
  error: { code?: string; message: string } | null
}>

type UntypedQueryBuilder = {
  select: (...args: unknown[]) => UntypedQueryBuilder
  eq: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  maybeSingle: () => UntypedResult
  single: () => UntypedResult
  insert: (values: Record<string, unknown>) => {
    select: () => {
      single: () => UntypedResult
    }
  }
  update: (values: Record<string, unknown>) => {
    eq: (...args: unknown[]) => Promise<{ error: { code?: string; message: string } | null }>
  }
  then: PromiseLike<{ data: UntypedRow[] | null; error: { code?: string; message: string } | null }>['then']
}

type UntypedSchedulerClient = {
  from: (table: string) => UntypedQueryBuilder
  schema: (schema: 'decision_ledger') => {
    from: (table: 'lesson_dev_proposals') => {
      upsert: (
        payload: Record<string, unknown>,
        options: { onConflict: string },
      ) => {
        select: () => {
          single: () => UntypedResult
        }
      }
    }
  }
}

function ensureEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing scheduler env: ${name}`)
  }
  return value
}

function asUntypedClient(client: SupabaseClient): UntypedSchedulerClient {
  return client as unknown as UntypedSchedulerClient
}

function normalizeRunRecord(row: Record<string, unknown>): SchedulerRunRecord {
  return {
    runId: String(row.run_id ?? ''),
    jobName: String(row.job_name ?? '') as SchedulerRunRecord['jobName'],
    scheduledAt: String(row.scheduled_at ?? ''),
    startedAt: String(row.started_at ?? ''),
    finishedAt: typeof row.finished_at === 'string' ? row.finished_at : null,
    status: String(row.status ?? 'failed') as SchedulerRunRecord['status'],
    triggeredBy: String(row.triggered_by ?? 'scheduler'),
    cronExpression: typeof row.cron_expression === 'string' ? row.cron_expression : null,
    outcomeSummary: (row.outcome_summary ?? {}) as JsonValue,
    errorMessage: typeof row.error_message === 'string' ? row.error_message : null,
  }
}

function normalizeDecision(row: Record<string, unknown>): PersistedDecision {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, JsonValue | undefined>)
      : {}

  return {
    id: String(row.id ?? ''),
    capabilitySlug: String(row.capability_slug ?? ''),
    outcomeSlug: String(row.outcome_slug ?? ''),
    priority: String(row.priority ?? 'mid') as PersistedDecision['priority'],
    weakestAxis: String(row.weakest_axis ?? 'capability') as PersistedDecision['weakestAxis'],
    actionClass: String(metadata.action_class ?? 'lesson_rewrite') as PersistedDecision['actionClass'],
    ownerApproval: String(row.owner_approval ?? 'pending_owner_review') as PersistedDecision['ownerApproval'],
    status: String(row.status ?? 'proposed') as PersistedDecision['status'],
    metadata,
  }
}

async function findActiveRunId(
  client: UntypedSchedulerClient,
  jobName: string,
): Promise<string | null> {
  const { data } = await client
    .from('scheduler_runs')
    .select('run_id')
    .eq('job_name', jobName)
    .eq('status', 'running')
    .limit(1)
    .maybeSingle()

  return data && typeof data.run_id === 'string' ? data.run_id : null
}

export function createSupabaseSchedulerStore(options?: {
  supabaseUrl?: string
  serviceRoleKey?: string
  client?: SupabaseClient
}): SchedulerStore {
  const client =
    options?.client ??
    createClient(
      ensureEnv(
        options?.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
        'NEXT_PUBLIC_SUPABASE_URL',
      ),
      ensureEnv(
        options?.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
        'SUPABASE_SERVICE_ROLE_KEY',
      ),
      {
        auth: { autoRefreshToken: false, persistSession: false },
      },
    )

  const supabase = asUntypedClient(client)

  return {
    async startRun(input: StartRunInput): Promise<StartRunResult> {
      const payload = {
        job_name: input.jobName,
        scheduled_at: input.scheduledAt,
        started_at: input.startedAt,
        status: 'running',
        triggered_by: input.triggeredBy,
        cron_expression: input.cronExpression ?? null,
        outcome_summary: {},
      }

      const { data, error } = await supabase
        .from('scheduler_runs')
        .insert(payload)
        .select()
        .single()

      if (!error && data) {
        return {
          ok: true,
          run: normalizeRunRecord(data),
        }
      }

      if (error && error.code === '23505') {
        return {
          ok: false,
          activeRunId: await findActiveRunId(supabase, input.jobName),
        }
      }

      throw error ?? new Error(`failed to start run for ${input.jobName}`)
    },

    async finishRun(input: FinishRunInput) {
      const { error } = await supabase
        .from('scheduler_runs')
        .update({
          status: input.status,
          finished_at: input.finishedAt,
          outcome_summary: input.outcomeSummary,
          error_message: input.errorMessage ?? null,
        })
        .eq('run_id', input.runId)

      if (error) {
        throw error
      }
    },

    async recordDuplicateRun(input: DuplicateRunInput) {
      const { data, error } = await supabase
        .from('scheduler_runs')
        .insert({
          job_name: input.jobName,
          scheduled_at: input.scheduledAt,
          started_at: input.startedAt,
          finished_at: input.startedAt,
          status: 'skipped_duplicate',
          triggered_by: input.triggeredBy,
          cron_expression: input.cronExpression ?? null,
          outcome_summary: {
            duplicate_of_run_id: input.activeRunId ?? null,
          },
        })
        .select()
        .single()

      if (error || !data) {
        throw error ?? new Error(`failed to record duplicate for ${input.jobName}`)
      }

      return normalizeRunRecord(data)
    },

    async recordSkippedUpstreamRun(input: SkippedUpstreamRunInput) {
      const { data, error } = await supabase
        .from('scheduler_runs')
        .insert({
          job_name: input.jobName,
          scheduled_at: input.scheduledAt,
          started_at: input.startedAt,
          finished_at: input.startedAt,
          status: 'skipped_upstream_failed',
          triggered_by: input.triggeredBy,
          cron_expression: input.cronExpression ?? null,
          outcome_summary: {
            skipped_due_to_job_name: input.upstreamJobName,
            skipped_due_to_run_id: input.upstreamRunId ?? null,
          },
        })
        .select()
        .single()

      if (error || !data) {
        throw error ?? new Error(`failed to record skipped upstream run for ${input.jobName}`)
      }

      return normalizeRunRecord(data)
    },

    async appendAuditLog(entry: AuditLogInsert) {
      const { error } = await (
        supabase.from('audit_log').insert({
          run_id: entry.runId ?? null,
          actor_type: entry.actorType,
          actor_id: entry.actorId ?? null,
          event_type: entry.eventType,
          resource_type: entry.resourceType,
          resource_id: entry.resourceId ?? null,
          message: entry.message ?? null,
          metadata: entry.metadata ?? {},
          created_at: entry.createdAt ?? new Date().toISOString(),
        }) as unknown as Promise<{
          error: { code?: string; message: string } | null
        }>
      )

      if (error) {
        throw error
      }
    },

    async upsertDecision(input: PersistDecisionInput) {
      const metadata = {
        ...(input.metadata ?? {}),
        action_class: input.actionClass,
        scheduler_job_name: input.schedulerJobName,
        scheduler_run_id: input.schedulerRunId,
      }

      const { data, error } = await supabase
        .schema('decision_ledger')
        .from('lesson_dev_proposals')
        .upsert(
          {
            capability_slug: input.capabilitySlug,
            outcome_slug: input.outcomeSlug,
            priority: input.priority,
            status: input.status,
            gap_ids: input.gapIds ?? [],
            weakest_axis: input.weakestAxis,
            evidence: input.evidence ?? {},
            candidate_lesson_slug: input.candidateLessonSlug ?? null,
            rationale: input.rationale ?? null,
            proposed_by: input.proposedBy ?? 'scheduler',
            proposed_at: input.proposedAt ?? new Date().toISOString(),
            metadata,
            owner_approval: input.ownerApproval,
          },
          { onConflict: 'capability_slug,outcome_slug' },
        )
        .select()
        .single()

      if (error || !data) {
        throw error ?? new Error('failed to persist scheduler decision')
      }

      return normalizeDecision(data)
    },
  }
}
