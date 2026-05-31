import { createClient } from '@/lib/supabase/server'
import { verifyArtifactAgainstEvidenceRule } from '@/lib/planner/artifact-verification'
import { upsertMilestoneProgress } from '@/lib/supabase/milestone-progress'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { artifactVerifySchema } from '@/lib/api/schemas'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import type { ArtifactVerificationResult } from '@/types'
import { createNotification } from '@/lib/notifications/create'
import { getLatestActiveCompiledPlan } from '@/lib/compiled-plans'
import { emitTelemetryEvent } from '@/lib/telemetry'

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'artifacts:verify', RL_AI)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, artifactVerifySchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const milestoneId = body.milestone_id
  const milestoneTitle = body.milestone_title?.trim() || ''
  const evidenceRule = body.evidence_rule
  const planId = body.plan_id?.trim()
  const artifacts = body.artifacts

  if (artifacts.length === 0) {
    return jsonResponse({
      verification: {
        verified: false,
        milestoneCompleted: false,
        summary: 'まだ artifact が提出されていません。',
        nextMilestoneId: null,
        nextMilestoneTitle: null,
        nextSteps: [],
        corrections: [{ point: 'artifact 未提出', suggestion: 'evidence rule に沿った成果物を1つ以上提出してください。' }],
      } satisfies ArtifactVerificationResult,
    }, {}, request)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return jsonResponse({ error: '認証が必要です。' }, { status: 401 }, request)
  }

  // Run AI verification
  const verificationResult = await verifyArtifactAgainstEvidenceRule({
    milestoneId,
    milestoneTitle,
    evidenceRule,
    artifacts: artifacts.map((a) => ({
      artifact_type: a.artifact_type,
      title: a.title,
      content: a.content,
    })),
  })

  let milestoneCompleted = false
  let nextMilestoneId: string | null = null
  let nextMilestoneTitle: string | null = null

  if (verificationResult.verified && planId) {
    // Mark milestone as completed in DB
    const upsertResult = await upsertMilestoneProgress({
      client: supabase,
      userId: user.id,
      planId,
      milestoneId,
      milestoneTitle,
      status: 'completed',
      evidenceRule,
      verificationSummary: verificationResult.summary,
    })

    milestoneCompleted = !upsertResult.error

    // Send in-app notification for milestone completion
    if (milestoneCompleted) {
      createNotification({
        userId: user.id,
        type: 'milestone_reached',
        title: `マイルストーン「${milestoneTitle || 'ステップ'}」を達成しました`,
        body: verificationResult.summary,
        link: '/plan',
      })
    }

    // Send artifact verification notification
    if (!milestoneCompleted) {
      createNotification({
        userId: user.id,
        type: 'artifact_verified',
        title: 'Artifact検証が完了しました',
        body: verificationResult.summary,
        link: '/plan',
      })
    }

    // Determine next milestone
    const allMilestones = body.milestones ?? []
    const currentIndex = allMilestones.findIndex((m) => m.id === milestoneId)

    if (currentIndex >= 0 && currentIndex < allMilestones.length - 1) {
      const next = allMilestones[currentIndex + 1]
      nextMilestoneId = next.id
      nextMilestoneTitle = next.title
    }
  }

  if (verificationResult.verified) {
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
        milestone_id: milestoneId,
        milestone_title: milestoneTitle || null,
        milestone_completed: milestoneCompleted,
        legacy_plan_id: planId ?? null,
        next_milestone_id: nextMilestoneId,
        next_milestone_title: nextMilestoneTitle,
        source: 'artifacts_verify',
      },
    })
  }

  return jsonResponse({
    verification: {
      verified: verificationResult.verified,
      milestoneCompleted,
      summary: verificationResult.summary,
      nextMilestoneId,
      nextMilestoneTitle,
      nextSteps: verificationResult.nextSteps,
      corrections: verificationResult.corrections,
    } satisfies ArtifactVerificationResult,
  }, {}, request)
}
