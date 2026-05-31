'use client'

import { useCallback, useEffect, useState } from 'react'
import type {
  TrackProgressSummary,
  CrossTrackSkillAnalysis,
  TrackRecommendation,
  CrossTrackTimelineEntry,
} from '@/lib/curriculum/multi-track'

export interface MultiTrackData {
  trackProgress: TrackProgressSummary[]
  skillAnalysis: CrossTrackSkillAnalysis
  recommendations: TrackRecommendation[]
  timeline: CrossTrackTimelineEntry[]
}

const EMPTY: MultiTrackData = {
  trackProgress: [],
  skillAnalysis: { sharedSkills: [], skippableLessonIds: [] },
  recommendations: [],
  timeline: [],
}

export function useMultiTrack() {
  const [data, setData] = useState<MultiTrackData>(EMPTY)
  const [loading, setLoading] = useState(true)

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch('/api/planner/multi-track')
      if (!res.ok) return
      const json = await res.json()
      if (json.data) {
        setData(json.data)
      }
    } catch {
      // silently fail — multi-track is supplementary
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetch_()
  }, [fetch_])

  return { ...data, loading, refresh: fetch_ }
}
