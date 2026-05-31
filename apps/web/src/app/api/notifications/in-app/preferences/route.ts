import { z } from 'zod/v4'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/in-app/preferences
 * インアプリ通知の種類別ON/OFF設定取得
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:in-app-prefs:read', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const { data } = await supabase
    .from('notification_preferences')
    .select('in_app_milestone, in_app_streak, in_app_lesson_recommendation, in_app_plan_revision, in_app_artifact_verified')
    .eq('user_id', user.id)
    .maybeSingle()

  return jsonResponse({
    preferences: data ?? {
      in_app_milestone: true,
      in_app_streak: true,
      in_app_lesson_recommendation: true,
      in_app_plan_revision: true,
      in_app_artifact_verified: true,
    },
  }, {}, request)
}

const updateSchema = z.object({
  in_app_milestone: z.boolean().optional(),
  in_app_streak: z.boolean().optional(),
  in_app_lesson_recommendation: z.boolean().optional(),
  in_app_plan_revision: z.boolean().optional(),
  in_app_artifact_verified: z.boolean().optional(),
})

/**
 * POST /api/notifications/in-app/preferences
 * インアプリ通知設定の更新
 */
export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:in-app-prefs:write', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, updateSchema)
  if ('error' in parsed) return parsed.error

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: user.id,
        ...parsed.data,
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('[in-app-prefs] upsert error:', error)
    return jsonResponse({ error: '設定の保存に失敗しました。' }, { status: 500 }, request)
  }

  return jsonResponse({ success: true }, {}, request)
}
