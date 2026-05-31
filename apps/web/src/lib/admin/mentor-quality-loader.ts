/**
 * TQ-238: Server-side loader for the Owner-facing mentor-quality dashboard.
 *
 * Wraps the Supabase service-role client to read `decision_ledger.agent_runs`
 * and `decision_ledger.evaluation_runs` and feeds them into the pure
 * aggregation helpers in `mentor-metrics.ts`. RLS is service_role only on
 * these tables (see migration 20260416000000_decision_ledger.sql), so this
 * loader MUST stay server-only and gated behind admin auth.
 */

import { createServiceClient } from '@/lib/supabase/service'

import {
  buildMentorQualitySnapshot,
  normalizeAgentRunRow,
  normalizeEvaluationRunRow,
  type AgentRunRecord,
  type EvaluationRunRecord,
  type MentorQualitySnapshot,
} from './mentor-metrics'

export const SERVICE_CLIENT_UNAVAILABLE =
  'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)'

const DEFAULT_AGENT_RUNS_LIMIT = 500
const DEFAULT_EVAL_RUNS_LIMIT = 500
const DEFAULT_RECENT_PLAN_LIMIT = 10

interface UntypedQueryBuilder {
  select: (...args: unknown[]) => UntypedQueryBuilder
  order: (...args: unknown[]) => UntypedQueryBuilder
  limit: (...args: unknown[]) => UntypedQueryBuilder
  gte: (...args: unknown[]) => UntypedQueryBuilder
  then: PromiseLike<{
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }>['then']
}

interface UntypedLedgerSchemaClient {
  from: (table: string) => UntypedQueryBuilder
}

function getDecisionLedgerSchemaClient(
  client: NonNullable<ReturnType<typeof createServiceClient>>,
): UntypedLedgerSchemaClient {
  return (
    client as unknown as {
      schema: (name: string) => UntypedLedgerSchemaClient
    }
  ).schema('decision_ledger')
}

export interface MentorQualityRepository {
  listRecentAgentRuns(limit?: number): Promise<AgentRunRecord[]>
  listRecentEvaluationRuns(limit?: number): Promise<EvaluationRunRecord[]>
}

export function createSupabaseMentorQualityRepository(): MentorQualityRepository {
  const client = createServiceClient()
  if (!client) {
    throw new Error(SERVICE_CLIENT_UNAVAILABLE)
  }

  const ledger = getDecisionLedgerSchemaClient(client)

  return {
    async listRecentAgentRuns(limit = DEFAULT_AGENT_RUNS_LIMIT) {
      const { data, error } = await ledger
        .from('agent_runs')
        .select('id, agent_type, run_status, started_at, finished_at, metadata')
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data) ? data.map(normalizeAgentRunRow) : []
    },
    async listRecentEvaluationRuns(limit = DEFAULT_EVAL_RUNS_LIMIT) {
      const { data, error } = await ledger
        .from('evaluation_runs')
        .select(
          'id, agent_run_id, action_id, goal_id, evaluator, score, max_score, verdict, evaluated_at, details',
        )
        .order('evaluated_at', { ascending: false })
        .limit(limit)

      if (error) {
        throw new Error(error.message)
      }

      return Array.isArray(data) ? data.map(normalizeEvaluationRunRow) : []
    },
  }
}

export interface LoadMentorQualitySnapshotOptions {
  now?: Date
  agentRunsLimit?: number
  evaluationRunsLimit?: number
  recentPlanLimit?: number
}

/**
 * Read recent agent_runs + evaluation_runs and aggregate them into the
 * Owner-facing snapshot. Returns deterministic empty snapshot when no rows
 * exist yet (e.g. before Wave 6 sub-agents start writing).
 */
export async function loadMentorQualitySnapshot(
  repository: MentorQualityRepository,
  options: LoadMentorQualitySnapshotOptions = {},
): Promise<MentorQualitySnapshot> {
  const [runs, evaluations] = await Promise.all([
    repository.listRecentAgentRuns(options.agentRunsLimit ?? DEFAULT_AGENT_RUNS_LIMIT),
    repository.listRecentEvaluationRuns(
      options.evaluationRunsLimit ?? DEFAULT_EVAL_RUNS_LIMIT,
    ),
  ])

  return buildMentorQualitySnapshot(runs, evaluations, {
    now: options.now,
    recentPlanLimit: options.recentPlanLimit ?? DEFAULT_RECENT_PLAN_LIMIT,
  })
}
