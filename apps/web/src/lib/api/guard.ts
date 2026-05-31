import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { checkRateLimit, rateLimitKey, type RateLimitConfig } from './rate-limit'
import { getRequestId } from './response'

// ── Rate-limit presets ─────────────────────────────────────────────
/** AI-heavy endpoints (chat, hearing, recommendation, etc.) */
export const RL_AI: RateLimitConfig = { limit: 10, windowMs: 60_000 }
/** CRUD / mutation endpoints */
export const RL_WRITE: RateLimitConfig = { limit: 30, windowMs: 60_000 }
/** Read-only endpoints */
export const RL_READ: RateLimitConfig = { limit: 30, windowMs: 60_000 }
/** Monitoring endpoints (health, vitals) */
export const RL_MONITOR: RateLimitConfig = { limit: 60, windowMs: 60_000 }

// ── Rate-limit guard ───────────────────────────────────────────────

/**
 * Check rate limit for the given request. Returns a 429 response if exceeded,
 * or `null` if the request is allowed.
 */
export async function applyRateLimit(
  request: Request,
  prefix: string,
  config: RateLimitConfig,
  userId?: string,
): Promise<NextResponse | null> {
  const key = rateLimitKey(request, prefix, userId)
  const result = await checkRateLimit(key, config, prefix)

  if (!result.allowed) {
    const requestId = getRequestId(request)
    const headers: Record<string, string> = {
      'Retry-After': String(Math.ceil(result.resetMs / 1000)),
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': '0',
    }
    if (requestId) headers['X-Request-Id'] = requestId
    return NextResponse.json(
      { error: 'rate_limit_exceeded', message: 'リクエストが多すぎます。しばらく待ってから再試行してください。' },
      { status: 429, headers },
    )
  }

  return null
}

// ── Body validation guard ──────────────────────────────────────────

/** Max request body size: 100 KB (raw JSON). */
const MAX_BODY_SIZE = 100 * 1024

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the parsed data on success, or a 400 NextResponse on failure.
 */
export async function validateBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  const requestId = getRequestId(request)
  const ridHeaders = requestId ? { 'X-Request-Id': requestId } : undefined

  // Size guard
  const contentLength = request.headers.get('content-length')
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return {
      error: NextResponse.json(
        { error: 'payload_too_large', message: 'リクエストボディが大きすぎます。' },
        { status: 400, headers: ridHeaders },
      ),
    }
  }

  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_SIZE) {
      return {
        error: NextResponse.json(
          { error: 'payload_too_large', message: 'リクエストボディが大きすぎます。' },
          { status: 400, headers: ridHeaders },
        ),
      }
    }
    raw = JSON.parse(text)
  } catch {
    return {
      error: NextResponse.json(
        { error: 'invalid_json', message: 'リクエストボディが不正な JSON です。' },
        { status: 400, headers: ridHeaders },
      ),
    }
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    return {
      error: NextResponse.json(
        {
          error: 'validation_error',
          message: 'リクエストの入力値が不正です。',
          details: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400, headers: ridHeaders },
      ),
    }
  }

  return { data: result.data as z.infer<T> }
}
