import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_READ } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'

/**
 * GET /api/certificate/[id] — Verify a certificate by its unique ID.
 * Public endpoint (no auth required) for third-party verification.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'certificate-verify', RL_READ)
  if (rlResponse) return rlResponse

  const { id } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return jsonResponse(
      { error: '無効な証明書IDです。', valid: false },
      { status: 400 },
      request,
    )
  }

  const supabase = await createClient()
  const { data: cert, error } = await supabase
    .from('certificates')
    .select('id, learner_name, goal_summary, plan_title, track_id, completed_at, milestone_count, criteria_count, criteria_labels, artifact_urls, ai_tools_used, created_at')
    .eq('id', id)
    .single()

  if (error || !cert) {
    return jsonResponse(
      { error: '証明書が見つかりません。', valid: false },
      { status: 404 },
      request,
    )
  }

  return jsonResponse(
    {
      valid: true,
      certificate: cert,
    },
    {},
    request,
  )
}
