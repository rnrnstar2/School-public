// TQ-223: This runner wraps packages/goal-action/judge/src/runner. The judge
// LLM prompts (matcher / gap / proposer in packages/goal-action/judge/src/judges/)
// are evaluator prompts that grade detector output — not learner-facing surfaces —
// so the THREE_AXIS_GUIDE preamble (AI フル活用 / 非エンジニア / 最短) is
// intentionally NOT injected there. Delivery-side surfaces are covered in
// apps/web/src/lib/prompts/* and lessons/*.

import { randomUUID } from 'node:crypto'

import {
  COVERAGE_INDEX_SCHEMA_VERSION,
  CoverageIndexSchema,
  type CoverageIndex,
} from '../../../../../packages/goal-action/coverage/src/schema'
import fakeVerdicts from '../../../../../packages/goal-action/judge/__tests__/fixtures/fake-verdicts.json'
import {
  createFakeJudgeLLM,
  type FakeVerdictFixture,
} from '../../../../../packages/goal-action/judge/src/llm'
import { createRealWriters } from '../../../../../packages/goal-action/judge/src/real-writers'
import {
  defaultWriters,
  runJudge,
  type Writers,
} from '../../../../../packages/goal-action/judge/src/runner'
import type { RunSummary } from '../../../../../packages/goal-action/judge/src/schema'

import {
  insertAgentRun,
  insertEvaluationRun,
} from '@/lib/supabase/decision-ledger'
import { createServiceClient } from '@/lib/supabase/service'

type LedgerClient = NonNullable<ReturnType<typeof createServiceClient>>

type CoverageSnapshotRow = {
  id: string
  payload: unknown
}

type UntypedQueryBuilder<TRow = Record<string, unknown>> = {
  select: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  eq: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  order: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  limit: (...args: unknown[]) => UntypedQueryBuilder<TRow>
  maybeSingle: () => Promise<{
    data: TRow | null
    error: { message: string } | null
  }>
}

type PublicClient = {
  from: (
    table: 'coverage_index_snapshots',
  ) => UntypedQueryBuilder<CoverageSnapshotRow>
}

export type JudgeJobSummary = {
  enabled: boolean
  writerMode: 'real' | 'stand_in'
  runId: string | null
  agentRunId: string | null
  evaluationRunIds: string[]
  evaluator: string | null
  metrics: RunSummary['metrics'] | null
  verdictCount: number
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string') {
      return message
    }
  }
  return 'Unknown judge error'
}

export function isG2AJudgeRealWriterEnabled() {
  const flag = process.env.G2A_JUDGE_REAL_WRITER?.trim().toLowerCase()
  return flag !== 'off' && flag !== '0' && flag !== 'false'
}

async function loadLatestCoverageIndex(client: LedgerClient) {
  const publicClient = client as unknown as PublicClient
  const { data, error } = await publicClient
    .from('coverage_index_snapshots')
    .select('id,payload')
    .eq('schema_version', COVERAGE_INDEX_SCHEMA_VERSION)
    .order('built_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`coverage_index_snapshots lookup failed: ${error.message}`)
  }
  if (!data) {
    return null
  }

  return CoverageIndexSchema.parse(data.payload) as CoverageIndex
}

function formatOutputSummary(summary: RunSummary) {
  return [
    `matcher recall@3=${summary.metrics.matcher.recallAt3}`,
    `gap precision=${summary.metrics.gap.precision}`,
    `proposer agreement=${summary.metrics.proposer.agreement}`,
  ].join(', ')
}

async function resolveWriters(client: LedgerClient): Promise<{
  writerMode: 'real' | 'stand_in'
  writers: Writers
}> {
  if (!isG2AJudgeRealWriterEnabled()) {
    return {
      writerMode: 'stand_in',
      writers: defaultWriters(),
    }
  }

  const coverageIndex = await loadLatestCoverageIndex(client)

  return {
    writerMode: 'real',
    writers: createRealWriters({
      coverageIndex: coverageIndex ?? undefined,
    }),
  }
}

export async function runGoalActionJudgeJob(): Promise<JudgeJobSummary> {
  const client = createServiceClient()
  if (!client) {
    throw new Error(
      'Supabase service client is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)',
    )
  }

  const { writerMode, writers } = await resolveWriters(client)
  const startedAt = new Date()
  const evaluationRunIds: string[] = []

  try {
    const persistedRows = [] as Array<{
      evaluator: string
      score: number | null
      max_score: number
      verdict: 'pass' | 'fail' | 'warn' | 'pending' | 'skipped'
      rubric_ref: string
      fail_reasons: string[]
      details: Record<string, unknown>
      action_id: string | null
      goal_id: string | null
      evaluated_at: string
    }>

    const summary = await runJudge({
      split: 'validation',
      judgeLLM: createFakeJudgeLLM({
        fixture: fakeVerdicts as FakeVerdictFixture,
      }),
      writers,
      now: startedAt.toISOString(),
      persist: async (row) => {
        persistedRows.push(row)
      },
    })

    const agentRunId = randomUUID()
    const agentRunResult = await insertAgentRun(client, {
      id: agentRunId,
      agent_type: 'script',
      run_status: 'success',
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      input_summary: `goal-action judge validation (${writerMode})`,
      output_summary: formatOutputSummary(summary),
      artifacts: {
        run_id: summary.runId,
        verdict_count: summary.verdicts.length,
      },
      metadata: {
        kind: 'g2a_judge',
        writer_mode: writerMode,
        dataset_version: summary.datasetVersion,
        split: summary.split,
      },
    })

    if (agentRunResult.error || !agentRunResult.data) {
      throw new Error(agentRunResult.error ?? 'insertAgentRun returned no row')
    }

    for (const row of persistedRows) {
      const insertResult = await insertEvaluationRun(client, {
        ...row,
        agent_run_id: agentRunId,
        details: row.details as never,
      })

      if (insertResult.error || !insertResult.data) {
        throw new Error(
          insertResult.error ?? 'insertEvaluationRun returned no row',
        )
      }

      evaluationRunIds.push(insertResult.data.id)
    }

    return {
      enabled: true,
      writerMode,
      runId: summary.runId,
      agentRunId,
      evaluationRunIds,
      evaluator: summary.evaluator,
      metrics: summary.metrics,
      verdictCount: summary.verdicts.length,
    }
  } catch (error) {
    const message = toErrorMessage(error)
    await insertAgentRun(client, {
      agent_type: 'script',
      run_status: 'failed',
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      input_summary: `goal-action judge validation (${writerMode})`,
      output_summary: 'goal-action judge failed',
      artifacts: {},
      error_message: message,
      metadata: {
        kind: 'g2a_judge',
        writer_mode: writerMode,
      },
    })

    throw new Error(message)
  }
}
