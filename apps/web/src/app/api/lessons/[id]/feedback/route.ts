import type { Json } from '@/lib/supabase/database.types'
import { createClient } from '@/lib/supabase/server'
import { getExternalPlannerConfig } from '@/lib/planner/zai'
import type { LessonFeedbackAdjustmentProposal } from '@/types'
import { upsertMentorMemory } from '@/lib/learner-models'
import { fetchPersonalizationContext, formatPersonalizationPromptBlock } from '@/lib/planner/ai-personalization'
import { checkAndTriggerNegativeFeedbackRecompile } from '@/lib/planner/goal-first/ai-recompile'
import { resolveLessonIdentityId } from '@/lib/supabase/lesson-catalog'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import { lessonFeedbackSchema } from '@/lib/api/schemas'
import { getRequestId, jsonResponse } from '@/lib/api/response'
import { fetchAtomById } from '@/lib/atoms/atom-repository'
import { buildLessonFeedbackAdjustmentPrompt } from '@/lib/lessons/feedback-prompts'

interface FeedbackRequestBody {
  difficulty_rating?: number
  clarity_rating?: number
  comment?: string
  lessonTitle?: string
}

const FEEDBACK_AI_TIMEOUT_MS = 15_000

async function generateAdjustmentProposal(
  lessonTitle: string,
  difficultyRating: number,
  clarityRating: number,
  comment: string | null,
  personalizationBlock?: string | null
): Promise<LessonFeedbackAdjustmentProposal | null> {
  const externalConfig = getExternalPlannerConfig()

  if (!externalConfig.available) {
    return null
  }

  const prompt = buildLessonFeedbackAdjustmentPrompt({
    lessonTitle,
    difficultyRating,
    clarityRating,
    comment,
    personalizationBlock,
  })

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FEEDBACK_AI_TIMEOUT_MS)

    const response = await fetchWithRetry(
      externalConfig.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${externalConfig.apiKey}`,
        },
        body: JSON.stringify({
          model: externalConfig.model,
          temperature: 0.4,
          top_p: 0.9,
          stream: false,
          messages: [{ role: 'user', content: prompt }],
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
      { operation: 'ai.lesson-chat' },
    ).finally(() => clearTimeout(timeoutId))

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const rawContent = data.choices?.[0]?.message?.content?.trim() ?? ''

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) ?? rawContent.match(/(\{[\s\S]*\})/)
    const jsonStr = jsonMatch?.[1]?.trim() ?? rawContent

    const proposal = JSON.parse(jsonStr) as LessonFeedbackAdjustmentProposal

    if (!proposal.summary || !Array.isArray(proposal.suggestions)) {
      return null
    }

    return proposal
  } catch {
    return null
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rlResponse = await applyRateLimit(request, 'lesson-feedback', RL_AI)
  if (rlResponse) return rlResponse

  const { id } = await params
  const lessonId = id?.trim()

  if (!lessonId) {
    return jsonResponse({ error: 'lesson_id は必須です。' }, { status: 400 }, request)
  }

  const parsed = await validateBody(request, lessonFeedbackSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { difficulty_rating, clarity_rating, comment } = body

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
  const canonicalLessonId = resolvedLessonIdResult.data ?? lessonId

  // Resolve lesson title
  const atom = await fetchAtomById(canonicalLessonId)
  const lessonTitle = atom?.title ?? body.lessonTitle ?? canonicalLessonId

  // Generate AI adjustment proposal with personalization
  const personalization = await fetchPersonalizationContext(supabase).catch(() => null)
  const personalizationBlock = personalization
    ? formatPersonalizationPromptBlock(personalization)
    : null

  const adjustmentProposal = await generateAdjustmentProposal(
    lessonTitle,
    difficulty_rating,
    clarity_rating,
    comment ?? null,
    personalizationBlock
  )

  // Upsert feedback
  const now = new Date().toISOString()
  const { data: existing } = await supabase
    .from('lesson_feedback')
    .select('id')
    .eq('user_id', user.id)
    .eq('lesson_id', canonicalLessonId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('lesson_feedback')
      .update({
        difficulty_rating,
        clarity_rating,
        comment: comment ?? null,
        adjustment_proposal: adjustmentProposal as unknown as Json,
        updated_at: now,
      })
      .eq('id', existing.id)

    if (error) {
      return jsonResponse({ error: 'フィードバックの更新に失敗しました。' }, { status: 500 }, request)
    }
  } else {
    const { error } = await supabase
      .from('lesson_feedback')
      .insert({
        user_id: user.id,
        lesson_id: canonicalLessonId,
        difficulty_rating,
        clarity_rating,
        comment: comment ?? null,
        adjustment_proposal: adjustmentProposal as unknown as Json,
        created_at: now,
        updated_at: now,
      })

    if (error) {
      return jsonResponse({ error: 'フィードバックの保存に失敗しました。' }, { status: 500 }, request)
    }
  }

  // Save mentor_memory for feedback interaction
  const bullets = [
    `レッスン: ${lessonTitle}`,
    `難易度: ${difficulty_rating}/5`,
    `理解度: ${clarity_rating}/5`,
  ]
  if (comment) bullets.push(`コメント: ${comment.slice(0, 200)}`)
  if (adjustmentProposal?.summary) bullets.push(`調整提案: ${adjustmentProposal.summary}`)

  await upsertMentorMemory({
    title: `フィードバック: ${lessonTitle}`,
    bullets,
    source: 'mentor',
  }, supabase).catch(() => {/* non-blocking */})

  // Trigger plan recompile if negative feedback threshold exceeded
  const isNegative =
    (difficulty_rating != null && difficulty_rating >= 4) ||
    (clarity_rating != null && clarity_rating <= 2)
  let recompileResult = null
  if (isNegative) {
    recompileResult = await checkAndTriggerNegativeFeedbackRecompile({
      client: supabase,
      userId: user.id,
      requestId: getRequestId(request),
    }).catch(() => null)
  }

  return jsonResponse({
    saved: true,
    adjustment_proposal: adjustmentProposal,
    recompile: recompileResult
      ? {
          triggered: true,
          reason: 'negative_feedback',
          planId: recompileResult.planId,
          changes: recompileResult.changes,
        }
      : { triggered: false },
  }, {}, request)
}
