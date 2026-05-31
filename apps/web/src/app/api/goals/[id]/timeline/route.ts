import { z } from 'zod/v4'

import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { listProgressTimelineForGoal } from '@/lib/goals/progress-timeline'
import { createClient } from '@/lib/supabase/server'
import { goalProgressTimelineResponseSchema } from '@/types/goal-tree'

export const dynamic = 'force-dynamic'

const goalTimelineParamsSchema = z.object({
  id: z.string().uuid(),
})

const goalTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
})

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'goals:timeline:get', RL_READ)
  if (rlResponse) {
    return rlResponse
  }

  const params = goalTimelineParamsSchema.safeParse(await context.params)
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

  const query = goalTimelineQuerySchema.safeParse({
    limit: new URL(request.url).searchParams.get('limit') ?? undefined,
  })
  if (!query.success) {
    return jsonResponse(
      {
        error: 'invalid_limit',
        message: 'limit は 1 以上 50 以下の整数で指定してください',
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

  const result = await listProgressTimelineForGoal(user.id, params.data.id, {
    limit: query.data.limit,
  })

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
          message: 'progress timeline の読み込みに失敗しました',
        },
        { status: 500 },
        request,
      )
    case 'ok':
      return jsonResponse(
        goalProgressTimelineResponseSchema.parse(result.data),
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
        request,
      )
  }
}
