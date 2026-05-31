import * as Sentry from '@sentry/nextjs'

export type AiOperation =
  | 'ai.hearing'
  | 'ai.plan-review'
  | 'ai.lesson-chat'
  | 'ai.mentor-chat'
  | 'ai.recommendation'
  | 'ai.context-bridge'
  | 'ai.atom-plan-compile'
  | 'ai.delegation-brief'
  | 'ai.ask2action'

interface AiCallOptions {
  operation: AiOperation
  requestId?: string | null
}

/**
 * Wrap an AI call with Sentry span + custom metrics for latency and success/failure.
 * Reports:
 *   - ai.latency (distribution, ms) per operation
 *   - ai.call.success / ai.call.failure (counter) per operation
 *   - Sentry span with operation name and request ID
 */
export async function withAiMetrics<T>(
  options: AiCallOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const { operation, requestId } = options
  const start = Date.now()

  return Sentry.startSpan(
    {
      name: operation,
      op: 'ai.call',
      attributes: { 'request.id': requestId ?? 'unknown' },
    },
    async (span) => {
      try {
        const result = await fn()
        const durationMs = Date.now() - start

        Sentry.metrics.distribution('ai.latency', durationMs, {
          unit: 'millisecond',
          attributes: { operation },
        })
        Sentry.metrics.count('ai.call.success', 1, { attributes: { operation } })

        span.setStatus({ code: 1 }) // OK
        return result
      } catch (error) {
        const durationMs = Date.now() - start

        Sentry.metrics.distribution('ai.latency', durationMs, {
          unit: 'millisecond',
          attributes: { operation },
        })
        Sentry.metrics.count('ai.call.failure', 1, { attributes: { operation } })

        span.setStatus({
          code: 2,
          message: error instanceof Error ? error.message : 'unknown',
        })

        Sentry.captureException(error, {
          tags: { operation, request_id: requestId ?? 'unknown' },
        })

        throw error
      }
    },
  )
}
