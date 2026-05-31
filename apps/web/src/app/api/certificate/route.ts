import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { certificateIssueSchema } from '@/lib/api/schemas'
import { captureServerEvent } from '@/lib/analytics/server'

type CertificateRow = Database['public']['Tables']['certificates']['Row']

/**
 * POST /api/certificate — Issue a new graduation certificate.
 * Returns the certificate row including its unique ID.
 */
export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'certificate', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, certificateIssueSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  // Fetch learner display name
  const { data: profile } = await supabase
    .from('learner_profile')
    .select('display_name')
    .eq('user_id', user.id)
    .single()

  const { data: cert, error } = await supabase
    .from('certificates')
    .insert({
      user_id: user.id,
      plan_id: body.plan_id,
      track_id: body.track_id ?? null,
      learner_name: profile?.display_name ?? null,
      goal_summary: body.goal_summary,
      plan_title: body.plan_title ?? null,
      completed_at: body.completed_at,
      milestone_count: body.milestone_count,
      criteria_count: body.criteria_labels.length,
      criteria_labels: body.criteria_labels,
      artifact_urls: body.artifact_urls,
      ai_tools_used: body.ai_tools_used,
    })
    .select()
    .single()

  if (error || !cert) {
    return jsonResponse(
      { error: '証明書の発行に失敗しました。', detail: error?.message },
      { status: 500 },
      request,
    )
  }

  const certRow: CertificateRow = cert

  captureServerEvent({
    event: 'certificate_issued',
    distinctId: user.id,
    properties: {
      certificate_id: certRow.id,
      plan_id: body.plan_id,
      track_id: body.track_id ?? null,
    },
  })

  return jsonResponse({ certificate: certRow }, { status: 201 }, request)
}
