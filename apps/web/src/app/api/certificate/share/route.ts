import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'

/**
 * POST /api/certificate/share — Mark a certificate as publicly shared (opt-in).
 * Body: { certificate_id: string }
 * Only the certificate owner can share it.
 */
export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'certificate-share', RL_WRITE)
  if (rlResponse) return rlResponse

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  let body: { certificate_id?: string }
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: '不正なリクエストです。' }, { status: 400 }, request)
  }

  const certificateId = body.certificate_id
  if (!certificateId || typeof certificateId !== 'string') {
    return jsonResponse({ error: 'certificate_id が必要です。' }, { status: 400 }, request)
  }

  // Verify ownership
  const { data: cert } = await supabase
    .from('certificates')
    .select('id, user_id, shared_at')
    .eq('id', certificateId)
    .single()

  if (!cert) {
    return jsonResponse({ error: '証明書が見つかりません。' }, { status: 404 }, request)
  }

  if (cert.user_id !== user.id) {
    return jsonResponse({ error: '権限がありません。' }, { status: 403 }, request)
  }

  // Already shared
  if (cert.shared_at) {
    return jsonResponse({ shared: true, shared_at: cert.shared_at }, {}, request)
  }

  // Mark as shared
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('certificates')
    .update({ shared_at: now })
    .eq('id', certificateId)

  if (error) {
    return jsonResponse({ error: '共有に失敗しました。' }, { status: 500 }, request)
  }

  return jsonResponse({ shared: true, shared_at: now }, {}, request)
}
