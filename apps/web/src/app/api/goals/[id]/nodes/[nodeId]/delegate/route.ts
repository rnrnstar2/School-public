import { z } from 'zod/v4'

import {
  applyRateLimit,
  RL_AI,
  validateBody,
} from '@/lib/api/guard'
import { jsonResponse, getRequestId } from '@/lib/api/response'
import {
  aiDelegationKindSchema,
  createAiDelegationBrief,
  type AiDelegationMode,
} from '@/lib/goals/ai-delegation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const delegateParamsSchema = z.object({
  id: z.string().uuid(),
  nodeId: z.string().uuid(),
})

const delegateBodySchema = z.object({
  delegateKind: aiDelegationKindSchema,
})

function resolveDelegationMode(request: Request): AiDelegationMode {
  const header = request.headers.get('x-ai-delegation-mode')?.trim().toLowerCase()
  return header === 'mock' ? 'mock' : 'auto'
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'goals:nodes:delegate', RL_AI)
  if (rlResponse) {
    return rlResponse
  }

  const params = delegateParamsSchema.safeParse(await context.params)
  if (!params.success) {
    return jsonResponse(
      {
        error: 'invalid_params',
        message: 'goalId / nodeId が不正です',
      },
      { status: 400 },
      request,
    )
  }

  const parsed = await validateBody(request, delegateBodySchema)
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

  const result = await createAiDelegationBrief({
    userId: user.id,
    goalId: params.data.id,
    nodeId: params.data.nodeId,
    delegateKind: parsed.data.delegateKind,
    mode: resolveDelegationMode(request),
    requestId: getRequestId(request),
  })

  switch (result.kind) {
    case 'not_found':
      return jsonResponse(
        {
          error: 'not_found',
          message: 'goal または node が見つかりません',
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
    case 'invalid_owner_type':
      return jsonResponse(
        {
          error: 'invalid_owner_type',
          message: 'owner_type は ai または both の task のみ AI 委譲できます',
          ownerType: result.ownerType,
        },
        { status: 400 },
        request,
      )
    case 'error':
      return jsonResponse(
        {
          error: 'delegate_failed',
          message: result.message,
        },
        { status: 500 },
        request,
      )
    case 'ok':
      return jsonResponse(
        {
          ok: true,
          brief: result.brief,
          contextId: result.contextId,
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
