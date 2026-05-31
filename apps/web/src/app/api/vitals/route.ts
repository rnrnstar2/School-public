import { applyRateLimit, RL_MONITOR, validateBody } from '@/lib/api/guard'
import { vitalsSchema } from '@/lib/api/schemas'
import { jsonResponse } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vitals
 * Receives Core Web Vitals data from the client via navigator.sendBeacon.
 * Currently logs to stdout (picked up by Vercel's log drain / monitoring).
 * Can be extended to forward to an analytics service.
 */
export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'vitals', RL_MONITOR)
  if (rlResponse) return rlResponse

  try {
    const parsed = await validateBody(request, vitalsSchema)
    if ('error' in parsed) return parsed.error
    const body = parsed.data
    const { name, value, rating } = body

    // Log structured data for Vercel log drain / external monitoring
    console.log(
      JSON.stringify({
        type: 'web-vital',
        metric: name,
        value: Math.round(value * 100) / 100,
        rating,
        timestamp: new Date().toISOString(),
      }),
    )

    return jsonResponse({ ok: true }, { status: 200 }, request)
  } catch {
    return jsonResponse({ ok: false }, { status: 400 }, request)
  }
}
