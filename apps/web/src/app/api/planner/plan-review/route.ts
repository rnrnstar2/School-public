import { getExternalPlannerConfig } from '@/lib/planner/zai'
import type { PlanReviewRequest, PlanReviewProposal } from '@/lib/planner/plan-review'
import { extractJsonCandidate } from '@/lib/planner/json-stream'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { jsonResponse, getRequestId } from '@/lib/api/response'
import { withAiMetrics } from '@/lib/observability/ai-metrics'
import { planReviewSchema } from '@/lib/api/schemas'
import { createClient } from '@/lib/supabase/server'

import {
  getMentorRoleConfig,
  buildMentorContext,
  buildMentorPrompt,
} from '@/lib/mentor/core'

// ---------------------------------------------------------------------------
// V2 plan-review path: uses buildMentorContext + buildMentorPrompt (role='review')
// ---------------------------------------------------------------------------

async function handlePlanReviewV2(
  request: Request,
  body: PlanReviewRequest,
  requestId: string | null,
): Promise<Response | null> {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
  const userId = authUser?.id

  if (!userId) {
    // No authenticated user — fall back to legacy path
    return null
  }

  const config = getExternalPlannerConfig()

  if (!config.available) {
    const proposal = buildLocalFallbackProposal(body)
    return jsonResponse({ data: proposal, adapter: 'fallback' }, {}, request)
  }

  const roleConfig = getMentorRoleConfig('review')

  // Build evidence text from the continuation + task progress
  const evidenceContent = body.triggerReasons.map((r) => r.detail).join('\n')

  // Build rubric from current plan state
  const rubricText = [
    `ゴール: ${body.goal}`,
    `プランステップ数: ${body.continuation.steps.length}`,
    `タスク進捗概要: ${Object.entries(body.taskProgress).map(([id, p]) => `${id}: ${p.status}`).join(', ')}`,
  ].join('\n')

  const mentorContext = await buildMentorContext({
    userId,
    supabase,
    role: 'review',
    goalText: body.goal,
    evidenceContent,
    rubricText,
  })

  const promptResult = buildMentorPrompt(roleConfig, mentorContext)

  try {
    const proposal = await withAiMetrics({ operation: 'ai.plan-review', requestId }, async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)

      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: roleConfig.temperature,
          top_p: 0.9,
          response_format: { type: 'json_object' },
          messages: promptResult.messages,
        }),
        cache: 'no-store',
        signal: controller.signal,
      }).finally(() => {
        clearTimeout(timeoutId)
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`ZAI API failed: ${response.status} ${errorText.slice(0, 200)}`)
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }

      const rawText = payload.choices?.[0]?.message?.content?.trim() ?? ''
      if (!rawText) {
        throw new Error('ZAI API returned empty content')
      }

      const candidate = extractJsonCandidate(rawText)
      return JSON.parse(candidate) as PlanReviewProposal
    })

    return jsonResponse({ data: proposal, adapter: 'live' }, {}, request)
  } catch (error) {
    console.error(`[plan-review][${requestId}] V2 AI generation failed, using fallback:`, error)
    const proposal = buildLocalFallbackProposal(body)
    return jsonResponse({ data: proposal, adapter: 'fallback' }, {}, request)
  }
}

export async function POST(request: Request) {
  const rlResponse = await applyRateLimit(request, 'plan-review', RL_AI)
  if (rlResponse) return rlResponse

  const parsed = await validateBody(request, planReviewSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data as unknown as PlanReviewRequest

  if (!body?.goal || !body?.continuation) {
    return jsonResponse(
      { error: 'invalid_input', message: 'goal と continuation は必須です。' },
      { status: 400 },
      request,
    )
  }

  const requestId = getRequestId(request)

  const v2Response = await handlePlanReviewV2(request, body, requestId)
  if (v2Response) return v2Response

  // No authenticated user — use local fallback
  const proposal = buildLocalFallbackProposal(body)
  return jsonResponse({ data: proposal, adapter: 'fallback' }, {}, request)
}

function buildLocalFallbackProposal(request: PlanReviewRequest): PlanReviewProposal {
  const blockedSteps = request.continuation.steps.filter(
    (s) => request.taskProgress[s.id]?.status === 'blocked'
  )
  const skippedSteps = request.continuation.steps.filter(
    (s) => request.taskProgress[s.id]?.status === 'skipped'
  )

  const revisedSteps: PlanReviewProposal['revisedSteps'] = []
  const removedStepIds: string[] = []

  // Keep completed and in-progress steps as-is
  for (const step of request.continuation.steps) {
    const status = request.taskProgress[step.id]?.status
    if (status === 'completed' || status === 'in-progress') {
      revisedSteps.push({
        id: step.id,
        title: step.title,
        description: step.description,
        outcome: step.outcome,
        purpose: step.purpose,
        isNew: false,
      })
    }
  }

  // Split blocked steps into smaller tasks
  for (const step of blockedSteps) {
    const doText = request.taskProgress[step.id]?.do ?? step.description
    revisedSteps.push({
      id: `${step.id}-prep`,
      title: `${step.title} の前提整理`,
      description: `「${step.title}」で詰まった原因を整理し、必要な前提知識を確認するステップです。`,
      outcome: `${step.title} に取り組むための前提が整った状態`,
      purpose: 'ブロッカーの原因を特定して、次のアクションを明確にする',
      isNew: true,
      originalStepId: step.id,
    })
    revisedSteps.push({
      id: step.id,
      title: step.title,
      description: doText,
      outcome: step.outcome,
      purpose: step.purpose,
      isNew: false,
    })
  }

  // Remove skipped steps (they can be added back later)
  for (const step of skippedSteps) {
    removedStepIds.push(step.id)
  }

  // Keep remaining not-started / on-hold steps
  for (const step of request.continuation.steps) {
    const status = request.taskProgress[step.id]?.status
    if (!status || status === 'not-started' || status === 'on-hold') {
      if (!blockedSteps.some((b) => b.id === step.id)) {
        revisedSteps.push({
          id: step.id,
          title: step.title,
          description: step.description,
          outcome: step.outcome,
          purpose: step.purpose,
          isNew: false,
        })
      }
    }
  }

  const parts: string[] = []
  if (blockedSteps.length > 0) {
    parts.push(`ブロック中の ${blockedSteps.length} タスクに前提整理ステップを追加`)
  }
  if (skippedSteps.length > 0) {
    parts.push(`スキップされた ${skippedSteps.length} タスクを一時的に除外`)
  }

  return {
    summary: parts.length > 0
      ? `${parts.join('し、')}しました。`
      : '現在のプランを維持しつつ、微調整を提案します。',
    rationale: request.triggerReasons.map((r) => r.detail).join(' '),
    revisedSteps,
    removedStepIds,
    mentorNote: blockedSteps.length > 0
      ? '詰まっているタスクがあったので、前提を整理するステップを挟みました。一つずつ進めていきましょう。'
      : 'プランの進め方を少し調整しました。ペースに合わせて進めていきましょう。',
  }
}
