import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { cachedJsonResponse, jsonResponse } from '@/lib/api/response'

interface GoalAggregation {
  normalized_goal: string
  count: number
  latest_at: string
}

/**
 * GET /api/planner/unsupported-goals
 *
 * Aggregates unsupported_goal_log entries to identify high-demand track candidates.
 * Query params:
 *   - limit (default 20, max 100)
 *   - since (ISO date string, default 30 days ago)
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'unsupported-goals', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const url = new URL(request.url)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
  const sinceParam = url.searchParams.get('since')
  const since = sinceParam ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('unsupported_goal_log')
    .select('normalized_goal, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) {
    return jsonResponse(
      { error: 'unsupported_goal_log の取得に失敗しました。', detail: error.message },
      { status: 500 },
      request,
    )
  }

  // Aggregate by normalized_goal
  const aggregation = new Map<string, { count: number; latest_at: string }>()
  for (const row of data ?? []) {
    const key = row.normalized_goal
    const existing = aggregation.get(key)
    if (existing) {
      existing.count += 1
      if (row.created_at > existing.latest_at) {
        existing.latest_at = row.created_at
      }
    } else {
      aggregation.set(key, { count: 1, latest_at: row.created_at })
    }
  }

  const goals: GoalAggregation[] = Array.from(aggregation.entries())
    .map(([normalized_goal, { count, latest_at }]) => ({
      normalized_goal,
      count,
      latest_at,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)

  return cachedJsonResponse({
    goals,
    total_unique: aggregation.size,
    total_entries: (data ?? []).length,
    since,
  }, {}, request)
}
