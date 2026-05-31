import { getExternalPlannerConfig } from '@/lib/planner/zai'
import { createClient } from '@/lib/supabase/server'
import { fetchPersonalizationContext, formatPersonalizationPromptBlock } from '@/lib/planner/ai-personalization'
import { applyRateLimit, RL_AI, validateBody } from '@/lib/api/guard'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import { jsonResponse, getRequestId } from '@/lib/api/response'
import { withAiMetrics } from '@/lib/observability/ai-metrics'
import { contextBridgeSchema } from '@/lib/api/schemas'
import { fetchAtomById } from '@/lib/atoms/atom-repository'
import { toAtomViewModel } from '@/lib/atoms/atom-view-model'
import { buildLessonContextBridgePrompt } from '@/lib/lessons/context-bridge-prompts'

interface ZaiChoice {
  message?: { content?: string }
}

interface ZaiResponse {
  choices?: ZaiChoice[]
}

const CONTEXT_BRIDGE_TIMEOUT_MS = 15_000

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rlResponse = await applyRateLimit(request, 'context-bridge', RL_AI)
  if (rlResponse) return rlResponse

  const { id: lessonId } = await params

  const parsed = await validateBody(request, contextBridgeSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const requestId = getRequestId(request)

  const externalConfig = getExternalPlannerConfig()
  if (!externalConfig.available) {
    return jsonResponse(
      { error: 'ai_unavailable', message: externalConfig.reason },
      { status: 503 },
      request,
    )
  }

  const atom = await fetchAtomById(lessonId)
  const atomViewModel = atom ? toAtomViewModel(atom) : null
  const lessonContext = atomViewModel
    ? [
        `タイトル: ${atomViewModel.title}`,
        `概要: ${atomViewModel.summary}`,
        atomViewModel.capabilityOutputs.length > 0
          ? `スキルタグ: ${atomViewModel.capabilityOutputs.join(', ')}`
          : null,
        atomViewModel.goalTags.length > 0
          ? `目標タグ: ${atomViewModel.goalTags.join(', ')}`
          : null,
        atomViewModel.estimatedMinutes
          ? `所要時間: ${atomViewModel.estimatedMinutes}分`
          : null,
        atomViewModel.sections
          .filter((section) => section.id === 'why' || section.id === 'blockers')
          .map((section) => `${section.title}: ${section.markdown}`)
          .join('\n') || null,
      ].filter(Boolean).join('\n')
    : `レッスンID: ${lessonId}`

  const taskContext = [
    `タスク: ${body.taskTitle}`,
    body.taskDo ? `Do: ${body.taskDo}` : null,
    body.taskLearn ? `Learn: ${body.taskLearn}` : null,
    body.taskWhy ? `Why: ${body.taskWhy}` : null,
    body.goal ? `ゴール: ${body.goal}` : null,
    body.milestoneTitle ? `マイルストーン: ${body.milestoneTitle}` : null,
  ].filter(Boolean).join('\n')

  const supabase = await createClient()
  const personalization = await fetchPersonalizationContext(supabase).catch(() => null)
  const personalizationBlock = personalization
    ? formatPersonalizationPromptBlock(personalization)
    : null

  const systemPrompt = buildLessonContextBridgePrompt({
    lessonContext,
    taskContext,
    personalizationBlock,
  })

  // Derive highlight keywords from weaknesses/blockers
  const highlightKeywords: string[] = []
  if (personalization?.understanding) {
    const u = personalization.understanding
    highlightKeywords.push(...u.weaknesses.slice(0, 5))
    highlightKeywords.push(...u.commonBlockers.slice(0, 3))
  }
  if (personalization?.learnerState?.blockers) {
    highlightKeywords.push(...personalization.learnerState.blockers.slice(0, 3))
  }
  // Deduplicate
  const uniqueKeywords = [...new Set(highlightKeywords)].slice(0, 8)

  try {
    const aiResponse = await withAiMetrics({ operation: 'ai.context-bridge', requestId }, async () => {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), CONTEXT_BRIDGE_TIMEOUT_MS)

      const res = await fetchWithRetry(
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
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: 'このレッスンとタスクの関連性を教えてください。' },
            ],
          }),
          cache: 'no-store',
          signal: controller.signal,
        },
        { operation: 'ai.context-bridge' },
      ).finally(() => clearTimeout(timeoutId))

      if (!res.ok) {
        throw new Error(`AI request failed: ${res.status}`)
      }

      return res.json() as Promise<ZaiResponse>
    })

    const rawContent = aiResponse.choices?.[0]?.message?.content ?? ''

    // Parse JSON from response
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
    let bridge = ''
    let focusPoints: string[] = []

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as { bridge?: string; focusPoints?: string[] }
        bridge = parsed.bridge ?? ''
        focusPoints = Array.isArray(parsed.focusPoints) ? parsed.focusPoints.filter((p): p is string => typeof p === 'string') : []
      } catch {
        // Fallback: use raw text as bridge
        bridge = rawContent.replace(/```json|```/g, '').trim()
      }
    } else {
      bridge = rawContent.trim()
    }

    return jsonResponse(
      { bridge, focusPoints, highlightKeywords: uniqueKeywords },
      { status: 200 },
      request,
    )
  } catch (error) {
    return jsonResponse(
      {
        error: 'context_bridge_failed',
        message: error instanceof Error ? error.message : 'コンテキストブリッジの生成に失敗しました。',
        highlightKeywords: uniqueKeywords,
      },
      { status: 502 },
      request,
    )
  }
}
