'use client'

/**
 * LessonStartedTracker (TQ-120-01)
 *
 * Fires a single `lesson_started` PostHog event per lesson per browser
 * session. Deduplication is enforced inside `trackLessonStarted`; this
 * component is purely a lifecycle bridge so the server-rendered lesson
 * page can opt-in to client-side tracking without turning into a client
 * component itself.
 *
 * PII posture (CURRENT_MISSION.md §31):
 *   - `lesson_id`, `track_id`, `lesson_title` are platform metadata.
 *   - No `goal`, `email`, `full_name`, or chat body is sent.
 */

import { useEffect } from 'react'
import { trackLessonStarted } from '@/lib/analytics/track-helpers'

interface LessonStartedTrackerProps {
  lessonId: string
  lessonTitle: string
  trackId?: string | null
  fromRecommendation?: boolean
}

export function LessonStartedTracker({
  lessonId,
  lessonTitle,
  trackId,
  fromRecommendation = false,
}: LessonStartedTrackerProps) {
  useEffect(() => {
    if (!lessonId) return
    trackLessonStarted(
      lessonId,
      lessonTitle,
      trackId ?? 'unknown',
      fromRecommendation,
    )
  }, [lessonId, lessonTitle, trackId, fromRecommendation])

  return null
}
