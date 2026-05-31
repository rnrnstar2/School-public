import { createServiceClient } from '@/lib/supabase/service'
import type { Database } from '@/lib/supabase/database.types'

type NotificationRow = Database['public']['Tables']['notifications']['Row']
type NotificationInsert = Database['public']['Tables']['notifications']['Insert']
type NotificationPreferencesRow = Database['public']['Tables']['notification_preferences']['Row']

export type NotificationType = NotificationRow['type']

type PreferenceColumn = Extract<
  keyof NotificationPreferencesRow,
  | 'in_app_milestone'
  | 'in_app_streak'
  | 'in_app_lesson_recommendation'
  | 'in_app_plan_revision'
  | 'in_app_artifact_verified'
>

/** preference column name for each notification type */
const PREF_COLUMN: Record<NotificationType, PreferenceColumn> = {
  milestone_reached: 'in_app_milestone',
  streak_update: 'in_app_streak',
  lesson_recommendation: 'in_app_lesson_recommendation',
  plan_revision: 'in_app_plan_revision',
  artifact_verified: 'in_app_artifact_verified',
}

/**
 * Create an in-app notification for a user.
 * Respects the user's notification_preferences (skips if disabled).
 * Uses service client so it can be called from any API route.
 * Fire-and-forget: never throws.
 */
export async function createNotification(params: {
  userId: string
  type: NotificationType
  title: string
  body?: string
  link?: string
}): Promise<void> {
  try {
    const supabase = createServiceClient()
    if (!supabase) return

    // Check user preference (select all flag columns so we can index by prefCol).
    const prefCol = PREF_COLUMN[params.type]
    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select(
        'in_app_milestone, in_app_streak, in_app_lesson_recommendation, in_app_plan_revision, in_app_artifact_verified',
      )
      .eq('user_id', params.userId)
      .maybeSingle()

    // If explicit preference is false, skip
    if (prefs && prefs[prefCol] === false) return

    const insertPayload: NotificationInsert = {
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? '',
      link: params.link ?? null,
    }

    await supabase.from('notifications').insert(insertPayload)
  } catch (err) {
    console.error('[createNotification] error:', err)
  }
}
