import { applyRateLimit, RL_WRITE } from '@/lib/api/guard'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { resolveNextAtom } from '@/lib/atoms/next-atom-resolver'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { createClient } from '@/lib/supabase/server'
import { emitTelemetryEvent } from '@/lib/telemetry'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readJsonBody(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function hasArtifactEvidence(body: unknown) {
  if (!isRecord(body)) {
    return false
  }

  if (body.artifact) {
    return true
  }

  return Array.isArray(body.artifacts) && body.artifacts.length > 0
}

async function emitLessonCompletionTelemetry(params: {
  userId: string
  atomId: string
  planId: string | null
  requestId: string | null
  hasArtifact: boolean
}) {
  try {
    await emitTelemetryEvent({
      userId: params.userId,
      eventName: 'lesson_completed',
      atomId: params.atomId,
      planId: params.planId,
      requestId: params.requestId,
      properties: {
        source: 'lesson_complete',
      },
    })
  } catch (error) {
    console.warn('lesson_completed telemetry failed', error)
  }

  if (!params.hasArtifact) {
    return
  }

  try {
    await emitTelemetryEvent({
      userId: params.userId,
      eventName: 'evidence_passed',
      atomId: params.atomId,
      planId: params.planId,
      requestId: params.requestId,
      properties: {
        source: 'lesson_complete',
        mode: 'artifact_stub',
      },
    })
  } catch (error) {
    console.warn('evidence_passed telemetry failed', error)
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rlResponse = await applyRateLimit(request, 'lesson-complete', RL_WRITE)
  if (rlResponse) {
    return rlResponse
  }

  const { id } = await params
  const atomId = id?.trim()

  if (!atomId) {
    return jsonResponse({ error: 'atom_id は必須です。' }, { status: 400 }, request)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  const body = await readJsonBody(request)
  const activePlan = await getLatestActiveCompiledPlan({
    userId: user.id,
    client: supabase,
  })

  await emitLessonCompletionTelemetry({
    userId: user.id,
    atomId,
    planId: activePlan?.planId ?? null,
    requestId: getRequestId(request),
    hasArtifact: hasArtifactEvidence(body),
  })

  const next = await resolveNextAtom({
    userId: user.id,
    justCompletedAtomId: atomId,
    client: supabase,
  })

  return jsonResponse({ ok: true, next }, {}, request)
}
