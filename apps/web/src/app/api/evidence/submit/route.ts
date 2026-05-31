import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_WRITE, validateBody } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { evidenceSubmitSchema } from '@/lib/api/schemas'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { resolveLessonIdentityId } from '@/lib/supabase/lesson-catalog'
import { emitTelemetryEvent } from '@/lib/telemetry'

function isRelationNotReady(error: unknown) {
  const pgError = error as { code?: string; message?: string }
  return pgError.code === '42P01' || pgError.message?.includes('relation')
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'evidence:submit', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, evidenceSubmitSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const lessonResult = await resolveLessonIdentityId({
    client: supabase,
    lessonIdOrSlug: body.lessonSlug,
  })

  if (lessonResult.error || !lessonResult.data) {
    return jsonResponse(
      { error: 'lesson_not_found', message: 'lessonSlug に対応する lesson が見つかりません。' },
      { status: 404 },
      request,
    )
  }

  try {
    const { data, error } = await supabase
      .from('evidence_submissions' as never)
      .insert({
        user_id: user.id,
        lesson_id: lessonResult.data,
        plan_node_id: body.planNodeId || null,
        type: body.type,
        content: body.content,
        metadata: body.metadata ?? null,
      } as never)
      .select('id, lesson_id, plan_node_id, type, content, metadata, submitted_at')
      .single()

    if (error) {
      if (isRelationNotReady(error)) {
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
        { error: 'evidence_submit_failed', message: 'エビデンスの保存に失敗しました。' },
        { status: 500 },
        request,
      )
    }

    const activeCompiledPlan = await getLatestActiveCompiledPlan({
      userId: user.id,
      client: supabase,
    })

    await emitTelemetryEvent({
      userId: user.id,
      eventName: 'artifact_submitted',
      planId: activeCompiledPlan?.planId ?? null,
      requestId: getRequestId(request),
      properties: {
        lesson_id: lessonResult.data,
        lesson_slug: body.lessonSlug,
        plan_node_id: body.planNodeId || null,
        evidence_type: body.type,
        source: 'evidence_submit',
      },
    })

    return jsonResponse({ submission: data }, {}, request)
  } catch {
    return jsonResponse(
      { error: 'evidence_submit_failed', message: 'エビデンスの保存に失敗しました。' },
      { status: 500 },
      request,
    )
  }
}
