import { z } from 'zod/v4'
import { createClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/lib/supabase/database.types'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { jsonResponse } from '@/lib/api/response'
import { resolveLessonIdentityId } from '@/lib/supabase/lesson-catalog'

// ── Validation schemas ────────────────────────────────────────────

const trimmedString = (max = 2000) => z.string().max(max).transform((s) => s.trim())

const evidenceSubmissionInputSchema = z.object({
  lesson_id: trimmedString(),
  content: trimmedString(10_000),
  content_type: z.enum(['text', 'url', 'file_ref']).default('text'),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

type EvidenceSubmissionRow = Database['public']['Tables']['evidence_submissions']['Row']
type EvidenceSubmissionInsert = Database['public']['Tables']['evidence_submissions']['Insert']

// Map the request `content_type` (text|url|file_ref) onto the canonical
// `evidence_submissions.type` enum.
function mapContentTypeToEvidenceType(
  contentType: 'text' | 'url' | 'file_ref',
): EvidenceSubmissionInsert['type'] {
  if (contentType === 'url') return 'url'
  if (contentType === 'file_ref') return 'artifact_metadata'
  return 'text'
}

// ── POST: submit evidence ─────────────────────────────────────────

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'evidence:post', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, evidenceSubmissionInputSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const resolvedLessonIdResult = await resolveLessonIdentityId({
    client: supabase,
    lessonIdOrSlug: body.lesson_id,
  })
  if (resolvedLessonIdResult.error) {
    return jsonResponse(
      { error: 'レッスン情報の解決に失敗しました。' },
      { status: 500 },
      request,
    )
  }
  if (!resolvedLessonIdResult.data) {
    return jsonResponse(
      { error: 'lesson_not_found', message: '指定されたレッスンが見つかりません。' },
      { status: 404 },
      request,
    )
  }
  const canonicalLessonId = resolvedLessonIdResult.data

  // Try to insert — graceful fallback if table doesn't exist.
  try {
    const insertPayload: EvidenceSubmissionInsert = {
      user_id: user.id,
      lesson_id: canonicalLessonId,
      content: body.content,
      type: mapContentTypeToEvidenceType(body.content_type),
      metadata: (body.metadata ?? null) as Json | null,
    }

    const { data, error } = await supabase
      .from('evidence_submissions')
      .insert(insertPayload)
      .select('id, submitted_at')
      .single()

    if (error) {
      // Table may not exist yet — check for relation-not-found error
      if (error.code === '42P01' || error.message?.includes('relation')) {
        return jsonResponse(
          {
            error: 'table_not_ready',
            message: 'evidence_submissions テーブルがまだ作成されていません。マイグレーションを適用してください。',
          },
          { status: 503 },
          request,
        )
      }

      return jsonResponse(
        { error: 'エビデンスの保存に失敗しました。' },
        { status: 500 },
        request,
      )
    }

    return jsonResponse(
      {
        submission: {
          id: data?.id ?? null,
          created_at: data?.submitted_at ?? null,
        },
      },
      {},
      request,
    )
  } catch {
    return jsonResponse(
      { error: 'エビデンスの保存に失敗しました。' },
      { status: 500 },
      request,
    )
  }
}

// ── GET: list evidence for a lesson ───────────────────────────────

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'evidence:get', RL_READ)
  if (rlResponse) return rlResponse

  const { searchParams } = new URL(request.url)
  const lessonId = searchParams.get('lessonId')?.trim()

  if (!lessonId) {
    return jsonResponse(
      { error: 'lessonId クエリパラメータは必須です。' },
      { status: 400 },
      request,
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const resolvedLessonIdResult = await resolveLessonIdentityId({
    client: supabase,
    lessonIdOrSlug: lessonId,
  })
  if (resolvedLessonIdResult.error) {
    return jsonResponse(
      { error: 'レッスン情報の解決に失敗しました。' },
      { status: 500 },
      request,
    )
  }
  if (!resolvedLessonIdResult.data) {
    return jsonResponse(
      { error: 'lesson_not_found', message: '指定されたレッスンが見つかりません。' },
      { status: 404 },
      request,
    )
  }
  const canonicalLessonId = resolvedLessonIdResult.data

  try {
    const { data, error } = await supabase
      .from('evidence_submissions')
      .select('id, lesson_id, content, type, metadata, submitted_at')
      .eq('user_id', user.id)
      .eq('lesson_id', canonicalLessonId)
      .order('submitted_at', { ascending: false })

    if (error) {
      // Table may not exist yet
      if (error.code === '42P01' || error.message?.includes('relation')) {
        return jsonResponse({ submissions: [] }, {}, request)
      }

      return jsonResponse(
        { error: 'エビデンスの取得に失敗しました。' },
        { status: 500 },
        request,
      )
    }

    const rows: Array<Pick<EvidenceSubmissionRow, 'id' | 'lesson_id' | 'content' | 'type' | 'metadata' | 'submitted_at'>> = data ?? []
    return jsonResponse({ submissions: rows }, {}, request)
  } catch {
    return jsonResponse(
      { error: 'エビデンスの取得に失敗しました。' },
      { status: 500 },
      request,
    )
  }
}
