import { extractJsonCandidate, extractStreamingJsonFieldPreview } from '@/lib/planner/json-stream'
import type { PlannerAdapter, PlannerAdapterResult, PlannerRequest } from '@/lib/planner/types'
import { type AiPersonalizationContext, formatPersonalizationPayload } from '@/lib/planner/ai-personalization'
import type { ZaiStreamChunk } from '@/lib/planner/zai'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'
import {
  buildAtomPlannerScaffold,
  formatHearingSummary,
} from './atom-planner-scaffold'

interface ZaiPlannerAdapterOptions {
  endpoint: string
  apiKey: string
  model: string
}

type ZaiPlannerResponse = {
  status?: 'supported' | 'coming-soon'
  title?: string
  summary?: string
  detail?: string
  supportMessage?: string
  nextActionLabel?: string
  futureCategories?: string[]
}

export type PlannerStreamEvent = {
  type: 'text-delta'
  text: string
}

export class ZaiPlannerAdapter implements PlannerAdapter {
  constructor(private readonly options: ZaiPlannerAdapterOptions) {}

  get metadata() {
    return {
      id: 'zai-planner',
      label: 'ZAI プランナー',
      mode: 'external' as const,
      status: 'live' as const,
      message: 'ZAI API から生成した提案です。',
      endpoint: this.options.endpoint,
      model: this.options.model,
    }
  }

  async plan(request: PlannerRequest): Promise<PlannerAdapterResult> {
    const scaffold = await buildAtomPlannerScaffold(request)
    const rawText = await this.requestAssistantText(request, scaffold)
    return mapAssistantTextToResult(request, rawText, this.metadata, scaffold)
  }

  async planStream(request: PlannerRequest, onEvent?: (event: PlannerStreamEvent) => void): Promise<PlannerAdapterResult> {
    const scaffold = await buildAtomPlannerScaffold(request)
    const rawText = await this.requestAssistantText(request, scaffold, onEvent)
    return mapAssistantTextToResult(request, rawText, this.metadata, scaffold)
  }

  private buildMessages(request: PlannerRequest, scaffold: Awaited<ReturnType<typeof buildAtomPlannerScaffold>>) {
    const personalizationPayload = request.personalization
      ? formatPersonalizationPayload(request.personalization)
      : null

    return [
      {
        role: 'system',
        content: [
          'あなたは日本語の学習プランナーです。',
          'goal、hearing、learner_profile / learner_state、atom plan scaffold を読み、簡潔で実用的な学習提案を返してください。',
          '必ず JSON オブジェクトだけを返してください。Markdown、前置き、コードフェンスは禁止です。',
          'supportMessage を JSON の先頭付近に置いてください。streaming 表示のため、できるだけ早く supportMessage の文字列を書き始めてください。',
          'JSON schema:',
          '{"supportMessage":"string","status":"supported|coming-soon","title":"string","summary":"string","detail":"string","nextActionLabel":"string","futureCategories":["string"]}',
          'summary と detail では、なぜその順番にしたか、ヒアリングのどの要素が効いたかを明示してください。',
          'supported のときは scaffold continuation をそのまま UI に使うので、本文側は説明に集中してください。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify(
          {
            learnerGoal: request.goal,
            hearingAnswers: request.hearing ?? {},
            hearingInsights: request.hearingInsights ?? {},
            scaffold,
            ...(personalizationPayload ? { personalization: personalizationPayload } : {}),
            responseLanguage: 'ja',
          },
          null,
          2,
        ),
      },
    ]
  }

  private async requestAssistantText(
    request: PlannerRequest,
    scaffold: Awaited<ReturnType<typeof buildAtomPlannerScaffold>>,
    onEvent?: (event: PlannerStreamEvent) => void,
  ) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)
    const streaming = Boolean(onEvent)

    const response = await fetchWithRetry(
      this.options.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: streaming,
          temperature: 0.2,
          top_p: 0.9,
          response_format: {
            type: 'json_object',
          },
          messages: this.buildMessages(request, scaffold),
        }),
        cache: 'no-store',
        signal: controller.signal,
      },
      { operation: 'ai.plan-review' },
    ).finally(() => {
      clearTimeout(timeoutId)
    })

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      throw new Error(`ZAI API request failed with status ${response.status}${bodyText ? `: ${bodyText.slice(0, 240)}` : ''}`)
    }

    if (streaming) {
      const rawText = await readStreamingPlannerResponse(response, onEvent)

      if (!rawText) {
        throw new Error('ZAI API response did not include assistant content.')
      }

      return rawText
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>
        }
      }>
      output_text?: string
    }
    const rawText = extractAssistantText(payload)

    if (!rawText) {
      throw new Error('ZAI API response did not include assistant content.')
    }

    return rawText
  }
}

