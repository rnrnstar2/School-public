import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { evidenceAssessSchema } from '@/lib/api/schemas'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { getPublishedLessonSnapshotBySlug } from '@/lib/supabase/lesson-catalog'
import {
  assessEvidenceAgainstCapability,
  extractLessonRubrics,
  resolveCapabilityForEvidenceAssessment,
} from '@/lib/evidence/assessment'
import { emitTelemetryEvent } from '@/lib/telemetry'

function isRelationNotReady(error: unknown) {
  const pgError = error as { code?: string; message?: string }
  return pgError.code === '42P01' || pgError.message?.includes('relation')
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'evidence:assess', RL_AI)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, evidenceAssessSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const evidenceResult = await supabase
    .from('evidence_submissions' as never)
    .select('id, lesson_id, plan_node_id, type, content, metadata, submitted_at')
    .eq('user_id', user.id)
    .eq('id', body.evidenceId)
    .maybeSingle()

  if (evidenceResult.error) {
    if (isRelationNotReady(evidenceResult.error)) {
      return jsonResponse(
        {
          assessment: null,
          persisted: false,
          error: 'table_not_ready',
          message: 'evidence_submissions テーブルがまだ作成されていません。マイグレーションを適用してください。',
        },
        { status: 503 },
        request,
      )
    }

    return jsonResponse(
      { error: 'evidence_lookup_failed', message: 'エビデンスの取得に失敗しました。' },
      { status: 500 },
      request,
    )
  }

  if (!evidenceResult.data) {
    return jsonResponse(
      { error: 'evidence_not_found', message: 'evidenceId に対応するエビデンスが見つかりません。' },
      { status: 404 },
      request,
    )
  }

  const evidence = evidenceResult.data as {
    id: string
    lesson_id: string
    plan_node_id: string | null
    type: string
    content: string
    metadata: Record<string, unknown> | null
    submitted_at: string
  }

  const capabilityResult = await resolveCapabilityForEvidenceAssessment({
    client: supabase as never,
    userId: user.id,
    evidence,
    capabilitySlug: body.capabilitySlug,
    capabilityDomainId: body.capabilityDomainId,
    capabilityDomainSlug: body.capabilityDomainSlug,
  })

  if (!capabilityResult.ok) {
    return jsonResponse(
      {
        assessment: null,
        persisted: false,
        error: capabilityResult.error.code,
        message: capabilityResult.error.message,
        domain: capabilityResult.error.domain ?? null,
        details: capabilityResult.error.details ?? null,
      },
      { status: capabilityResult.error.status },
      request,
    )
  }

  const lessonSnapshotResult = await getPublishedLessonSnapshotBySlug({
    client: supabase,
    slug: evidence.lesson_id,
  })

  const lessonRubrics = extractLessonRubrics(
    (lessonSnapshotResult.data?.blocks ?? []).map((block) => ({
      type: block.type,
      content: (block.content as Record<string, unknown> | null) ?? null,
    })),
  )

  const assessment = await assessEvidenceAgainstCapability({
    capability: capabilityResult.capability,
    evidence: {
      id: evidence.id,
      type: evidence.type,
      content: evidence.content,
      metadata: evidence.metadata,
    },
    lessonRubrics,
  })

  const assessmentInsert = {
    user_id: user.id,
    capability_id: capabilityResult.capability.id,
    evidence_ids: [evidence.id],
    score: assessment.score,
    rubric_results: assessment.rubricResults,
    assessed_by: assessment.assessedBy,
  }

  try {
    const { data, error } = await supabase
      .from('competency_assessments' as never)
      .insert(assessmentInsert as never)
      .select('id, capability_id, evidence_ids, score, rubric_results, assessed_by, assessed_at')
      .single()

    if (error) {
      return jsonResponse(
        {
          assessment: {
            ...assessmentInsert,
            id: null,
            assessed_at: new Date().toISOString(),
            score_pending: assessment.scorePending,
          },
          persisted: false,
          error: isRelationNotReady(error) ? 'table_not_ready' : 'assessment_insert_failed',
        },
        {},
        request,
      )
    }

    if (!assessment.scorePending && assessment.score >= 70) {
      const activeCompiledPlan = await getLatestActiveCompiledPlan({
        userId: user.id,
        client: supabase,
      })

      await emitTelemetryEvent({
        userId: user.id,
        eventName: 'evidence_passed',
        planId: activeCompiledPlan?.planId ?? null,
        requestId: getRequestId(request),
        properties: {
          evidence_id: evidence.id,
          lesson_id: evidence.lesson_id,
          plan_node_id: evidence.plan_node_id,
          capability_id: capabilityResult.capability.id,
          capability_slug: capabilityResult.capability.slug,
          score: assessment.score,
          source: 'evidence_assess',
        },
      })
    }

    return jsonResponse(
      {
        assessment: {
          ...(data as object),
          score_pending: assessment.scorePending,
        },
        persisted: true,
      },
      {},
      request,
    )
  } catch {
    return jsonResponse(
      {
        assessment: {
          ...assessmentInsert,
          id: null,
          assessed_at: new Date().toISOString(),
          score_pending: assessment.scorePending,
        },
        persisted: false,
        error: 'assessment_insert_failed',
      },
      {},
      request,
    )
  }
}
