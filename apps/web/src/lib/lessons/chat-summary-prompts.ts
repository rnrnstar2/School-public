/**
 * Centralized prompt template for the lesson chat summary AI.
 *
 * Extracted from `apps/web/src/app/api/lessons/[id]/chat/summary/route.ts`.
 * The string contents below match the previous inline `buildSummaryMessages`
 * implementation byte-for-byte (no behavior change).
 */

import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'
import type { LessonChatMessage } from '@/types'

export interface LessonChatSummaryPromptContext {
  chatMessages: LessonChatMessage[]
  lessonTitle: string
}

export interface LessonChatSummaryMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * Build the system+user message pair sent to the AI provider when generating
 * a key-points summary of a lesson chat session.
 */
export function buildLessonChatSummaryMessages({
  chatMessages,
  lessonTitle,
}: LessonChatSummaryPromptContext): LessonChatSummaryMessage[] {
  const conversationText = chatMessages
    .map((m) => `${m.role === 'user' ? '学習者' : 'AI'}: ${m.content}`)
    .join('\n\n')

  return [
    {
      role: 'system',
      content: [
        THREE_AXIS_GUIDE,
        '',
        'あなたは学習進捗を記録するアシスタントです。',
        '以下のレッスンチャット会話から、学習者にとって重要なkey pointsを3〜5個抽出してください。',
        '各ポイントは1文で簡潔にまとめてください。',
        '日本語で回答してください。',
        'JSON配列形式で返してください: ["ポイント1", "ポイント2", ...]',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `レッスン「${lessonTitle}」のチャット会話:\n\n${conversationText}`,
    },
  ]
}
