/**
 * TQ-241: Plan-step rationale API.
 *
 * Returns the per-step "なぜこのレッスン?" data for a given compiled
 * plan owned by the authenticated user.
 *
 * Phase 1: derived purely from `compiled_plans.steps` (TQ-215 / TQ-220
 * schema). When `decision_ledger.agent_runs` rows exist for the plan,
 * each step is enriched with a redacted summary list (no raw prompts).
 * If the table read fails (RLS, permissions, or empty), the route still
 * returns the deterministic rationales — the table is optional.
 */

import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { getCompiledPlanRecord } from '@/lib/compiled-plans'
import {
  extractStepRationales,
  type StepRationale,
  type StepSubAgentRun,
} from '@/lib/planner/goal-first/plan-rationale'
import { createClient } from '@/lib/supabase/server'

interface AgentRunRow {
  id: string
  agent_type: string
  output_summary: string | null
  started_at: string | null
  finished_at: string | null
  metadata: Record<string, unknown> | null
}

function safeMetadataString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null
  const value = metadata[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function safeMetadataPlanId(metadata: Record<string, unknown> | null): string | null {
  return safeMetadataString(metadata, 'plan_id') ?? safeMetadataString(metadata, 'planId')
}

function safeMetadataStepId(metadata: Record<string, unknown> | null): string | null {
  return (
    safeMetadataString(metadata, 'step_id')
    ?? safeMetadataString(metadata, 'stepId')
    ?? safeMetadataString(metadata, 'atom_id')
    ?? safeMetadataString(metadata, 'atomId')
  )
}

function durationMs(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) return null
  const startMs = Date.parse(startedAt)
  const endMs = Date.parse(finishedAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  return endMs - startMs
}

/**
 * Best-effort attach: groups agent_runs by `metadata.step_id` and merges
 * their redacted summaries onto matching rationales. Anything we can't
 * map cleanly is simply dropped — the helper never throws.
 *
 * Note: we only project `output_summary` (Anti-pattern: never expose raw
 * prompts / chain-of-thought).
 */
async function attachSubAgentRuns(
  rationales: StepRationale[],
  options: { userId: string; planId: string },
): Promise<StepRationale[]> {
  const supabase = await createClient()

  try {
    const { data, error } = await supabase
      .schema('decision_ledger')
      .from('agent_runs')
      .select('id, agent_type, output_summary, started_at, finished_at, metadata')
      .order('started_at', { ascending: true })
      .limit(200)

    if (error || !Array.isArray(data) || data.length === 0) {
      return rationales
    }

    // Filter to runs whose metadata.plan_id matches. Doing this in JS
    // (rather than via .eq on a JSON column) keeps the query simple and
    // works regardless of how callers encoded the metadata key.
    const runsByStep = new Map<string, StepSubAgentRun[]>()
    for (const row of data as AgentRunRow[]) {
      if (safeMetadataPlanId(row.metadata) !== options.planId) continue
      const userId = safeMetadataString(row.metadata, 'user_id')
        ?? safeMetadataString(row.metadata, 'userId')
      // If the row has a user_id and it doesn't match, skip — defense in
      // depth, even though service_role RLS already scopes by goal/action.
      if (userId && userId !== options.userId) continue
      const stepId = safeMetadataStepId(row.metadata)
      if (!stepId) continue

      const summary = (row.output_summary ?? '').trim()
      if (!summary) continue

      const entry: StepSubAgentRun = {
        runId: row.id,
        agentName: row.agent_type ?? 'agent',
        summary,
        durationMs: durationMs(row.started_at, row.finished_at),
        model: safeMetadataString(row.metadata, 'model'),
      }

      const list = runsByStep.get(stepId) ?? []
      list.push(entry)
      runsByStep.set(stepId, list)
    }

    if (runsByStep.size === 0) {
      return rationales
    }

    return rationales.map((entry) => ({
      ...entry,
      subAgentRuns: runsByStep.get(entry.stepId) ?? entry.subAgentRuns,
    }))
  } catch {
    // agent_runs table may not be reachable from anon/auth role; that's
    // expected in Phase 1. Fall back to deterministic rationales.
    return rationales
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'plan-rationale', RL_READ)
  if (rlResponse) return rlResponse

  const { planId: rawPlanId } = await params
  const planId = rawPlanId?.trim()

  if (!planId) {
    return jsonResponse(
      { error: 'plan_id_required', message: 'planId は必須です。' },
      { status: 400 },
      request,
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse(
      { error: 'unauthenticated', message: '認証が必要です。' },
      { status: 401 },
      request,
    )
  }

  const record = await getCompiledPlanRecord({
    userId: user.id,
    planId,
    client: supabase,
  })

  if (!record) {
    return jsonResponse(
      { error: 'plan_not_found', message: '指定のプランが見つかりません。' },
      { status: 404 },
      request,
    )
  }

  const rationales = extractStepRationales(record.plan)
  const enriched = await attachSubAgentRuns(rationales, {
    userId: user.id,
    planId: record.planId,
  })

  return jsonResponse(
    {
      data: {
        planId: record.planId,
        goal: record.goal,
        planSource: record.plan.source,
        rationales: enriched,
      },
    },
    {},
    request,
  )
}
