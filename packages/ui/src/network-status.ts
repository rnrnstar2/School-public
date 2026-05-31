'use client'

import { useCallback, useRef, useState, useSyncExternalStore } from 'react'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot() {
  return navigator.onLine
}

function getServerSnapshot() {
  return true
}

/**
 * Returns `true` when the browser reports being online.
 * Falls back to `true` on the server.
 */
export function useNetworkStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return { online }
}

/**
 * Classifies a caught error into a user-friendly category.
 */
export type AiErrorKind = 'network' | 'timeout' | 'server' | 'unknown'

const RETRYABLE_KINDS = new Set<AiErrorKind>(['network', 'timeout', 'server'])

export function classifyError(error: unknown): AiErrorKind {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    return 'network'
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'timeout'
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('net::')) {
      return 'network'
    }
    if (msg.includes('timeout') || msg.includes('abort')) {
      return 'timeout'
    }
    if (msg.includes('status 5') || msg.includes('502') || msg.includes('503') || msg.includes('504')) {
      return 'server'
    }
  }
  return 'unknown'
}

const errorKindMessages: Record<AiErrorKind, string> = {
  network: 'ネットワーク接続を確認してください。オフラインの可能性があります。',
  timeout: 'AI の応答がタイムアウトしました。しばらくしてからもう一度お試しください。',
  server: 'AI サーバーが一時的に利用できません。しばらくしてからもう一度お試しください。',
  unknown: 'エラーが発生しました。もう一度お試しください。',
}

export function getErrorMessage(kind: AiErrorKind): string {
  return errorKindMessages[kind]
}

const MAX_AUTO_RETRIES = 3
const INITIAL_DELAY_MS = 1000
const BACKOFF_MULTIPLIER = 2

export interface RetryableActionState {
  errorKind: AiErrorKind | null
  retryCount: number
  /** True while an automatic retry delay is counting down */
  isRetrying: boolean
  /** Seconds remaining until the next automatic retry (0 when not retrying) */
  retryCountdownSec: number
  /** True when all automatic retries have been exhausted */
  retriesExhausted: boolean
  wrapAction: <T>(action: () => Promise<T>) => Promise<T | null>
  clearError: () => void
}

/**
 * Wraps an async action with automatic exponential backoff retry.
 * On retryable errors (network/timeout/server), automatically retries up to 3 times
 * with delays of 1s → 2s → 4s. Shows countdown during retry wait.
 * After all retries are exhausted, sets retriesExhausted = true for manual retry UI.
 */
export function useRetryableAction(): RetryableActionState {
  const [errorKind, setErrorKind] = useState<AiErrorKind | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCountdownSec, setRetryCountdownSec] = useState(0)
  const [retriesExhausted, setRetriesExhausted] = useState(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
  }, [])

  const clearError = useCallback(() => {
    setErrorKind(null)
    setRetryCount(0)
    setIsRetrying(false)
    setRetryCountdownSec(0)
    setRetriesExhausted(false)
    clearCountdown()
  }, [clearCountdown])

  const wrapAction = useCallback(async <T>(action: () => Promise<T>): Promise<T | null> => {
    setErrorKind(null)
    setRetriesExhausted(false)
    clearCountdown()

    let attempt = 0

    while (attempt <= MAX_AUTO_RETRIES) {
      try {
        if (attempt === 0) {
          setIsRetrying(false)
          setRetryCountdownSec(0)
        }

        const result = await action()
        setRetryCount(0)
        setIsRetrying(false)
        setRetryCountdownSec(0)
        return result
      } catch (err) {
        const kind = classifyError(err)
        setErrorKind(kind)

        attempt++
        setRetryCount(attempt)

        if (attempt <= MAX_AUTO_RETRIES && RETRYABLE_KINDS.has(kind)) {
          const delayMs = INITIAL_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1)
          setIsRetrying(true)

          // Start countdown
          const totalSec = Math.ceil(delayMs / 1000)
          setRetryCountdownSec(totalSec)

          await new Promise<void>((resolve) => {
            let remaining = totalSec
            countdownRef.current = setInterval(() => {
              remaining--
              setRetryCountdownSec(Math.max(0, remaining))
              if (remaining <= 0) {
                clearCountdown()
                resolve()
              }
            }, 1000)
          })

          continue
        }

        // Non-retryable error or max retries reached
        setIsRetrying(false)
        setRetryCountdownSec(0)
        if (attempt > MAX_AUTO_RETRIES) {
          setRetriesExhausted(true)
        }
        return null
      }
    }

    return null
  }, [clearCountdown])

  return { errorKind, retryCount, isRetrying, retryCountdownSec, retriesExhausted, wrapAction, clearError }
}
