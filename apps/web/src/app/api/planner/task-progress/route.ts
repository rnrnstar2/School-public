import { createClient } from '@/lib/supabase/server'
import { getTaskProgressByPlan, upsertTaskProgress, type TaskProgressStatus } from '@/lib/supabase/task-progress'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { cachedJsonResponse, getRequestId, jsonResponse } from '@/lib/api/response'
import { taskProgressSchema } from '@/lib/api/schemas'
import { captureServerEvent } from '@/lib/analytics/server'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { emitTelemetryEvent } from '@/lib/telemetry'
import { checkAndTriggerBlockersRecompile } from '@/lib/planner/goal-first/ai-recompile'

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'task-progress:get', RL_READ)
  if (rlResponse) return rlResponse

  const { searchParams } = new URL(request.url)
  const planId = searchParams.get('planId')

  if (!planId) {
    return jsonResponse(
      { error: 'plan_id_required', message: 'planId は必須です。' },
      { status: 400 },
      request
    )
  }

  const client = await createClient()
  const result = await getTaskProgressByPlan({ client, planId })

  if (result.error) {
    return jsonResponse(
      { error: 'fetch_failed', message: result.error },
      { status: 500 },
      request
    )
  }

  return cachedJsonResponse({ data: result.data }, {}, request)
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'task-progress:post', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, taskProgressSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const client = await createClient()
  const { data: { user } } = await client.auth.getUser().catch(() => ({ data: { user: null } }))

  const result = await upsertTaskProgress({
    client,
    planId: body.planId,
    taskId: body.taskId,
    status: body.status as TaskProgressStatus,
    title: body.title,
    doText: body.doText,
    learnText: body.learnText,
    whyText: body.whyText,
    relevantLessonIds: body.relevantLessonIds,
  })

  if (result.error) {
    return jsonResponse(
      { error: 'upsert_failed', message: result.error },
      { status: 500 },
      request
    )
  }

  // Track task completion events with elapsed time
  if (body.status === 'completed' && result.data) {
    captureServerEvent({
      event: 'task_completed',
      distinctId: user?.id ?? 'anonymous',
      properties: {
        task_id: body.taskId,
        status: body.status,
        elapsed_minutes: result.data.elapsed_minutes,
      },
    })
  }

  if (user && (body.status === 'blocked' || body.status === 'skipped')) {
    const activeCompiledPlan = await getLatestActiveCompiledPlan({
      userId: user.id,
      client,
    })
    const primaryLessonId = body.relevantLessonIds?.[0] ?? null

    await emitTelemetryEvent({
      userId: user.id,
      eventName: body.status === 'blocked' ? 'stuck_reported' : 'lesson_skipped',
      planId: activeCompiledPlan?.planId ?? null,
      requestId: getRequestId(request),
      properties: {
        task_id: body.taskId,
        lesson_id: primaryLessonId,
        status: body.status,
        source: 'task_progress',
      },
    })

    if (body.status === 'blocked') {
      void checkAndTriggerBlockersRecompile({
        client,
        userId: user.id,
        requestId: getRequestId(request),
      }).catch(() => null)
    }
  }

  return jsonResponse({ data: result.data }, {}, request)
}
