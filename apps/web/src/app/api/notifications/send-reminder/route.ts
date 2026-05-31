import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sendEmail } from '@/lib/email/send'
import { streakReminderTemplate } from '@/lib/email/templates'

export const dynamic = 'force-dynamic'

/**
 * POST /api/notifications/send-reminder
 *
 * Cron endpoint: scans users with email_enabled=true and streak at risk
 * (48h+ since last activity), sends reminder emails.
 *
 * Protected by CRON_SECRET header for Vercel Cron Jobs.
 */
export async function POST(request: Request) {
  // Authenticate cron request
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  if (!supabase) {
    return NextResponse.json(
      { error: 'Service client not available' },
      { status: 500 },
    )
  }

  // Get users with email notifications enabled and frequency != 'never'
  const { data: prefs, error: prefsError } = await supabase
    .from('email_notification_preferences')
    .select('user_id, frequency, last_reminder_sent_at')
    .eq('email_enabled', true)
    .neq('frequency', 'never')

  if (prefsError || !prefs) {
    console.error('[send-reminder] Failed to fetch preferences:', prefsError)
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 })
  }

  const now = new Date()
  let sent = 0
  let skipped = 0

  for (const pref of prefs) {
    // Respect frequency: skip if already sent within window
    if (pref.last_reminder_sent_at) {
      const lastSent = new Date(pref.last_reminder_sent_at)
      const hoursSinceLastEmail = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60)
      const minHours = pref.frequency === 'weekly' ? 168 : 24
      if (hoursSinceLastEmail < minHours) {
        skipped++
        continue
      }
    }

    // Get user's email from auth
    const { data: { user } } = await supabase.auth.admin.getUserById(pref.user_id)
    if (!user?.email) {
      skipped++
      continue
    }

    // Get user's last activity to determine if at-risk
    const { data: recentProgress } = await supabase
      .from('user_progress')
      .select('completed_at')
      .eq('user_id', pref.user_id)
      .eq('completed', true)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)

    const { data: recentTasks } = await supabase
      .from('task_progress')
      .select('updated_at, plan_id')
      .eq('status', 'completed')
      .order('updated_at', { ascending: false })
      .limit(1)

    // Determine last activity timestamp
    const lastProgressAt = recentProgress?.[0]?.completed_at
      ? new Date(recentProgress[0].completed_at)
      : null
    const lastTaskAt = recentTasks?.[0]?.updated_at
      ? new Date(recentTasks[0].updated_at)
      : null

    const lastActivity = [lastProgressAt, lastTaskAt]
      .filter(Boolean)
      .sort((a, b) => b!.getTime() - a!.getTime())[0]

    if (!lastActivity) {
      skipped++
      continue
    }

    const hoursSinceAccess = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60)

    // Only send if 48-72h window (at-risk but not yet broken)
    if (hoursSinceAccess < 48 || hoursSinceAccess > 72) {
      skipped++
      continue
    }

    // Calculate streak for the email
    const { data: allCompletions } = await supabase
      .from('user_progress')
      .select('completed_at')
      .eq('user_id', pref.user_id)
      .eq('completed', true)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })

    const uniqueDays = [
      ...new Set(
        (allCompletions ?? [])
          .filter((r): r is { completed_at: string } => r.completed_at != null)
          .map((r) => new Date(r.completed_at).toISOString().slice(0, 10))
      ),
    ].sort().reverse()

    const today = now.toISOString().slice(0, 10)
    const streak = calculateStreak(uniqueDays, today)

    if (streak === 0) {
      skipped++
      continue
    }

    // Get display name
    const { data: profile } = await supabase
      .from('learner_profile')
      .select('display_name')
      .eq('user_id', pref.user_id)
      .maybeSingle()

    const displayName = profile?.display_name || 'ラーナー'

    const template = streakReminderTemplate({
      displayName,
      streak,
      hoursSinceAccess,
    })

    const success = await sendEmail({
      to: user.email,
      ...template,
    })

    if (success) {
      // Update last_reminder_sent_at
      await supabase
        .from('email_notification_preferences')
        .update({ last_reminder_sent_at: now.toISOString() })
        .eq('user_id', pref.user_id)

      // Log the notification
      await supabase
        .from('email_notification_log')
        .insert({
          user_id: pref.user_id,
          email_type: 'streak_reminder',
          metadata: { streak, hoursSinceAccess: Math.round(hoursSinceAccess) },
        })

      sent++
    } else {
      skipped++
    }
  }

  return NextResponse.json({ sent, skipped, total: prefs.length })
}

function calculateStreak(sortedDaysDesc: string[], today: string): number {
  if (sortedDaysDesc.length === 0) return 0

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().slice(0, 10)

  const first = sortedDaysDesc[0]
  if (first !== today && first !== yesterdayStr) return 0

  let streak = 1
  let currentDate = new Date(first)

  for (let i = 1; i < sortedDaysDesc.length; i++) {
    const expectedPrev = new Date(currentDate)
    expectedPrev.setDate(expectedPrev.getDate() - 1)
    const expectedStr = expectedPrev.toISOString().slice(0, 10)

    if (sortedDaysDesc[i] === expectedStr) {
      streak++
      currentDate = expectedPrev
    } else if (sortedDaysDesc[i] === currentDate.toISOString().slice(0, 10)) {
      continue
    } else {
      break
    }
  }

  return streak
}
