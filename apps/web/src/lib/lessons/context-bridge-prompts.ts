/**
 * Centralized prompt template for the lesson context-bridge AI.
 *
 * Extracted from `apps/web/src/app/api/lessons/[id]/context-bridge/route.ts`.
 *
 * TQ-223: prepends THREE_AXIS_GUIDE so the bridge always frames lesson
 * content for the "AI フル活用 / 非エンジニア / 最短" core experience.
 */

import { THREE_AXIS_GUIDE } from '@/lib/prompts/three-axis-guide'

export interface LessonContextBridgePromptContext {
  lessonContext: string
  taskContext: string
  personalizationBlock: string | null
}

/**
 * Build the system prompt sent to the AI provider when generating the
 * lesson <-> current-task context bridge. Returns a single newline-joined
 * string matching the legacy inline definition exactly.
 */
export function buildLessonContextBridgePrompt({
  lessonContext,
  taskContext,
  personalizationBlock,
}: LessonContextBridgePromptContext): string {
  const parts = [
    THREE_AXIS_GUIDE,
    '',
    'あなたは学習支援AIです。学習者が現在取り組んでいるタスクの文脈で、これから読むレッスンとの関連性を説明します。',
    '',
    '## レッスン情報',
    lessonContext,
    '',
    '## 現在のタスク情報',
    taskContext,
    '',
    '## 出力ルール',
    '以下の2セクションをJSON形式で出力してください。日本語で書いてください。',
    '',
    '```json',
    '{',
    '  "bridge": "このレッスンと今のタスクの関係を2-3文で説明。学習者が「なぜ今これを読むのか」を理解できるように。",',
    '  "focusPoints": ["今のタスク・状況で特に注目すべきポイント1", "ポイント2", "ポイント3"]',
    '}',
    '```',
    '',
    '- bridgeは80文字〜200文字程度',
    '- focusPointsは1〜3個、各20〜60文字程度',
    '- 具体的で実用的な内容にすること',
    '- レッスンの内容とタスクの接点を明確にすること',
  ]

  if (personalizationBlock) {
    parts.push('', personalizationBlock)
    parts.push('', '学習者の苦手分野やブロッカーに関連するポイントがあれば、focusPointsに優先的に含めてください。')
  }

  return parts.join('\n')
}
