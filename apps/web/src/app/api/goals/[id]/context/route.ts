import { z } from 'zod/v4'

import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { fetchGoalContextForUser } from '@/lib/goals/goal-context'
import { createClient } from '@/lib/supabase/server'
import { goalContextApiResponseSchema } from '@/types/goal-tree'

export const dynamic = 'force-dynamic'

const goalContextParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'goals:context:get', RL_READ)
  if (rlResponse) {
    return rlResponse
  }

  const params = goalContextParamsSchema.safeParse(await context.params)
  if (!params.success) {
    return jsonResponse(
      {
        error: 'invalid_goal_id',
        message: 'goal id が不正です',
      },
      { status: 400 },
      request,
    )
  }

  const client = await createClient()
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser()

  if (authError || !user) {
    return jsonResponse(
      {
        error: 'unauthorized',
        message: '認証が必要です',
      },
      { status: 401 },
      request,
    )
  }

  const result = await fetchGoalContextForUser(user.id, params.data.id)

  switch (result.kind) {
    case 'not_found':
      return jsonResponse(
        {
          error: 'not_found',
          message: 'goal が見つかりません',
        },
        { status: 404 },
        request,
      )
    case 'forbidden':
      return jsonResponse(
        {
          error: 'forbidden',
          message: 'この goal にはアクセスできません',
        },
        { status: 403 },
        request,
      )
    case 'error':
      return jsonResponse(
        {
          error: 'internal_error',
          message: 'goal context の読み込みに失敗しました',
        },
        { status: 500 },
        request,
      )
    case 'ok':
      return jsonResponse(
        goalContextApiResponseSchema.parse(result.data),
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
        request,
      )
  }
}
