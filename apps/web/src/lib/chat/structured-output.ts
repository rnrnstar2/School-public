import * as Sentry from '@sentry/nextjs'
import { extractJsonCandidate, extractStreamingJsonFieldPreview } from '@/lib/planner/json-stream'
import {
  MENTOR_CHAT_EMPTY_REPLY_PLACEHOLDER,
  MentorChatStructuredOutputSchema,
  type MentorChatStructuredOutput,
} from '@/types/mentor-chat'

const STRUCTURED_OUTPUT_FALLBACK_MESSAGE = 'Chat structured output fallback used'

export function buildMentorChatStructuredOutputFallback(replyText: string): MentorChatStructuredOutput {
  const reply = replyText.trim() || MENTOR_CHAT_EMPTY_REPLY_PLACEHOLDER

  return {
    reply,
    phase: 'coaching',
    actions: [],
    decisions: [],
    open_questions: [],
    next_question: null,
    next_action: null,
  }
}

export function extractStructuredReplyPreview(rawText: string) {
  return extractStreamingJsonFieldPreview(rawText, ['reply', 'assistantMessage'])
}

export function coerceMentorChatStructuredOutput(value: unknown) {
  const parsed = MentorChatStructuredOutputSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

function extractParsedReply(value: unknown) {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const reply = (value as { reply?: unknown }).reply
  return typeof reply === 'string' && reply.trim() ? reply : ''
}

function looksLikeStructuredOutputPayload(rawText: string) {
  const trimmed = rawText.trim()

  return (
    trimmed.startsWith('{')
    || trimmed.startsWith('[')
    || trimmed.includes('"reply"')
    || trimmed.includes('"assistantMessage"')
  )
}

function resolveStructuredOutputFallbackReply(
  rawText: string,
  accumulatedReply: string,
  parsedValue?: unknown,
  didParseJson = false,
) {
  const parsedReply = extractParsedReply(parsedValue)
  if (parsedReply) {
    return parsedReply
  }

  const trimmedAccumulatedReply = accumulatedReply.trim()
  if (trimmedAccumulatedReply) {
    return trimmedAccumulatedReply
  }

  const trimmedRawText = rawText.trim()
  if (!trimmedRawText) {
    return ''
  }

  return !didParseJson && !looksLikeStructuredOutputPayload(trimmedRawText)
    ? trimmedRawText
    : ''
}

function captureStructuredOutputWarning(context: string, rawText: string, error: string) {
  Sentry.captureMessage(STRUCTURED_OUTPUT_FALLBACK_MESSAGE, {
    level: 'warning',
    extra: {
      context,
      error,
      raw_text_preview: rawText.slice(0, 500),
    },
  })
}

export function parseMentorChatStructuredOutput(
  rawText: string,
  context: string,
  accumulatedReply = extractStructuredReplyPreview(rawText),
): {
  structuredOutput: MentorChatStructuredOutput
  usedFallback: boolean
} {
  const trimmed = rawText.trim()
  let parsedCandidate: unknown
  let didParseJson = false

  if (!trimmed) {
    captureStructuredOutputWarning(context, rawText, 'empty_response')
    return {
      structuredOutput: buildMentorChatStructuredOutputFallback(
        resolveStructuredOutputFallbackReply(rawText, accumulatedReply),
      ),
      usedFallback: true,
    }
  }

  try {
    parsedCandidate = JSON.parse(extractJsonCandidate(trimmed)) as unknown
    didParseJson = true
    const parsed = MentorChatStructuredOutputSchema.safeParse(parsedCandidate)

    if (parsed.success) {
      return {
        structuredOutput: parsed.data,
        usedFallback: false,
      }
    }

    captureStructuredOutputWarning(context, rawText, parsed.error.message)
  } catch (error) {
    captureStructuredOutputWarning(
      context,
      rawText,
      error instanceof Error ? error.message : 'json_parse_failed',
    )
  }

  return {
    structuredOutput: buildMentorChatStructuredOutputFallback(
      resolveStructuredOutputFallbackReply(rawText, accumulatedReply, parsedCandidate, didParseJson),
    ),
    usedFallback: true,
  }
}
