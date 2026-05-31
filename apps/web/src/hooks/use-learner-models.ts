'use client'

import { useEffect, useState } from 'react'
import {
  getLearnerProfile,
  getLearnerState,
  getMentorMemory,
  upsertLearnerProfile,
  upsertLearnerState,
  upsertMentorMemory,
} from '@/lib/learner-models'
import type {
  LearnerProfile,
  LearnerProfileInput,
  LearnerState,
  LearnerStateInput,
  MentorMemory,
  MentorMemoryInput,
} from '@/types'

type ResourceState<T, TInput> = {
  data: T | null
  loading: boolean
  saving: boolean
  error: string | null
  refresh: () => Promise<T | null>
  save: (input: TInput) => Promise<T | null>
}

function useLearnerResource<T, TInput>(
  fetcher: () => Promise<{ data: T | null; error: string | null }>,
  saver: (input: TInput) => Promise<{ data: T | null; error: string | null }>
): ResourceState<T, TInput> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    const result = await fetcher()

    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setError(null)
    }

    setLoading(false)
    return result.data
  }

  const save = async (input: TInput) => {
    setSaving(true)
    const result = await saver(input)

    if (result.error) {
      setError(result.error)
    } else {
      setData(result.data)
      setError(null)
    }

    setSaving(false)
    return result.data
  }

  useEffect(() => {
    let active = true

    const load = async () => {
      const result = await fetcher()
      if (!active) {
        return
      }

      if (result.error) {
        setError(result.error)
      } else {
        setData(result.data)
        setError(null)
      }

      setLoading(false)
    }

    void load()

    return () => {
      active = false
    }
  }, [fetcher])

  return { data, loading, saving, error, refresh, save }
}

export function useLearnerProfile(): ResourceState<LearnerProfile, LearnerProfileInput> {
  return useLearnerResource(getLearnerProfile, upsertLearnerProfile)
}

export function useLearnerState(): ResourceState<LearnerState, LearnerStateInput> {
  return useLearnerResource(getLearnerState, upsertLearnerState)
}

export function useMentorMemory(): ResourceState<MentorMemory, MentorMemoryInput> {
  return useLearnerResource(getMentorMemory, upsertMentorMemory)
}
