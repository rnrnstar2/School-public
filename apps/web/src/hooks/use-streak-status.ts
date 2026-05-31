'use client'

import { useEffect, useState } from 'react'

const LAST_ACCESS_KEY = 'school:last-access-timestamp'

export type StreakState = 'maintaining' | 'at-risk' | 'broken' | 'none'

export interface StreakStatus {
  streak: number
  state: StreakState
  hoursSinceLastAccess: number | null
  loading: boolean
}

/**
 * Calculates streak state based on analytics API data and last access time.
 * - maintaining: streak > 0 and accessed within 24h
 * - at-risk: streak > 0 but 24-72h since last access
 * - broken: had a streak but now 0 (or 72h+ since last access)
 * - none: never had a streak
 */
export function useStreakStatus(): StreakStatus {
  const [status, setStatus] = useState<StreakStatus>({
    streak: 0,
    state: 'none',
    loading: true,
    hoursSinceLastAccess: null,
  })

  useEffect(() => {
    const now = Date.now()
    const lastAccessStr = localStorage.getItem(LAST_ACCESS_KEY)
    const lastAccess = lastAccessStr ? parseInt(lastAccessStr, 10) : null
    const hoursSinceLastAccess = lastAccess
      ? (now - lastAccess) / (1000 * 60 * 60)
      : null

    // Update last access timestamp
    localStorage.setItem(LAST_ACCESS_KEY, String(now))

    fetch('/api/analytics/learner')
      .then((res) => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then((data: { streak: number }) => {
        const streak = data.streak ?? 0
        let state: StreakState = 'none'

        if (streak > 0) {
          if (hoursSinceLastAccess === null || hoursSinceLastAccess < 24) {
            state = 'maintaining'
          } else if (hoursSinceLastAccess < 72) {
            state = 'at-risk'
          } else {
            state = 'broken'
          }
        } else if (lastAccess !== null) {
          // Had previous access but streak is 0 → broken
          state = 'broken'
        }

        setStatus({ streak, state, hoursSinceLastAccess, loading: false })
      })
      .catch(() => {
        setStatus({ streak: 0, state: 'none', hoursSinceLastAccess, loading: false })
      })
  }, [])

  return status
}
