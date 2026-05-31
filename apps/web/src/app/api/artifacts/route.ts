import { createClient } from '@/lib/supabase/server'
import { applyRateLimit, RL_READ, RL_WRITE, validateBody } from '@/lib/api/guard'
import { artifactCreateSchema } from '@/lib/api/schemas'
import { cachedJsonResponse, getRequestId, jsonResponse } from '@/lib/api/response'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { emitTelemetryEvent } from '@/lib/telemetry'

type ArtifactType = 'url' | 'text' | 'note'

interface ArtifactRow {
  id: string
  user_id: string
  task_id?: string | null
  type?: string | null
  body?: string | null
  step_id: string
  artifact_type: ArtifactType
  content: string
  title: string | null
  created_at: string
  milestone_id: string
  milestone_title: string | null
  step_title: string | null
  planner_goal: string | null
  track_id: string | null
}

function mapArtifact(row: ArtifactRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    task_id: row.task_id ?? row.step_id,
    type: (row.type ?? row.artifact_type) as ArtifactType,
    body: row.body ?? row.content,
    title: row.title,
    created_at: row.created_at,
    milestone_id: row.milestone_id,
    milestone_title: row.milestone_title,
    step_title: row.step_title,
    planner_goal: row.planner_goal,
    track_id: row.track_id,
  }
}

function isSafeUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  const rlResponse = await applyRateLimit(request, 'artifacts:get', RL_READ)
  if (rlResponse) return rlResponse

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('task_id')?.trim()
  const plannerGoal = searchParams.get('planner_goal')?.trim()
  const trackId = searchParams.get('track_id')?.trim()

  if (!taskId) {
    return jsonResponse({ error: 'task_id は必須です。' }, { status: 400 }, request)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  let query = supabase
    .from('artifacts')
    .select('*')
    .eq('user_id', user.id)
    .eq('step_id', taskId)
    .order('created_at', { ascending: false })

  if (plannerGoal) {
    query = query.eq('planner_goal', plannerGoal)
  }

  if (trackId) {
    query = query.eq('track_id', trackId)
  }

  const { data, error } = await query

  if (error) {
    return jsonResponse({ error: 'artifact の取得に失敗しました。' }, { status: 500 }, request)
  }

  return cachedJsonResponse({
    artifacts: ((data as ArtifactRow[] | null) ?? []).map(mapArtifact),
  }, {}, request)
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'artifacts:post', RL_WRITE)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, artifactCreateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  if (body.type === 'url' && !isSafeUrl(body.body)) {
    return jsonResponse({ error: 'URL は http または https で始まる形式で入力してください。' }, { status: 400 }, request)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const { data, error } = await supabase
    .from('artifacts')
    .insert({
      user_id: user.id,
      step_id: body.task_id,
      artifact_type: body.type,
      content: body.body,
      title: body.title || null,
      planner_goal: body.planner_goal || null,
      track_id: body.track_id || null,
      milestone_id: body.milestone_id || 'unassigned',
      milestone_title: body.milestone_title || null,
      step_title: body.step_title || null,
    })
    .select('*')
    .single()

  if (error || !data) {
    return jsonResponse({ error: 'artifact の保存に失敗しました。' }, { status: 500 }, request)
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
      task_id: body.task_id,
      artifact_type: body.type,
      milestone_id: body.milestone_id ?? 'unassigned',
      milestone_title: body.milestone_title ?? null,
      planner_goal: body.planner_goal ?? null,
      track_id: body.track_id ?? null,
      source: 'artifacts',
    },
  })

  return jsonResponse({
    artifact: mapArtifact(data as ArtifactRow),
  }, {}, request)
}
