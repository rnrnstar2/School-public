import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const FUNNEL_STAGES = [
  { key: 'lesson_started', label: 'レッスン開始' },
  { key: 'lesson_completed', label: 'レッスン完了' },
  { key: 'stuck_reported', label: '詰まり報告' },
  { key: 'artifact_submitted', label: '成果物提出' },
  { key: 'evidence_passed', label: 'エビデンス通過' },
  { key: 'plan_revised', label: 'プラン改訂' },
  { key: 'lesson_skipped', label: 'レッスンスキップ' },
  { key: 'unsupported_goal_detected', label: 'unsupported goal 検知' },
] as const

function resolveDateRange(url: URL) {
  const now = new Date()
  const daysParam = Number(url.searchParams.get('days') ?? '')
  const days = Number.isFinite(daysParam) && daysParam > 0
    ? Math.min(daysParam, 365)
    : 30

  const toParam = url.searchParams.get('to')?.trim()
  const fromParam = url.searchParams.get('from')?.trim()
  const to = toParam ? new Date(toParam) : now
  const from = fromParam
    ? new Date(fromParam)
    : new Date(to.getTime() - days * 24 * 60 * 60 * 1000)

  return {
    from: Number.isNaN(from.getTime()) ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : from,
    to: Number.isNaN(to.getTime()) ? now : to,
  }
}

function buildStageCounts(events: Array<{ event_name: string }>) {
  const counts = new Map<string, number>()

  for (const stage of FUNNEL_STAGES) {
    counts.set(stage.key, 0)
  }

  for (const event of events) {
    counts.set(event.event_name, (counts.get(event.event_name) ?? 0) + 1)
  }

  return FUNNEL_STAGES.map((stage, index) => {
    const count = counts.get(stage.key) ?? 0
    const previousCount = index === 0
      ? count
      : (counts.get(FUNNEL_STAGES[index - 1].key) ?? 0)
    const dropoffRate = previousCount > 0
      ? Math.max(0, Math.round((1 - count / previousCount) * 100))
      : 0

    return {
      key: stage.key,
      label: stage.label,
      count,
      dropoff_rate: index === 0 ? 0 : dropoffRate,
    }
  })
}

/**
 * GET /api/analytics/funnel
 *
 * Query params:
 * - from: ISO timestamp
 * - to: ISO timestamp
 * - days: fallback range if from/to are omitted (default 30)
 * - personaId: optional compiled_plans.persona_id filter
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'analytics:funnel', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const url = new URL(request.url)
  const { from, to } = resolveDateRange(url)
  const personaId = url.searchParams.get('personaId')?.trim() || null

  let compiledPlanIds: string[] | null = null

  if (personaId) {
    const { data: plans, error: plansError } = await supabase
      .from('compiled_plans' as never)
      .select('plan_id')
      .eq('user_id', user.id)
      .eq('persona_id', personaId)

    if (plansError) {
      return jsonResponse(
        { error: 'compiled_plans の取得に失敗しました。', detail: plansError.message },
        { status: 500 },
        request,
      )
    }

    compiledPlanIds = ((plans ?? []) as Array<{ plan_id: string }>).map((plan) => plan.plan_id)
    if (compiledPlanIds.length === 0) {
      return jsonResponse(
        {
          stages: buildStageCounts([]),
          filters: {
            from: from.toISOString(),
            to: to.toISOString(),
            persona_id: personaId,
          },
          generated_at: new Date().toISOString(),
        },
        {},
        request,
      )
    }
  }

  let query = supabase
    .from('telemetry_events' as never)
    .select('event_name, plan_id, occurred_at')
    .eq('user_id', user.id)
    .in('event_name', FUNNEL_STAGES.map((stage) => stage.key))
    .gte('occurred_at', from.toISOString())
    .lte('occurred_at', to.toISOString())
    .order('occurred_at', { ascending: true })

  if (compiledPlanIds) {
    query = query.in('plan_id', compiledPlanIds)
  }

  const { data, error } = await query

  if (error) {
    return jsonResponse(
      { error: 'telemetry_events の取得に失敗しました。', detail: error.message },
      { status: 500 },
      request,
    )
  }

  return jsonResponse(
    {
      stages: buildStageCounts((data ?? []) as Array<{ event_name: string }>),
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        persona_id: personaId,
      },
      generated_at: new Date().toISOString(),
    },
    {},
    request,
  )
}
