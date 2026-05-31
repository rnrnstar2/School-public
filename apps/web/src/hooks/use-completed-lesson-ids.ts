'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { readLocallyCompletedLessonIds, subscribeToLessonCompletionChanges } from '@/lib/lesson-completion'
import { supabase } from '@/lib/supabase/client'
import { useRefreshOnVisible } from './use-refresh-on-visible'

function normalizeLessonIds(lessonIds: string[]) {
  return Array.from(new Set(lessonIds.map((lessonId) => lessonId.trim()).filter(Boolean))).sort()
}

export function useCompletedLessonIds(lessonIds: string[]) {
  const normalizedLessonIds = normalizeLessonIds(lessonIds)
  const lessonIdsKey = normalizedLessonIds.join('|')
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([])
  // Holds the latest refresh function so useRefreshOnVisible can invoke it
  // without re-subscribing whenever lessonIdsKey changes.
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  useEffect(() => {
    const candidateLessonIds = lessonIdsKey ? lessonIdsKey.split('|') : []

    if (candidateLessonIds.length === 0) {
      refreshRef.current = async () => {}
      return
    }

    let active = true

    async function refreshCompletedLessonIds() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: progressRows, error } = await supabase
            .from('user_progress')
            .select('lesson_id')
            .eq('user_id', user.id)
            .eq('completed', true)
            .in('lesson_id', candidateLessonIds)

          if (!error) {
            const dbCompleted = new Set<string>()
            for (const row of progressRows ?? []) {
              if (row.lesson_id) {
                dbCompleted.add(row.lesson_id)
              }
            }
            if (active) {
              setCompletedLessonIds(Array.from(dbCompleted).sort())
            }
            return
          }
        }
      } catch {
        // Keep local completion state even when auth or DB refresh is unavailable.
      }

      const mergedCompleted = new Set<string>(readLocallyCompletedLessonIds(candidateLessonIds))

      if (active) {
        setCompletedLessonIds(Array.from(mergedCompleted).sort())
      }
    }

    refreshRef.current = refreshCompletedLessonIds
    void refreshCompletedLessonIds()

    const unsubscribe = subscribeToLessonCompletionChanges(() => {
      void refreshCompletedLessonIds()
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [lessonIdsKey])

  // Refresh on tab-visible via the shared hook so we stay in sync with other
  // tabs (debounced to avoid duplicate refetches on rapid focus events).
  useRefreshOnVisible(
    useCallback(() => {
      void refreshRef.current()
    }, []),
    { enabled: lessonIdsKey.length > 0 },
  )

  return lessonIdsKey ? completedLessonIds : []
}
