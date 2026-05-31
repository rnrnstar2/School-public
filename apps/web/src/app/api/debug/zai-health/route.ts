import { requireAdminRouteUser } from '@/app/api/admin/atom-versions/_server'
import { applyRateLimit, RL_MONITOR } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { probeZaiHearingHealth } from '@/lib/planner/live-hearing-service'

export const dynamic = 'force-dynamic'

function isDebugZaiHealthEnabled() {
  return process.env.DEBUG_ZAI_HEALTH?.trim() === '1'
}

function parseBooleanSearchParam(value: string | null) {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export async function GET(request: Request) {
  const requestId = getRequestId(request)
  const rlResponse = await applyRateLimit(request, 'debug-zai-health', RL_MONITOR)

  if (rlResponse) {
    return rlResponse
  }

  const debugEnabled = isDebugZaiHealthEnabled()
  const adminUser = debugEnabled ? null : await requireAdminRouteUser()

  if (!debugEnabled && !adminUser) {
    return jsonResponse(
      {
        error: 'forbidden',
        message: 'Admin role or DEBUG_ZAI_HEALTH=1 is required.',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
      request,
    )
  }

  const searchParams = new URL(request.url).searchParams
  const responseFormat = searchParams.get('response_format') === 'text' ? 'text' : 'json_object'
  const stream = parseBooleanSearchParam(searchParams.get('stream'))
  const result = await probeZaiHearingHealth({
    responseFormat,
    stream,
  })

  return jsonResponse(
    {
      ok: result.ok,
      requestId,
      zaiRequestId: result.zaiRequestId ?? null,
      available: result.available,
      status: result.status ?? (result.ok ? 200 : 503),
      latencyMs: result.latencyMs ?? null,
      bodySnippet: result.bodySnippet ?? result.rawTextSnippet ?? '',
      model: result.model ?? null,
      responseFormat: result.responseFormat,
      stream: result.stream,
      parsed: result.parsed ?? false,
      error: result.error ?? null,
    },
    {
      status: result.ok ? 200 : result.available ? 502 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    request,
  )
}
