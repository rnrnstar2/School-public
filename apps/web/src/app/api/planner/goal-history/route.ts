import { createClient } from '@/lib/supabase/server'
import {
  getGoalHistory,
  createGoalHistory,
  switchToGoal,
} from '@/lib/supabase/goal-history'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { goalHistoryCreateSchema, goalHistorySwitchSchema } from '@/lib/api/schemas'
import { cachedJsonResponse, jsonResponse } from '@/lib/api/response'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'goal-history:get', RL_READ)
  if (rlResponse) return rlResponse

  const client = await createClient()
  const result = await getGoalHistory(client)

  if (result.error) {
    return jsonResponse(
      { error: 'fetch_failed', message: result.error },
      { status: 500 },
      request,
    )
  }

  return cachedJsonResponse({ data: result.data }, {}, request)
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'goal-history:post', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, goalHistoryCreateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const client = await createClient()
  const result = await createGoalHistory(
    { goal: body.goal, plan_id: body.plan_id },
    client
  )

  if (result.error) {
    return jsonResponse(
      { error: 'create_failed', message: result.error },
      { status: 500 },
      request,
    )
  }

  return jsonResponse({ data: result.data }, {}, request)
}

export async function PUT(request: Request) {
  const rlResponse = await applyRateLimit(request, 'goal-history:put', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, goalHistorySwitchSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const client = await createClient()
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return jsonResponse(
      { error: 'unauthorized', message: '認証が必要です' },
      { status: 401 },
      request,
    )
  }

  const compiledPlanClient = createServiceClient()
  if (!compiledPlanClient) {
    return jsonResponse(
      { error: 'switch_failed', message: 'service role client unavailable' },
      { status: 500 },
      request,
    )
  }

  const result = await switchToGoal(body.goalHistoryId, client, {
    userId: user.id,
    compiledPlanClient,
  })

  if (result.error) {
    return jsonResponse(
      { error: 'switch_failed', message: result.error },
      { status: 500 },
      request,
    )
  }

  return jsonResponse({ data: result.data }, {}, request)
}
