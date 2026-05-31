import { z } from 'zod/v4'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { milestoneTemplate, graduationTemplate } from '@/lib/email/templates'

export const dynamic = 'force-dynamic'

const celebrationSchema = z.object({
  type: z.enum(['milestone', 'graduation']),
  title: z.string().min(1).max(500),
})

/**
 * POST /api/notifications/send-celebration
 * Send a celebration email (milestone or graduation) to the authenticated user.
 * Called internally when a milestone is verified or graduation is triggered.
 */
export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'notifications:celebration', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const parsed = await validateBody(request, celebrationSchema)
  if ('error' in parsed) return parsed.error

  const { type, title } = parsed.data

  // Check if user has opted in to this email type
  const { data: prefs } = await supabase
    .from('email_notification_preferences')
    .select('email_enabled, milestone_emails, graduation_emails')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!prefs?.email_enabled) {
    return jsonResponse({ sent: false, reason: 'email_disabled' }, {}, request)
  }

  if (type === 'milestone' && !prefs.milestone_emails) {
    return jsonResponse({ sent: false, reason: 'milestone_emails_disabled' }, {}, request)
  }
  if (type === 'graduation' && !prefs.graduation_emails) {
    return jsonResponse({ sent: false, reason: 'graduation_emails_disabled' }, {}, request)
  }

  // Get display name
  const { data: profile } = await supabase
    .from('learner_profile')
    .select('display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  const displayName = profile?.display_name || 'ラーナー'

  const template =
    type === 'milestone'
      ? milestoneTemplate({ displayName, milestoneTitle: title })
      : graduationTemplate({ displayName, trackTitle: title })

  const success = await sendEmail({
    to: user.email,
    ...template,
  })

  if (success) {
    // Log the notification
    await supabase
      .from('email_notification_log')
      .insert({
        user_id: user.id,
        email_type: type,
        metadata: { title },
      })
  }

  return jsonResponse({ sent: success }, {}, request)
}
