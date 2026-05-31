import { z } from 'zod/v4'

import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { compileGoalChatOutput } from '@/lib/goals/speak2action'
import { createClient } from '@/lib/supabase/server'
import { MentorChatStructuredOutputSchema } from '@/types/mentor-chat'

export const dynamic = 'force-dynamic'

const compileParamsSchema = z.object({
  id: z.string().uuid(),
})

const compileBodySchema = z.object({
  structuredOutput: MentorChatStructuredOutputSchema,
  chatContext: z.object({
    nodeId: z.string().uuid().optional(),
    source: z.string().trim().min(1).optional(),
  }).optional(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'goals:chat:compile', RL_WRITE)
  if (rlResponse) {
    return rlResponse
  }

  const params = compileParamsSchema.safeParse(await context.params)
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

  const parsed = await validateBody(request, compileBodySchema)
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

  const result = await compileGoalChatOutput({
    goalId: params.data.id,
    userId: user.id,
    structuredOutput: parsed.data.structuredOutput,
    chatContext: parsed.data.chatContext,
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
          error: 'compile_failed',
          message: result.message,
        },
        { status: 500 },
        request,
      )
    case 'ok':
      return jsonResponse(
        {
          ok: result.ok,
          inserted: result.inserted,
          error: result.error,
        },
        {
          headers: {
            'Cache-Control': 'no-store',
          },
        },
        request,
      )
  }
}
