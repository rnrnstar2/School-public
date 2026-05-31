import { z } from 'zod/v4'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/in-app
 * 通知一覧取得（最新50件）
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:in-app:read', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, read, link, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[notifications:in-app] fetch error:', error)
    return jsonResponse({ error: '通知の取得に失敗しました。' }, { status: 500 }, request)
  }

  const rows = notifications ?? []
  const unreadCount = rows.filter((n) => !n.read).length

  return jsonResponse({ notifications: rows, unreadCount }, {}, request)
}

const markReadSchema = z.object({
  action: z.enum(['mark_read', 'mark_all_read']),
  notificationId: z.string().uuid().optional(),
})

/**
 * PATCH /api/notifications/in-app
 * 既読マーク（単体 or 全既読）
 */
export async function PATCH(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:in-app:write', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, markReadSchema)
  if ('error' in parsed) return parsed.error

  const { action, notificationId } = parsed.data

  if (action === 'mark_read' && notificationId) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id)

    if (error) {
      console.error('[notifications:in-app] mark_read error:', error)
      return jsonResponse({ error: '既読更新に失敗しました。' }, { status: 500 }, request)
    }
  } else if (action === 'mark_all_read') {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (error) {
      console.error('[notifications:in-app] mark_all_read error:', error)
      return jsonResponse({ error: '全既読更新に失敗しました。' }, { status: 500 }, request)
    }
  }

  return jsonResponse({ success: true }, {}, request)
}
