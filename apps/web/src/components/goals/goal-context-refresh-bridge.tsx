'use client'

import { startTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function GoalContextRefreshBridge({ goalId }: { goalId: string }) {
  const router = useRouter()

  useEffect(() => {
    const onGoalContextUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ goalId?: string }>).detail
      if (detail?.goalId !== goalId) {
        return
      }

      startTransition(() => {
        router.refresh()
      })
    }

    window.addEventListener('goal-context-updated', onGoalContextUpdated)
    return () => {
      window.removeEventListener('goal-context-updated', onGoalContextUpdated)
    }
  }, [goalId, router])

  return null
}
