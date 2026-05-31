import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'learner-capabilities', RL_READ)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const { data: capabilityStateRows, error: capabilityStateError } = await supabase
    .from('capability_state_vw')
    .select('capability_id, latest_score, latest_assessed_at')
    .eq('user_id', user.id)
    .order('latest_assessed_at', { ascending: false })

  if (capabilityStateError) {
    return jsonResponse({ error: '能力状態の取得に失敗しました。' }, { status: 500 }, request)
  }

  const capabilityStateEntries = capabilityStateRows ?? []

  const capabilityIds = Array.from(new Set(
    capabilityStateEntries
      .map((row) => row.capability_id)
      .filter((capabilityId): capabilityId is string => Boolean(capabilityId)),
  ))

  if (capabilityIds.length === 0) {
    return jsonResponse({ capabilities: [] }, { headers: { 'Cache-Control': 'no-store' } }, request)
  }

  const { data: capabilityRows, error: capabilityError } = await supabase
    .from('capabilities')
    .select('id, slug, label')
    .in('id', capabilityIds)

  if (capabilityError) {
    return jsonResponse({ error: '能力ラベルの取得に失敗しました。' }, { status: 500 }, request)
  }

  const capabilityById = new Map(
    (capabilityRows ?? [])
      .filter((row) => typeof row.slug === 'string' && row.slug.trim().length > 0)
      .map((row) => [row.id, { slug: row.slug.trim(), label: row.label?.trim() ?? row.slug.trim() }]),
  )

  const capabilities = capabilityStateEntries.flatMap((row) => {
    if (!row.capability_id) return []
    const capability = capabilityById.get(row.capability_id)
    if (!capability) return []

    return [{
      capability_slug: capability.slug,
      label: capability.label,
      latest_score: row.latest_score ?? 0,
      latest_assessed_at: row.latest_assessed_at ?? null,
    }]
  })

  return jsonResponse(
    { capabilities },
    { headers: { 'Cache-Control': 'no-store' } },
    request,
  )
}
