import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { planRevisionSchema } from '@/lib/api/schemas'
import { createNotification } from '@/lib/notifications/create'
import {
  buildRevisionSteps,
  calculateCoverageScore,
  getCompiledPlanRecord,
  persistCompiledPlanSnapshot,
} from '@/lib/compiled-plans'
import { computePlanSeed } from '@/lib/planner/goal-first'
import type { Database } from '@/lib/supabase/database.types'
import { emitTelemetryEvent } from '@/lib/telemetry'

/**
 * Reduce a free-text revision rationale to one of a handful of buckets so
 * PostHog has a non-PII categorical signal even after `reason` itself is
 * sanitised away. Matches are keyword-based and intentionally loose.
 */
function bucketRevisionReason(rationale: string | null | undefined): string {
  if (!rationale) return 'unspecified'
  const lowered = rationale.toLowerCase()
  if (/(block|stuck|躓|詰ま)/.test(lowered)) return 'blocked'
  if (/(時間|pace|schedule|ペース)/.test(lowered)) return 'pace_change'
  if (/(goal|目標|ゴール)/.test(lowered)) return 'goal_change'
  if (/(scope|範囲)/.test(lowered)) return 'scope_change'
  if (/(skill|level|難易|スキル)/.test(lowered)) return 'level_change'
  return 'other'
}

async function resolveRevisionNumber(
  userId: string,
  planId: string,
  client: SupabaseClient<Database>,
) {
  let revisionNumber = 0
  let currentId: string | null = planId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    revisionNumber += 1

    const response: {
      data: { parent_plan_id: string | null } | null
      error: { message: string } | null
    } = await client
      .from('compiled_plans')
      .select('parent_plan_id')
      .eq('user_id', userId)
      .eq('plan_id', currentId)
      .maybeSingle()
    const parentPlanId: string | null = response.data?.parent_plan_id ?? null

    if (response.error || !parentPlanId) {
      break
    }

    currentId = parentPlanId
  }

  return Math.max(revisionNumber, 1)
}

async function getActiveCompiledPlanIds(
  userId: string,
  client: SupabaseClient<Database>,
) {
  const response: {
    data: Array<{ plan_id: string | null }> | null
    error: { message: string } | null
  } = await client
    .from('compiled_plans')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (response.error) {
    return null
  }

  return Array.from(
    new Set(
      (response.data ?? [])
        .map((row) => row.plan_id?.trim())
        .filter((planId): planId is string => Boolean(planId)),
    ),
  )
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'plan-revision', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, planRevisionSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const client = await createClient()
  const {
    data: { user },
  } = await client.auth.getUser().catch(() => ({ data: { user: null } }))

  if (!user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です。' },
      { status: 401 },
      request,
    )
  }

  const currentPlan = await getCompiledPlanRecord({
    userId: user.id,
    planId: body.planId,
    client,
  })

  if (!currentPlan) {
    return jsonResponse(
      { error: 'plan_not_found', message: '対象のプランが見つかりません。' },
      { status: 404 },
      request,
    )
  }

  const newVersion = (await resolveRevisionNumber(user.id, currentPlan.planId, client)) + 1
  const activePlanIds = await getActiveCompiledPlanIds(user.id, client)

  if (activePlanIds === null) {
    return jsonResponse(
      {
        error: 'active_plan_lookup_failed',
        message: '現在のアクティブプランの取得に失敗しました。',
      },
      { status: 500 },
      request,
    )
  }

  const compiledRevision = await persistCompiledPlanSnapshot({
    client,
    userId: user.id,
    goal: body.goal,
    steps: buildRevisionSteps(body.revisedSteps),
    coverageScore: calculateCoverageScore(body.revisedSteps.length, 0),
    unsupportedCapabilities: [],
    rationale: body.revisionRationale,
    planSeed: computePlanSeed({ goal: body.goal }),
    parentPlanId: currentPlan.planId,
    supersedePlanIds: activePlanIds,
  })

  if (!compiledRevision.synced || !compiledRevision.planId) {
    return jsonResponse(
      {
        error: 'create_failed',
        message: compiledRevision.message ?? '新しいプランの作成に失敗しました。',
      },
      { status: 500 },
      request,
    )
  }

  createNotification({
    userId: user.id,
    type: 'plan_revision',
    title: `プランが改訂されました（v${newVersion}）`,
    body: body.revisionSummary ?? body.title,
    link: '/plan',
  })

  await emitTelemetryEvent({
    userId: user.id,
    eventName: 'plan_revised',
    planId: compiledRevision.planId,
    requestId: getRequestId(request),
    properties: {
      // `legacy_*` keys are kept for analytics continuity; values now point to
      // canonical compiled_plans UUIDs after the TQ-163 purge.
      legacy_plan_id: currentPlan.planId,
      legacy_new_plan_id: compiledRevision.planId,
      revision_number: newVersion,
      revision_summary: body.revisionSummary,
      reason_bucket: bucketRevisionReason(body.revisionRationale),
      reason: body.revisionRationale,
      source: 'planner_plan_revision',
    },
  })

  return jsonResponse({
    data: {
      newPlanId: compiledRevision.planId,
      version: newVersion,
      parentPlanId: currentPlan.planId,
      archivedPlanId: currentPlan.planId,
      revisionSummary: body.revisionSummary,
    },
  }, {}, request)
}
