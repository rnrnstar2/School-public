/**
 * Centralized prompt templates for the in-lesson chat AI.
 *
 * Extracted from `apps/web/src/app/api/lessons/[id]/chat/route.ts` so that
 * lesson-chat prompt wording lives next to its sibling helpers under
 * `lib/lessons/` instead of inside the route handler. The string contents
 * here are byte-identical to the previous inline implementation — see the
 * P3-3 commit history for the original definition.
 */

import { buildMentorChatStructuredOutputPromptSection } from '@/lib/prompts/mentor-chat-structured-output'
import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'

/**
 * Context required to render the lesson-chat system prompt.
 *
 * - `lessonContext` is the human-readable lesson description block (title,
 *   summary, and any extracted lesson blocks). The route builds it via
 *   `resolveLessonContext()`.
 * - `personalizationBlock` is the optional personalization preamble produced
 *   by `formatPersonalizationPromptBlock()`; pass `null` or `undefined` to
 *   omit the block.
 */
export interface LessonChatSystemPromptContext {
  lessonContext: string
  personalizationBlock?: string | null
}

/**
 * Build the system prompt sent to the AI provider for in-lesson chat.
 *
 * Returns a single newline-joined string. The wording is identical to the
 * previous inline `buildSystemPrompt()` implementation in
 * `apps/web/src/app/api/lessons/[id]/chat/route.ts` (no behavior change).
 */
export function buildLessonChatSystemPrompt({
  lessonContext,
  personalizationBlock,
}: LessonChatSystemPromptContext): string {
  const structuredOutputBlock = buildMentorChatStructuredOutputPromptSection({
    nextActionLabel: 'このレッスンの練習タスク',
    actionInstruction:
      '- レッスン変更の提案が必要な場合は、`reply` の末尾に `[MENTOR_ACTION]{...json...}[/MENTOR_ACTION]` を入れてください。JSON の外には何も出さないでください。',
  })

  const parts = [
    THREE_AXIS_GUIDE,
    '',
    'あなたはレッスン内の学習サポート AI です。',
    '学習者がレッスン内容について質問しています。以下のレッスン情報を参考に、的確で分かりやすい回答をしてください。',
    '',
    '## レッスン情報',
    lessonContext,
    '',
    '## 回答ガイドライン',
    '- レッスンの内容に関連した質問には、具体例やコード例を交えて回答してください。',
    '- レッスン範囲外の質問には、簡潔に答えつつレッスンとの関連を示してください。',
    '- 日本語で回答してください。',
    '- 回答は簡潔に、1-3段落程度にまとめてください。',
    '- コード例がある場合は適切にフォーマットしてください。',
    '',
    '## メンターアクション',
    '学習者の状況に応じて、レッスンの変更を提案できます。提案する場合は、通常の回答テキストの後に以下の形式でアクションブロックを追加してください。',
    '提案は学習者にとって明確に有益な場合のみ行ってください。',
    '',
    '### アクション形式',
    '[MENTOR_ACTION]{"type":"change_next_lesson","targetLessonId":"...", "targetLessonTitle":"...", "reason":"..."}[/MENTOR_ACTION]',
    '[MENTOR_ACTION]{"type":"skip_lesson","targetLessonId":"...", "targetLessonTitle":"...", "reason":"..."}[/MENTOR_ACTION]',
    '[MENTOR_ACTION]{"type":"add_lesson","targetLessonId":"...", "targetLessonTitle":"...", "reason":"..."}[/MENTOR_ACTION]',
    '[MENTOR_ACTION]{"type":"reorder_schedule","newOrder":[{"lessonId":"...","lessonTitle":"..."}], "reason":"..."}[/MENTOR_ACTION]',
    '',
    '### 提案すべき場面',
    '- 学習者が現在のレッスンの前提知識が不足している場合 → 基礎レッスンへの変更を提案',
    '- 学習者がレッスン内容を既に理解している場合 → スキップを提案',
    '- 学習者の質問から関連する補足レッスンが有益だと判断した場合 → レッスン追加を提案',
    '- 学習者の進捗状況に応じて順序変更が効果的な場合 → 並べ替えを提案',
    '',
    structuredOutputBlock,
  ]

  if (personalizationBlock) {
    parts.push('', personalizationBlock)
  }

  return parts.join('\n')
}
