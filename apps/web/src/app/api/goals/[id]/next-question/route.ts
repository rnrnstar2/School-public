import { z } from 'zod/v4'

import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import {
  nextQuestionRequestSchema,
} from '@/lib/api/schemas'
import { jsonResponse, getRequestId } from '@/lib/api/response'
import { generateAsk2ActionNextQuestion } from '@/lib/goals/ask2action'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const nextQuestionParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'goals:next-question:post', RL_AI)
  if (rlResponse) {
    return rlResponse
  }

  const params = nextQuestionParamsSchema.safeParse(await context.params)
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

  const parsed = await validateBody(request, nextQuestionRequestSchema)
  if ('error' in parsed) {
    return parsed.error
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

  const result = await generateAsk2ActionNextQuestion({
    userId: user.id,
    goalId: params.data.id,
    lastAnswer: parsed.data.lastAnswer,
    requestId: getRequestId(request),
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
          message: 'next question の生成に失敗しました',
        },
        { status: 500 },
        request,
      )
    case 'ok':
      return jsonResponse(
        {
          ok: true,
          nextQuestion: result.nextQuestion,
        },
        { headers: { 'Cache-Control': 'no-store' } },
        request,
      )
  }
}
