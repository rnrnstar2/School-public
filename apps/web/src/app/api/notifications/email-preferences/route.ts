import { z } from 'zod/v4'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications/email-preferences
 * Get the authenticated user's email notification preferences.
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:email-prefs:read', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const { data } = await supabase
    .from('email_notification_preferences')
    .select('email_enabled, frequency, milestone_emails, graduation_emails')
    .eq('user_id', user.id)
    .maybeSingle()

  return jsonResponse({
    preferences: data ?? {
      email_enabled: false,
      frequency: 'daily',
      milestone_emails: true,
      graduation_emails: true,
    },
  }, {}, request)
}

const updateSchema = z.object({
  email_enabled: z.boolean(),
  frequency: z.enum(['daily', 'weekly', 'never']),
  milestone_emails: z.boolean(),
  graduation_emails: z.boolean(),
})

/**
 * POST /api/notifications/email-preferences
 * Create or update email notification preferences.
 */
export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:email-prefs:write', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, updateSchema)
  if ('error' in parsed) return parsed.error

  const { error } = await supabase
    .from('email_notification_preferences')
    .upsert(
      {
        user_id: user.id,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error) {
    console.error('[email-preferences] upsert error:', error)
    return jsonResponse({ error: '設定の保存に失敗しました。' }, { status: 500 }, request)
  }

  return jsonResponse({ success: true }, {}, request)
}
