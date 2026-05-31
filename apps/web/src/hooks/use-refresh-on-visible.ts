'use client'

import { useEffect, useRef } from 'react'

export interface UseRefreshOnVisibleOptions {
  /**
   * Minimum interval (ms) between successive invocations. Rapid visibility
   * changes within this window are ignored to prevent duplicate refetches
   * when the browser toggles visibility multiple times (e.g. alt-tab spam).
   *
   * Default: 1000ms.
   */
  minIntervalMs?: number
  /**
   * When false, the listener is not attached. Useful for pausing refresh
   * during mid-edit form flows without unmounting the consuming component.
   *
   * Default: true.
   */
  enabled?: boolean
}

/**
 * Runs `callback` when the document transitions from hidden to visible.
 *
 * - Does NOT fire on mount — only on an actual hidden→visible transition.
 * - Debounces rapid fire events via `minIntervalMs` (default 1000ms).
 * - Honors `enabled` so consumers can suspend refresh behaviour without
 *   unmounting (e.g. while editing a form).
 * - Uses a ref for the latest callback so passing inline arrow functions
 *   does not re-subscribe the document listener on every render.
 *
 * Consolidates the ad-hoc `visibilitychange` listeners that individual
 * screens used to install (`plan/goal-first`, `mentor-workspace`, etc.).
 */
export function useRefreshOnVisible(
  callback: () => void | Promise<void>,
  options?: UseRefreshOnVisibleOptions,
): void {
  const { minIntervalMs = 1000, enabled = true } = options ?? {}

  const callbackRef = useRef(callback)
  const lastFiredAtRef = useRef<number>(0)

  // Keep the ref pointed at the latest callback without re-subscribing.
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return
      }

      const now = Date.now()
      if (now - lastFiredAtRef.current < minIntervalMs) {
        return
      }
      lastFiredAtRef.current = now

      try {
        const result = callbackRef.current()
        if (result && typeof (result as Promise<void>).then === 'function') {
          void (result as Promise<void>).catch(() => {
            // Swallow — consumers are expected to handle their own errors.
          })
        }
      } catch {
        // Swallow — consumers are expected to handle their own errors.
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, minIntervalMs])
}
