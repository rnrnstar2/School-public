import { getExternalPlannerConfig } from '@/lib/planner/zai'
import { fetchWithRetry } from '@/lib/api/fetch-with-retry'

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ConversationContextOptions {
  /** Maximum number of recent messages to keep verbatim (default: 10) */
  recentMessageCount?: number
  /** Message count threshold that triggers summarization (default: 20) */
  summarizationThreshold?: number
  /** Optional system prompt to prepend */
  systemPrompt?: string
  /** Additional context blocks (personalization, lesson info, etc.) */
  additionalContext?: string[]
}

export interface ConversationContextResult {
  /** Messages array ready to send to AI API */
  messages: ConversationMessage[]
  /** Whether older messages were summarized */
  wasSummarized: boolean
  /** Summary text if summarization occurred */
  summaryText: string | null
}

const DEFAULT_RECENT_COUNT = 10
const DEFAULT_SUMMARIZATION_THRESHOLD = 20
const SUMMARIZATION_TIMEOUT_MS = 10_000

/**
 * Builds an optimized conversation context for AI API calls.
 *
 * When messages exceed the threshold, older messages are summarized into a
 * compact digest, preserving recent messages verbatim. This prevents token
 * limit issues while maintaining conversation quality.
 */
export async function buildConversationContext(
  messages: ConversationMessage[],
  options: ConversationContextOptions = {},
): Promise<ConversationContextResult> {
  const recentCount = options.recentMessageCount ?? DEFAULT_RECENT_COUNT
  const threshold = options.summarizationThreshold ?? DEFAULT_SUMMARIZATION_THRESHOLD

  // Filter to user/assistant messages only
  const conversationMessages = messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant',
  )

  const needsSummarization = conversationMessages.length > threshold
  let contextMessages: ConversationMessage[]
  let wasSummarized = false
  let summaryText: string | null = null

  if (needsSummarization) {
    const olderMessages = conversationMessages.slice(0, -recentCount)
    const recentMessages = conversationMessages.slice(-recentCount)

    summaryText = await summarizeMessages(olderMessages)
    wasSummarized = true

    contextMessages = [
      {
        role: 'system' as const,
        content: `【会話要約】以下はこれまでの会話の要約です:\n${summaryText}`,
      },
      ...recentMessages,
    ]
  } else {
    contextMessages = conversationMessages.slice(-recentCount)
  }

  // Build final messages array
  const result: ConversationMessage[] = []

  // System prompt with optional additional context
  if (options.systemPrompt) {
    const parts = [options.systemPrompt]

    if (options.additionalContext?.length) {
      parts.push(...options.additionalContext)
    }

    result.push({ role: 'system', content: parts.join('\n\n') })
  }

  result.push(...contextMessages)

  return { messages: result, wasSummarized, summaryText }
}

/**
 * Summarizes older conversation messages into a compact digest.
 * Falls back to rule-based extraction if AI is unavailable.
 */
async function summarizeMessages(messages: ConversationMessage[]): Promise<string> {
  const digest = formatMessagesForSummary(messages)

  try {
    const aiSummary = await callAiForSummary(digest)
    if (aiSummary) return aiSummary
  } catch {
    // Fall through to fallback
  }

  return fallbackSummarize(messages)
}

function formatMessagesForSummary(messages: ConversationMessage[]): string {
  return messages
    .map((m) => `${m.role === 'assistant' ? 'AI' : 'ユーザー'}: ${m.content}`)
    .join('\n')
}

async function callAiForSummary(digest: string): Promise<string | null> {
  const config = getExternalPlannerConfig()
  if (!config.available) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), SUMMARIZATION_TIMEOUT_MS)

  try {
    const response = await fetchWithRetry(
      config.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          top_p: 0.8,
          messages: [
            {
              role: 'system',
              content: [
                'あなたは会話要約アシスタントです。',
                '以下の学習者とAIメンターの会話を、重要な情報を保持しつつ簡潔に要約してください。',
                '',
                '保持すべき情報:',
                '- 学習者が質問した内容とその回答の要点',
                '- 学習者が理解した/していない概念',
                '- 決定事項や合意した方針',
                '- 具体的なコード例やエラーへの言及',
                '',
                '出力形式: 箇条書きで5-10項目。各項目は1-2文で簡潔に。',
                'Markdownやコードフェンスは不要です。日本語で回答してください。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: `以下の会話を要約してください:\n\n${digest}`,
            },
          ],
        }),
        cache: 'no-store' as const,
        signal: controller.signal,
      },
      { operation: 'ai.conversation-summary', maxRetries: 1 },
    )

    clearTimeout(timeoutId)

    if (!response.ok) return null

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }

    const content = payload.choices?.[0]?.message?.content?.trim()
    return content || null
  } catch {
    clearTimeout(timeoutId)
    return null
  }
}

/**
 * Rule-based fallback: extracts key points from conversation without AI.
 * Keeps user questions and assistant answer summaries.
 */
export function fallbackSummarize(messages: ConversationMessage[]): string {
  const points: string[] = []

  for (const msg of messages) {
    if (msg.role === 'user') {
      points.push(`・質問/発言: ${msg.content.slice(0, 150)}`)
    } else if (msg.role === 'assistant') {
      // Extract first sentence as summary
      const firstSentence = msg.content.split(/[。\n]/)[0]?.trim()
      if (firstSentence) {
        points.push(`・回答要点: ${firstSentence.slice(0, 150)}`)
      }
    }
  }

  // Limit to 15 points to keep summary compact
  return points.slice(0, 15).join('\n')
}
