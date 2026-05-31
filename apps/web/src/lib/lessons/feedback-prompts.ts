/**
 * Centralized prompt template for the lesson feedback AI adjustment proposal.
 *
 * Extracted from `apps/web/src/app/api/lessons/[id]/feedback/route.ts`.
 *
 * TQ-223: prepends THREE_AXIS_GUIDE to align suggestions with the
 * "AI フル活用 / 非エンジニア / 最短" core experience.
 */

import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'

export interface LessonFeedbackAdjustmentPromptContext {
  lessonTitle: string
  difficultyRating: number
  clarityRating: number
  comment: string | null
  personalizationBlock?: string | null
}

/**
 * Build the user-prompt sent to the AI provider when generating a
 * `LessonFeedbackAdjustmentProposal`. Returns a single newline-joined string
 * matching the legacy inline definition exactly.
 */
export function buildLessonFeedbackAdjustmentPrompt({
  lessonTitle,
  difficultyRating,
  clarityRating,
  comment,
  personalizationBlock,
}: LessonFeedbackAdjustmentPromptContext): string {
  const parts = [
    THREE_AXIS_GUIDE,
    '',
    'あなたは学習プラン調整アドバイザーです。',
    '学習者がレッスン完了後にフィードバックを送信しました。このフィードバックに基づいて、学習プランの調整提案を生成してください。',
  ]

  if (personalizationBlock) {
    parts.push('', personalizationBlock, '')
  }

  parts.push(
    '',
    '## フィードバック内容',
    `レッスン: ${lessonTitle}`,
    `難易度評価: ${difficultyRating}/5 (1=簡単すぎる, 3=ちょうどいい, 5=難しすぎる)`,
    `理解度評価: ${clarityRating}/5 (1=分かりにくい, 3=普通, 5=とても分かりやすい)`,
    comment ? `コメント: ${comment}` : '',
    '',
    '## 回答フォーマット',
    '以下のJSON形式で回答してください。他のテキストは含めないでください。',
    '```json',
    '{',
    '  "summary": "フィードバック全体のまとめ（1文）",',
    '  "suggestions": [',
    '    {',
    '      "type": "pace | difficulty | content | review",',
    '      "label": "提案の短いタイトル",',
    '      "description": "具体的な提案内容（1-2文）"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    '## ルール',
    '- suggestions は1〜3件にしてください。',
    '- 難易度が高すぎる(4-5)場合は、ペース調整や復習レッスンを提案してください。',
    '- 難易度が低すぎる(1-2)場合は、より高度な内容へのスキップを提案してください。',
    '- 理解度が低い(1-2)場合は、補足資料や復習を提案してください。',
    '- 難易度3かつ理解度4-5の場合は、順調である旨のみ伝えてください。',
    '- 日本語で回答してください。',
  )

  return parts.join('\n')
}
