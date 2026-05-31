/**
 * Distributed rate limiter backed by Upstash Redis.
 *
 * In production (Vercel Serverless), each invocation may run in a different
 * isolate, so an in-memory store is useless. @upstash/ratelimit stores
 * counters in Redis, making limits work across all instances.
 *
 * When UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set
 * (local dev), falls back to an in-memory sliding-window limiter so
 * `npm run dev` works without external services.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ── Types ────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  /** Max requests allowed in the window */
  limit: number
  /** Window size in milliseconds (default: 60 000 = 1 min) */
  windowMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetMs: number
}

// ── Upstash Redis singleton ──────────────────────────────────────────

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

// Cache Ratelimit instances per prefix+config to avoid re-creation
const limiterCache = new Map<string, Ratelimit>()

function getUpstashLimiter(prefix: string, config: RateLimitConfig): Ratelimit | null {
  const redis = getRedis()
  if (!redis) return null

  const windowMs = config.windowMs ?? 60_000
  const cacheKey = `${prefix}:${config.limit}:${windowMs}`

  let limiter = limiterCache.get(cacheKey)
  if (!limiter) {
    const windowSec = Math.max(1, Math.ceil(windowMs / 1000))
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.limit, `${windowSec} s`),
      prefix: `ratelimit:${prefix}`,
      analytics: false,
    })
    limiterCache.set(cacheKey, limiter)
  }
  return limiter
}

// ── In-memory fallback (local dev only) ──────────────────────────────

interface SlidingWindowEntry {
  timestamps: number[]
}

const memStore = new Map<string, SlidingWindowEntry>()

const CLEANUP_INTERVAL_MS = 60_000
let cleanupScheduled = false

function scheduleCleanup(windowMs: number) {
  if (cleanupScheduled) return
  cleanupScheduled = true
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of memStore) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)
      if (entry.timestamps.length === 0) memStore.delete(key)
    }
  }, CLEANUP_INTERVAL_MS).unref?.()
}

function checkRateLimitInMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const windowMs = config.windowMs ?? 60_000
  const now = Date.now()

  scheduleCleanup(windowMs)

  let entry = memStore.get(key)
  if (!entry) {
    entry = { timestamps: [] }
    memStore.set(key, entry)
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs)

  if (entry.timestamps.length >= config.limit) {
    const oldest = entry.timestamps[0]!
    return {
      allowed: false,
      limit: config.limit,
      remaining: 0,
      resetMs: oldest + windowMs - now,
    }
  }

  entry.timestamps.push(now)
  return {
    allowed: true,
    limit: config.limit,
    remaining: config.limit - entry.timestamps.length,
    resetMs: windowMs,
  }
}

// ── Public API ───────────────────────────────────────────────────────

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  prefix: string = 'global',
): Promise<RateLimitResult> {
  const upstash = getUpstashLimiter(prefix, config)

  if (upstash) {
    const { success, limit, remaining, reset } = await upstash.limit(key)
    return {
      allowed: success,
      limit,
      remaining,
      resetMs: Math.max(0, reset - Date.now()),
    }
  }

  // Fallback: in-memory (local dev)
  return checkRateLimitInMemory(key, config)
}

/** Build a rate-limit key from the request (IP-based, optionally user-scoped). */
export function rateLimitKey(request: Request, prefix: string, userId?: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`
}
