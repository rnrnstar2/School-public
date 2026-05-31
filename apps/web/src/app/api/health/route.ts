import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_MONITOR } from '@/lib/api/guard'
import { cachedJsonResponse, jsonResponse } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health
 * Lightweight health check: verifies the app is running and Supabase is reachable.
 */
export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'health', RL_MONITOR)
  if (rlResponse) return rlResponse

  const start = Date.now()
  const checks: Record<string, 'ok' | 'fail'> = { app: 'ok', supabase: 'fail' }

  try {
    const supabase = await createClient()
    const { error } = await supabase.from('lesson_atoms' as never).select('atom_id').limit(1)
    checks.supabase = error ? 'fail' : 'ok'
  } catch {
    checks.supabase = 'fail'
  }

  const allOk = Object.values(checks).every((v) => v === 'ok')
  const latency = Date.now() - start

  const payload = { status: allOk ? 'healthy' : 'degraded', checks, latency_ms: latency }

  if (!allOk) {
    return jsonResponse(payload, { status: 503 }, request)
  }

  return cachedJsonResponse(payload, { maxAge: 10, swr: 30 }, request)
}
