import { jsonResponse } from '@/lib/api/response'
import { listGoalsWithNodesForUser } from '@/lib/supabase/decision-ledger'
import { createClient } from '@/lib/supabase/server'
import { goalTreeApiResponseSchema } from '@/types/goal-tree'

const INTERNAL_ERROR_RESPONSE = {
  error: 'internal_error',
  message: 'ゴールツリーの読み込みに失敗しました',
} as const

export async function GET(request: Request) {
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

  const result = await listGoalsWithNodesForUser(user.id)
  if (result.error || !result.data) {
    console.error('[api/goals/me] failed to load goals', {
      userId: user.id,
      error: result.error ?? 'goals payload was empty',
    })
    return jsonResponse(
      INTERNAL_ERROR_RESPONSE,
      { status: 500 },
      request,
    )
  }

  const payload = { goals: result.data }
  const parsed = goalTreeApiResponseSchema.safeParse(payload)

  if (!parsed.success) {
    console.error('[api/goals/me] invalid response payload', parsed.error.flatten())
    return jsonResponse(
      INTERNAL_ERROR_RESPONSE,
      { status: 500 },
      request,
    )
  }

  return jsonResponse(parsed.data, {}, request)
}
