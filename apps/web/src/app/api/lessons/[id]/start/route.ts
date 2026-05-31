import { applyRateLimit, RL_WRITE } from '@/lib/api/guard'
import { jsonResponse, getRequestId } from '@/lib/api/response'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { resolveLessonIdentityId } from '@/lib/supabase/lesson-catalog'
import { createClient } from '@/lib/supabase/server'
import { emitTelemetryEvent } from '@/lib/telemetry'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'lesson-start', RL_WRITE)
  if (rlResponse) return rlResponse

  const { id } = await params
  const lessonId = id?.trim()

  if (!lessonId) {
    return jsonResponse({ error: 'lesson_id は必須です。' }, { status: 400 }, request)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ tracked: false }, {}, request)
  }

  const body = await request.json().catch(() => ({})) as {
    lessonTitle?: string
    goal?: string | null
    trackId?: string | null
    taskId?: string | null
    stepId?: string | null
  }

  const resolvedLessonIdResult = await resolveLessonIdentityId({
    client: supabase,
    lessonIdOrSlug: lessonId,
  })
  const canonicalLessonId = resolvedLessonIdResult.data ?? lessonId
  const activeCompiledPlan = await getLatestActiveCompiledPlan({
    userId: user.id,
    client: supabase,
  })

  await emitTelemetryEvent({
    userId: user.id,
    eventName: 'lesson_started',
    planId: activeCompiledPlan?.planId ?? null,
    requestId: getRequestId(request),
    properties: {
      lesson_id: canonicalLessonId,
      lesson_slug: lessonId,
      lesson_title: body.lessonTitle ?? null,
      goal: body.goal ?? null,
      track_id: body.trackId ?? null,
      task_id: body.taskId ?? null,
      step_id: body.stepId ?? null,
    },
  })

  return jsonResponse(
    {
      tracked: true,
      lessonId: canonicalLessonId,
      planId: activeCompiledPlan?.planId ?? null,
    },
    {},
    request,
  )
}
