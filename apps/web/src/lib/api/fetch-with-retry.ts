import * as Sentry from '@sentry/nextjs'

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelayMs?: number
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number
  /** Operation label for Sentry metrics */
  operation?: string
}

const RETRYABLE_STATUS_CODES = new Set([429, 503, 502, 504])

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true
  }
  if (error instanceof TypeError) {
    const msg = error.message.toLowerCase()
    if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to fetch')) {
      return true
    }
  }
  return false
}

/**
 * Wraps a fetch call with exponential backoff retry logic.
 * Retries on 429, 503, 502, 504 status codes and network/timeout errors.
 * Records retry metrics to Sentry.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RetryOptions,
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? 3
  const initialDelayMs = options?.initialDelayMs ?? 1000
  const backoffMultiplier = options?.backoffMultiplier ?? 2
  const operation = options?.operation ?? 'unknown'

  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init)

      if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status)) {
        if (attempt > 0) {
          Sentry.metrics.count('ai.retry.recovered', 1, {
            attributes: { operation, attempt: String(attempt) },
          })
        }
        return response
      }

      // Retryable HTTP status
      const retryAfterHeader = response.headers.get('Retry-After')
      const retryAfterMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1000 : null

      lastError = new Error(
        `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      )

      if (attempt < maxRetries) {
        const delayMs = retryAfterMs ?? initialDelayMs * Math.pow(backoffMultiplier, attempt)

        Sentry.metrics.count('ai.retry.attempt', 1, {
          attributes: {
            operation,
            attempt: String(attempt + 1),
            reason: `http_${response.status}`,
          },
        })

        await sleep(delayMs)
        continue
      }
    } catch (error) {
      lastError = error

      if (attempt < maxRetries && isRetryableError(error)) {
        const delayMs = initialDelayMs * Math.pow(backoffMultiplier, attempt)

        Sentry.metrics.count('ai.retry.attempt', 1, {
          attributes: {
            operation,
            attempt: String(attempt + 1),
            reason: error instanceof DOMException ? 'timeout' : 'network',
          },
        })

        await sleep(delayMs)
        continue
      }

      // Non-retryable error or max retries exhausted
      break
    }
  }

  // All retries exhausted
  Sentry.metrics.count('ai.retry.exhausted', 1, {
    attributes: {
      operation,
      total_attempts: String(maxRetries + 1),
      reason: lastError instanceof Error ? lastError.message.slice(0, 100) : 'unknown',
    },
  })

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