async function readStreamingPlannerResponse(
  response: Response,
  onEvent?: (event: PlannerStreamEvent) => void,
) {
  if (!response.body) {
    throw new Error('ZAI planner response body was empty.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let sseBuffer = ''
  let rawText = ''
  let streamedPreview = ''

  const flushEvent = (eventText: string) => {
    const dataLines = eventText
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())

    if (dataLines.length === 0) {
      return
    }

    for (const data of dataLines) {
      if (!data || data === '[DONE]') {
        continue
      }

      let payload: ZaiStreamChunk

      try {
        payload = JSON.parse(data)
      } catch {
        continue
      }

      const content = payload.choices?.[0]?.delta?.content ?? ''

      if (!content) {
        continue
      }

      rawText += content
      const preview = extractStreamingJsonFieldPreview(rawText, ['supportMessage', 'summary', 'detail'])

      if (preview.length > streamedPreview.length) {
        const nextText = preview.slice(streamedPreview.length)
        streamedPreview = preview
        if (nextText) {
          onEvent?.({
            type: 'text-delta',
            text: nextText,
          })
        }
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    sseBuffer += decoder.decode(value, { stream: true })

    while (true) {
      const boundaryIndex = sseBuffer.indexOf('\n\n')

      if (boundaryIndex < 0) {
        break
      }

      const eventText = sseBuffer.slice(0, boundaryIndex).trim()
      sseBuffer = sseBuffer.slice(boundaryIndex + 2)

      if (!eventText) {
        continue
      }

      flushEvent(eventText)
    }
  }

  sseBuffer += decoder.decode()
  if (sseBuffer.trim()) {
    flushEvent(sseBuffer)
  }

  return rawText.trim()
}

function extractAssistantText(payload: {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
  output_text?: string
}) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('\n')
      .trim()
  }

  return ''
}

function parseJsonObject(rawText: string) {
  const fencedMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = extractJsonCandidate(fencedMatch?.[1]?.trim() ?? rawText.trim())

  try {
    return JSON.parse(candidate) as ZaiPlannerResponse
  } catch {
    return null
  }
}

function mapAssistantTextToResult(
  request: PlannerRequest,
  rawText: string,
  metadata: ZaiPlannerAdapter['metadata'],
  scaffold: Awaited<ReturnType<typeof buildAtomPlannerScaffold>>,
): PlannerAdapterResult {
  const parsed = parseJsonObject(rawText)
  const isStructuredFallback = parsed === null
  const hearingSummary = formatHearingSummary(request)
  const adapter = {
    ...metadata,
    status: isStructuredFallback ? ('fallback' as const) : metadata.status,
    message: isStructuredFallback
      ? 'ZAI 応答を構造化データとして解釈できなかったため、ローカル補正表示に切り替えています。'
      : 'ZAI API から生成した提案です。',
  }

  if (!scaffold.supported || !scaffold.continuation) {
    return {
      adapter,
      recommendation: {
        status: 'coming-soon',
        normalizedGoal: scaffold.normalizedGoal,
        userFacingGoal: scaffold.userFacingGoal,
        matchedIntent: scaffold.matchedIntent,
        hearing: request.hearing,
        hearingInsights: request.hearingInsights,
        title: parsed?.title ?? 'このゴール向けのプランは準備中です',
        summary: parsed?.summary ?? scaffold.supportMessage,
        detail: parsed?.detail ?? scaffold.supportMessage,
        nextAction: {
          type: 'browse-lessons',
          label: parsed?.nextActionLabel ?? '今あるレッスンを見る',
          href: '/lessons',
        },
        supportMessage:
          parsed?.supportMessage ??
          (hearingSummary
            ? `${scaffold.supportMessage} ${hearingSummary}`
            : scaffold.supportMessage),
        futureCategories: parsed?.futureCategories ?? ['業務自動化', 'コンテンツ制作', 'アプリ制作'],
      },
      rawText,
    }
  }

  return {
    adapter,
    recommendation: {
      status: parsed?.status ?? 'supported',
      normalizedGoal: scaffold.normalizedGoal,
      userFacingGoal: scaffold.userFacingGoal,
      matchedIntent: scaffold.matchedIntent,
      hearing: request.hearing,
      hearingInsights: request.hearingInsights,
      title: parsed?.title ?? `${scaffold.recommendedTrack?.trackLabel ?? 'atom'}プランをおすすめします`,
      summary: parsed?.summary ?? scaffold.continuation.summary,
      detail: parsed?.detail ?? scaffold.continuation.summary,
      nextAction: {
        type: 'inline-continuation',
        label: parsed?.nextActionLabel ?? scaffold.continuation.ctaLabel,
      },
      continuation: scaffold.continuation,
      mentorWorkspace: scaffold.mentorWorkspace,
      recommendedTrack: scaffold.recommendedTrack,
      supportMessage:
        parsed?.supportMessage ??
        (hearingSummary
          ? `ZAI が atom plan をもとに順番を説明しました。${hearingSummary}`
          : 'ZAI が atom plan をもとに順番を説明しました。'),
    },
    rawText,
  }
}
