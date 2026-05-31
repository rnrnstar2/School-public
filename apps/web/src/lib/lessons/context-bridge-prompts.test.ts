import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLessonContextBridgePrompt } from './context-bridge-prompts'

test('buildLessonContextBridgePrompt embeds lesson and task context', () => {
  const prompt = buildLessonContextBridgePrompt({
    lessonContext: 'タイトル: SSR入門\n概要: ServerSide Rendering',
    taskContext: 'タスク: ブログのSSR化\nDo: 設定変更',
    personalizationBlock: null,
  })

  assert.match(prompt, /あなたは学習支援AIです。/)
  assert.ok(prompt.includes('## レッスン情報\nタイトル: SSR入門'))
  assert.ok(prompt.includes('## 現在のタスク情報\nタスク: ブログのSSR化'))
  assert.match(prompt, /## 出力ルール/)
  assert.match(prompt, /"bridge"/)
  assert.match(prompt, /"focusPoints"/)
})

test('buildLessonContextBridgePrompt appends personalization and weakness directive', () => {
  const prompt = buildLessonContextBridgePrompt({
    lessonContext: 'lesson',
    taskContext: 'task',
    personalizationBlock: '## 学習者の理解\n弱点: A',
  })

  assert.ok(prompt.includes('## 学習者の理解\n弱点: A'))
  assert.ok(prompt.includes('学習者の苦手分野やブロッカーに関連するポイントがあれば、focusPointsに優先的に含めてください。'))
})

test('buildLessonContextBridgePrompt skips personalization tail when null', () => {
  const prompt = buildLessonContextBridgePrompt({
    lessonContext: 'lesson',
    taskContext: 'task',
    personalizationBlock: null,
  })

  assert.ok(!prompt.includes('学習者の苦手分野やブロッカー'))
})
